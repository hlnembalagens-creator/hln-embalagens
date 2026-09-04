var currentUserId = null;
var currentUserRole = null;
var ROLES_VENDEDOR = ['vendedor', 'vendedor_ext', 'vendedor_int'];
var allClientes = [];

var fieldIds = [
  'codigo', 'cnpj_cpf', 'razao_social', 'nome_fantasia', 'ie',
  'logradouro', 'numero', 'complemento', 'bairro', 'cep', 'municipio', 'uf',
  'telefone_empresa', 'email_empresa', 'contato_nome', 'contato_telefone', 'contato_email',
  'forma_pagamento_padrao', 'local_entrega_preferencial', 'observacoes'
];

function getFormValues() {
  var values = {};
  fieldIds.forEach(function (id) {
    values[id] = document.getElementById(id).value.trim() || null;
  });
  return values;
}

function setFormValues(cliente) {
  fieldIds.forEach(function (id) {
    document.getElementById(id).value = cliente && cliente[id] != null ? cliente[id] : '';
  });
  document.getElementById('telefone_empresa').value = formatarTelefone(document.getElementById('telefone_empresa').value);
  document.getElementById('contato_telefone').value = formatarTelefone(document.getElementById('contato_telefone').value);
  // Vendedor não tem esse campo na tela (não pode cadastrar fornecedor).
  var tipoCadastroEl = document.getElementById('tipo_cadastro');
  if (tipoCadastroEl) tipoCadastroEl.value = (cliente && cliente.eh_fornecedor) ? 'fornecedor' : 'cliente';
}

function resetForm() {
  document.getElementById('cliente-form').reset();
  document.getElementById('cliente-id').value = '';
  var tipoCadastroElReset = document.getElementById('tipo_cadastro');
  if (tipoCadastroElReset) tipoCadastroElReset.value = 'cliente';
  document.getElementById('form-title').textContent = 'Novo cliente';
  document.getElementById('cliente-error').style.display = 'none';
  document.getElementById('cnpj-status').textContent = '';
}

function normalizarCnpj(v) {
  return (v || '').replace(/\D/g, '');
}

// Formata telefone conforme a quantidade de dígitos digitados:
// (xx) xxxx-xxxx pra fixo (10 dígitos), (xx) xxxxx-xxxx pra celular (11 dígitos).
function formatarTelefone(valor) {
  var d = (valor || '').replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return '(' + d;

  var ddd = d.slice(0, 2);
  var resto = d.slice(2);

  if (d.length <= 10) {
    var parte1 = resto.slice(0, 4);
    var parte2 = resto.slice(4, 8);
    return '(' + ddd + ') ' + parte1 + (parte2 ? '-' + parte2 : '');
  }

  var p1 = resto.slice(0, 5);
  var p2 = resto.slice(5, 9);
  return '(' + ddd + ') ' + p1 + (p2 ? '-' + p2 : '');
}

['telefone_empresa', 'contato_telefone'].forEach(function (id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', function () {
    el.value = formatarTelefone(el.value);
  });
});

var clientesComOrcamentoPendente = {};
var cnpjDuplicadoMap = {};

async function loadClientes() {
  var { data, error } = await supabaseClient
    .from('clientes')
    .select('*')
    .order('razao_social', { ascending: true });

  if (error) {
    showToast('Erro ao carregar clientes: ' + error.message, 'error');
    return;
  }

  allClientes = data || [];

  // Vendedor não enxerga cadastros de fornecedor (ex: Altisvac, Capital) — só clientes de verdade.
  if (ROLES_VENDEDOR.indexOf(currentUserRole) !== -1) {
    allClientes = allClientes.filter(function (c) { return !c.eh_fornecedor; });
  }

  var { data: pendentes } = await supabaseClient
    .from('pedidos')
    .select('cliente_id')
    .eq('tipo', 'orcamento')
    .eq('status_orcamento', 'pendente');

  clientesComOrcamentoPendente = {};
  (pendentes || []).forEach(function (p) {
    clientesComOrcamentoPendente[p.cliente_id] = (clientesComOrcamentoPendente[p.cliente_id] || 0) + 1;
  });

  cnpjDuplicadoMap = {};
  allClientes.forEach(function (c) {
    var cnpj = normalizarCnpj(c.cnpj_cpf);
    if (!cnpj) return;
    cnpjDuplicadoMap[cnpj] = (cnpjDuplicadoMap[cnpj] || 0) + 1;
  });

  renderClientesTable(allClientes);
}

function renderClientesTable(list) {
  var tbody = document.getElementById('clientes-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum cliente cadastrado ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function (c) {
    var contato = [c.contato_nome, c.contato_telefone].filter(Boolean).join(' — ') || '—';
    var pendentes = clientesComOrcamentoPendente[c.id];
    var badgePendente = pendentes ? ' <span class="badge badge-warning">' + pendentes + ' orçamento' + (pendentes > 1 ? 's' : '') + ' pendente' + (pendentes > 1 ? 's' : '') + '</span>' : '';
    var cnpjNormalizado = normalizarCnpj(c.cnpj_cpf);
    var badgeDuplicado = (cnpjNormalizado && cnpjDuplicadoMap[cnpjNormalizado] > 1) ? ' <span class="badge badge-warning">CNPJ/CPF duplicado</span>' : '';
    var badgeFornecedor = c.eh_fornecedor ? ' <span class="badge badge-ok">Fornecedor</span>' : '';
    return '<tr>' +
      '<td>' + (c.razao_social || '') + badgePendente + badgeDuplicado + badgeFornecedor + '</td>' +
      '<td>' + (c.nome_fantasia || '—') + '</td>' +
      '<td>' + (c.cnpj_cpf || '—') + '</td>' +
      '<td>' + contato + '</td>' +
      '<td class="row-actions">' +
        '<button data-historico="' + c.id + '">Histórico</button>' +
        '<button data-edit="' + c.id + '">Editar</button>' +
        (currentUserRole !== 'admin1' ? '<button data-delete="' + c.id + '" class="danger">Excluir</button>' : '') +
      '</td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-historico]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cliente = allClientes.find(function (c) { return c.id === btn.dataset.historico; });
      if (!cliente) return;
      document.getElementById('historico-cliente-nome').textContent = cliente.razao_social;
      document.getElementById('modal-historico').classList.add('open');
      loadHistoricoCliente(cliente.id, 'historico-conteudo');
    });
  });

  tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cliente = allClientes.find(function (c) { return c.id === btn.dataset.edit; });
      if (!cliente) return;
      document.getElementById('cliente-id').value = cliente.id;
      setFormValues(cliente);
      document.getElementById('form-title').textContent = 'Editar cliente';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  tbody.querySelectorAll('[data-delete]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Excluir este cliente? Essa ação não pode ser desfeita.')) return;
      var cliente = allClientes.find(function (c) { return c.id === btn.dataset.delete; });
      var { error } = await supabaseClient.from('clientes').delete().eq('id', btn.dataset.delete);
      if (error) {
        if (error.code === '23503') {
          abrirModalMerge(cliente);
        } else {
          showToast('Erro ao excluir: ' + error.message, 'error');
        }
        return;
      }
      showToast('Cliente excluído.', 'ok');
      loadClientes();
    });
  });
}

/* ===================== TRANSFERIR HISTÓRICO E EXCLUIR (duplicados) ===================== */

var clienteParaExcluir = null;

function abrirModalMerge(cliente) {
  var modalEl = document.getElementById('modal-merge-cliente');
  if (!modalEl) {
    // HTML desatualizado no cache do navegador (sem o modal novo) — evita travar o resto da tela.
    showToast('Não é possível excluir: este cliente possui pedidos/orçamentos vinculados. Atualize a página (F5) e tente novamente.', 'warning');
    return;
  }

  clienteParaExcluir = cliente;
  document.getElementById('merge-cliente-nome').textContent = cliente.razao_social || cliente.nome_fantasia || '';
  document.getElementById('merge-cliente-error').style.display = 'none';

  var destinoSelect = document.getElementById('merge-cliente-destino');
  destinoSelect.innerHTML = allClientes
    .filter(function (c) { return c.id !== cliente.id; })
    .map(function (c) {
      return '<option value="' + c.id + '">' + (c.razao_social || c.nome_fantasia || '') + (c.cnpj_cpf ? ' — ' + c.cnpj_cpf : '') + '</option>';
    }).join('');

  modalEl.classList.add('open');
}

var mergeCancelarBtn = document.getElementById('merge-cliente-cancelar');
if (mergeCancelarBtn) mergeCancelarBtn.addEventListener('click', function () {
  document.getElementById('modal-merge-cliente').classList.remove('open');
  clienteParaExcluir = null;
});

var mergeConfirmarBtn = document.getElementById('merge-cliente-confirmar');
if (mergeConfirmarBtn) mergeConfirmarBtn.addEventListener('click', async function () {
  var errorEl = document.getElementById('merge-cliente-error');
  errorEl.style.display = 'none';
  var destinoId = document.getElementById('merge-cliente-destino').value;

  if (!clienteParaExcluir || !destinoId) return;

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Transferindo...';

  var updatePedidos = await supabaseClient.from('pedidos').update({ cliente_id: destinoId }).eq('cliente_id', clienteParaExcluir.id);
  if (updatePedidos.error) {
    errorEl.textContent = 'Erro ao transferir histórico: ' + updatePedidos.error.message;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Transferir e excluir';
    return;
  }

  var deleteResult = await supabaseClient.from('clientes').delete().eq('id', clienteParaExcluir.id);
  btn.disabled = false;
  btn.textContent = 'Transferir e excluir';

  if (deleteResult.error) {
    errorEl.textContent = 'Histórico transferido, mas houve erro ao excluir o cadastro: ' + deleteResult.error.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Histórico transferido e cadastro duplicado excluído.', 'ok');
  document.getElementById('modal-merge-cliente').classList.remove('open');
  clienteParaExcluir = null;
  loadClientes();
});

var mergeSoExcluirBtn = document.getElementById('merge-cliente-so-excluir');
if (mergeSoExcluirBtn) mergeSoExcluirBtn.addEventListener('click', async function () {
  var errorEl = document.getElementById('merge-cliente-error');
  errorEl.style.display = 'none';

  if (!clienteParaExcluir) return;
  if (!confirm('Isso vai excluir também todos os pedidos/orçamentos vinculados a "' + (clienteParaExcluir.razao_social || '') + '". Essa ação não pode ser desfeita. Continuar?')) return;

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Excluindo...';

  var deletePedidos = await supabaseClient.from('pedidos').delete().eq('cliente_id', clienteParaExcluir.id);
  if (deletePedidos.error) {
    errorEl.textContent = 'Erro ao excluir pedidos vinculados: ' + deletePedidos.error.message;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Excluir mesmo assim (perde o histórico)';
    return;
  }

  var deleteResult = await supabaseClient.from('clientes').delete().eq('id', clienteParaExcluir.id);
  btn.disabled = false;
  btn.textContent = 'Excluir mesmo assim (perde o histórico)';

  if (deleteResult.error) {
    errorEl.textContent = 'Pedidos excluídos, mas houve erro ao excluir o cadastro: ' + deleteResult.error.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Cliente e histórico vinculado excluídos.', 'ok');
  document.getElementById('modal-merge-cliente').classList.remove('open');
  clienteParaExcluir = null;
  loadClientes();
});

document.getElementById('cliente-search').addEventListener('input', function (e) {
  var term = e.target.value.toLowerCase();
  var filtered = allClientes.filter(function (c) {
    return (c.razao_social || '').toLowerCase().includes(term) ||
      (c.nome_fantasia || '').toLowerCase().includes(term) ||
      (c.cnpj_cpf || '').toLowerCase().includes(term);
  });
  renderClientesTable(filtered);
});

/* ===================== EXPORTAR / IMPORTAR EXCEL ===================== */

document.getElementById('btn-exportar-clientes').addEventListener('click', function () {
  var linhas = allClientes.map(function (c) {
    var linha = {};
    fieldIds.forEach(function (id) { linha[id] = c[id] || ''; });
    return linha;
  });
  baixarExcel('clientes.xlsx', linhas, fieldIds);
});

document.getElementById('btn-importar-clientes').addEventListener('click', function () {
  document.getElementById('input-importar-clientes').click();
});

document.getElementById('input-importar-clientes').addEventListener('change', async function (e) {
  var file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  var statusEl = document.getElementById('importar-clientes-status');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Lendo arquivo...';

  var linhas;
  try {
    linhas = await lerArquivoExcel(file);
  } catch (err) {
    statusEl.textContent = 'Erro ao ler o arquivo: ' + err.message;
    return;
  }

  var criados = 0, atualizados = 0, semRazaoSocial = 0, comErro = 0;
  // Cópia local que também recebe os registros criados/atualizados durante este
  // mesmo import, pra linhas repetidas no arquivo se reconhecerem entre si
  // (allClientes só é recarregado no final, não a cada linha).
  var clientesConhecidos = allClientes.slice();

  for (var i = 0; i < linhas.length; i++) {
    var linha = linhas[i];
    var razaoSocial = campoExcel(linha, ['razao_social', 'Razão Social']);
    if (!razaoSocial) { semRazaoSocial++; continue; }

    var values = {};
    fieldIds.forEach(function (id) {
      values[id] = campoExcel(linha, [id]) || null;
    });
    values.razao_social = razaoSocial;

    var cnpjLinha = normalizarCnpj(values.cnpj_cpf);
    var existente = cnpjLinha
      ? clientesConhecidos.find(function (c) { return normalizarCnpj(c.cnpj_cpf) === cnpjLinha; })
      : null;

    var resultado;
    if (existente) {
      resultado = await supabaseClient.from('clientes').update(values).eq('id', existente.id).select().single();
    } else {
      values.created_by = currentUserId;
      resultado = await supabaseClient.from('clientes').insert(values).select().single();
    }

    if (resultado.error) { comErro++; continue; }
    if (existente) {
      atualizados++;
      Object.assign(existente, resultado.data);
    } else {
      criados++;
      clientesConhecidos.push(resultado.data);
    }
  }

  var resumoPartes = [];
  if (criados) resumoPartes.push(criados + ' criado(s)');
  if (atualizados) resumoPartes.push(atualizados + ' atualizado(s) por CNPJ/CPF já existente');
  if (semRazaoSocial) resumoPartes.push(semRazaoSocial + ' linha(s) ignorada(s) por falta de Razão Social');
  if (comErro) resumoPartes.push(comErro + ' com erro');

  statusEl.textContent = 'Importação concluída: ' + (resumoPartes.join(', ') || 'nenhuma linha processada') + '.';
  showToast('Importação de clientes concluída.', comErro ? 'warning' : 'ok');
  await loadClientes();
});

document.getElementById('btn-buscar-cnpj').addEventListener('click', async function () {
  var cnpjInput = document.getElementById('cnpj_cpf');
  var statusEl = document.getElementById('cnpj-status');
  var btn = this;

  statusEl.textContent = 'Buscando...';
  btn.disabled = true;

  try {
    var dados = await fetchCnpj(cnpjInput.value);
    document.getElementById('cnpj_cpf').value = dados.cnpj;
    document.getElementById('razao_social').value = dados.razaoSocial;
    document.getElementById('nome_fantasia').value = dados.nomeFantasia;
    document.getElementById('logradouro').value = dados.logradouro;
    document.getElementById('numero').value = dados.numero;
    document.getElementById('complemento').value = dados.complemento;
    document.getElementById('bairro').value = dados.bairro;
    document.getElementById('cep').value = dados.cep;
    document.getElementById('municipio').value = dados.municipio;
    document.getElementById('uf').value = dados.uf;
    document.getElementById('telefone_empresa').value = dados.telefone;
    document.getElementById('email_empresa').value = dados.email;
    statusEl.textContent = 'Dados encontrados na Receita Federal.';
  } catch (err) {
    statusEl.textContent = '';
    showToast(err.message, 'warning');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('cliente-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var errorEl = document.getElementById('cliente-error');
  var saveBtn = document.getElementById('cliente-save-btn');
  errorEl.style.display = 'none';

  var razaoSocial = document.getElementById('razao_social').value.trim();
  if (!razaoSocial) {
    errorEl.textContent = 'Razão Social é obrigatória.';
    errorEl.style.display = 'block';
    return;
  }

  var values = getFormValues();
  var clienteId = document.getElementById('cliente-id').value;
  var tipoCadastroSubmit = document.getElementById('tipo_cadastro');
  if (tipoCadastroSubmit) {
    values.eh_fornecedor = tipoCadastroSubmit.value === 'fornecedor';
  } else {
    // Vendedor não tem esse campo — preserva o valor que já estava salvo (nunca cria
    // fornecedor, mas também nunca rebaixa um fornecedor existente sem querer).
    var clienteOriginal = clienteId ? allClientes.find(function (c) { return c.id === clienteId; }) : null;
    values.eh_fornecedor = clienteOriginal ? !!clienteOriginal.eh_fornecedor : false;
  }

  var cnpjDigitado = normalizarCnpj(values.cnpj_cpf);
  if (cnpjDigitado) {
    var jaExiste = allClientes.find(function (c) {
      return c.id !== clienteId && normalizarCnpj(c.cnpj_cpf) === cnpjDigitado;
    });
    if (jaExiste) {
      errorEl.textContent = 'Já existe um cliente cadastrado com esse CNPJ/CPF: ' + (jaExiste.razao_social || jaExiste.nome_fantasia || '') + '. Verifique antes de salvar para evitar cadastro duplicado.';
      errorEl.style.display = 'block';
      return;
    }
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';
  var result;

  if (clienteId) {
    result = await supabaseClient.from('clientes').update(values).eq('id', clienteId);
  } else {
    values.created_by = currentUserId;
    result = await supabaseClient.from('clientes').insert(values);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Salvar cliente';

  if (result.error) {
    errorEl.textContent = 'Erro ao salvar: ' + result.error.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Cliente salvo com sucesso.', 'ok');
  resetForm();
  loadClientes();
});

document.getElementById('cliente-cancel-btn').addEventListener('click', resetForm);

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  currentUserId = auth.session.user.id;
  currentUserRole = auth.profile.role;
  loadClientes();
})();

/* ===================== HISTÓRICO DE COMPRAS ===================== */
/* loadHistoricoCliente() vem de js/historico.js (compartilhado com pedido.html) */

var historicoBtnFechar = document.getElementById('historico-btn-fechar');
if (historicoBtnFechar) historicoBtnFechar.addEventListener('click', function () {
  document.getElementById('modal-historico').classList.remove('open');
});
