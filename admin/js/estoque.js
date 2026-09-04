var isAdminEstoque = false;
var allProdutosEstoque = [];

function toNumberEstoque(v) {
  if (v == null) return 0;
  var s = String(v).trim();
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function renderHeadEstoque() {
  var thead = document.getElementById('estoque-thead');
  thead.innerHTML = isAdminEstoque
    ? '<tr><th>Nome</th><th>Código</th><th>NCM</th><th>Preço Unit.</th><th>Estoque</th><th></th></tr>'
    : '<tr><th>Nome</th><th>Estoque</th></tr>';
}

function renderEstoqueTable(list) {
  var tbody = document.getElementById('estoque-tbody');
  var colspan = isAdminEstoque ? 6 : 2;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="' + colspan + '">Nenhum produto cadastrado ainda.</td></tr>';
    return;
  }

  if (!isAdminEstoque) {
    tbody.innerHTML = list.map(function (p) {
      return '<tr><td>' + p.nome_produto + '</td><td>' + (p.quantidade_estoque || 0).toLocaleString('pt-BR') + '</td></tr>';
    }).join('');
    return;
  }

  tbody.innerHTML = list.map(function (p) {
    var codigoCell = p.codigo_produto ? p.codigo_produto : '<span class="badge badge-warning">Pendente</span>';
    var ncmCell = p.ncm ? p.ncm : '<span class="badge badge-warning">Pendente</span>';
    var preco = p.preco_unitario != null ? 'R$ ' + Number(p.preco_unitario).toFixed(2).replace('.', ',') : '—';
    var estoqueBaixo = (p.quantidade_estoque || 0) <= 0 ? ' <span class="badge badge-warning">Sem estoque</span>' : '';

    return '<tr>' +
      '<td>' + p.nome_produto + '</td>' +
      '<td>' + codigoCell + '</td>' +
      '<td>' + ncmCell + '</td>' +
      '<td>' + preco + '</td>' +
      '<td>' + (p.quantidade_estoque || 0).toLocaleString('pt-BR') + estoqueBaixo + '</td>' +
      '<td class="row-actions"><button data-ajustar="' + p.id + '">Ajustar</button></td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-ajustar]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var produto = allProdutosEstoque.find(function (p) { return p.id === btn.dataset.ajustar; });
      if (!produto) return;
      abrirModalAjustar(produto);
    });
  });
}

async function loadProdutosEstoque() {
  var { data, error } = await supabaseClient
    .from('produtos_catalogo')
    .select('*')
    .order('nome_produto', { ascending: true });

  if (error) {
    showToast('Erro ao carregar estoque: ' + error.message, 'error');
    return;
  }

  allProdutosEstoque = data || [];
  renderEstoqueTable(allProdutosEstoque);
}

document.getElementById('estoque-search').addEventListener('input', function (e) {
  var term = e.target.value.toLowerCase();
  var filtered = allProdutosEstoque.filter(function (p) {
    return (p.nome_produto || '').toLowerCase().includes(term) ||
      (p.codigo_produto || '').toLowerCase().includes(term);
  });
  renderEstoqueTable(filtered);
});

/* ===================== AJUSTAR QUANTIDADE (admin) ===================== */

var produtoEmAjuste = null;

function abrirModalAjustar(produto) {
  produtoEmAjuste = produto;
  document.getElementById('ajustar-produto-nome').textContent = produto.nome_produto;
  document.getElementById('ajustar-quantidade').value = produto.quantidade_estoque || 0;
  document.getElementById('ajustar-error').style.display = 'none';
  document.getElementById('modal-ajustar-estoque').classList.add('open');
}

function fecharModalAjustar() {
  document.getElementById('modal-ajustar-estoque').classList.remove('open');
  produtoEmAjuste = null;
}

var ajustarCancelarBtn = document.getElementById('ajustar-cancelar');
if (ajustarCancelarBtn) ajustarCancelarBtn.addEventListener('click', fecharModalAjustar);

var ajustarConfirmarBtn = document.getElementById('ajustar-confirmar');
if (ajustarConfirmarBtn) ajustarConfirmarBtn.addEventListener('click', async function () {
  if (!produtoEmAjuste) return;
  var errorEl = document.getElementById('ajustar-error');
  errorEl.style.display = 'none';

  var novaQuantidade = toNumberEstoque(document.getElementById('ajustar-quantidade').value);
  if (novaQuantidade < 0) {
    errorEl.textContent = 'A quantidade não pode ser negativa.';
    errorEl.style.display = 'block';
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  var { error } = await supabaseClient
    .from('produtos_catalogo')
    .update({ quantidade_estoque: novaQuantidade })
    .eq('id', produtoEmAjuste.id);

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) {
    errorEl.textContent = 'Erro ao salvar: ' + error.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Estoque atualizado.', 'ok');
  fecharModalAjustar();
  loadProdutosEstoque();
});

/* ===================== IMPORTAR NF/ROMANEIO ===================== */

var dadosExtraidos = null;
var currentUserIdEstoque = null;

function normalizarCnpjEstoque(v) {
  return (v || '').replace(/\D/g, '');
}

function arquivoParaBase64(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      // reader.result vem como "data:application/pdf;base64,XXXXX" — só a parte depois da vírgula.
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
    reader.readAsDataURL(file);
  });
}

function renderRevItemRow(item) {
  var tbody = document.getElementById('rev-itens-tbody');
  var row = document.createElement('tr');
  row.innerHTML =
    '<td><input type="text" data-f="descricao" value="' + (item.descricao || '').replace(/"/g, '&quot;') + '" style="width:100%;"></td>' +
    '<td><input type="text" data-f="codigo" value="' + (item.codigo || '') + '" style="width:90px;"></td>' +
    '<td><input type="text" data-f="ncm" value="' + (item.ncm || '') + '" style="width:90px;"></td>' +
    '<td><input type="text" inputmode="decimal" data-f="quantidade" value="' + (item.quantidade || 0) + '" style="width:70px;"></td>' +
    '<td><input type="text" inputmode="decimal" data-f="valor_unitario" value="' + (item.valor_unitario || 0) + '" style="width:90px;"></td>' +
    '<td><button type="button" class="item-remove" title="Remover">✕</button></td>';
  row.querySelector('.item-remove').addEventListener('click', function () { row.remove(); });
  tbody.appendChild(row);
}

function renderRevParcelaRow(parcela) {
  var tbody = document.getElementById('rev-parcelas-tbody');
  var row = document.createElement('tr');
  row.innerHTML =
    '<td><input type="date" data-f="vencimento" value="' + (parcela.vencimento || '') + '"></td>' +
    '<td><input type="text" inputmode="decimal" data-f="valor" value="' + (parcela.valor || 0) + '" style="width:110px;"></td>' +
    '<td><button type="button" class="item-remove" title="Remover">✕</button></td>';
  row.querySelector('.item-remove').addEventListener('click', function () { row.remove(); });
  tbody.appendChild(row);
}

var fornecedoresConhecidos = [];

function preencherCamposFornecedor(f) {
  document.getElementById('rev-cnpj').value = (f && f.cnpj_cpf) || '';
  document.getElementById('rev-razao-social').value = (f && f.razao_social) || '';
  document.getElementById('rev-nome-fantasia').value = (f && f.nome_fantasia) || '';
  document.getElementById('rev-logradouro').value = (f && f.logradouro) || '';
  document.getElementById('rev-numero').value = (f && f.numero) || '';
  document.getElementById('rev-bairro').value = (f && f.bairro) || '';
  document.getElementById('rev-cep').value = (f && f.cep) || '';
  document.getElementById('rev-municipio').value = (f && f.municipio) || '';
  document.getElementById('rev-uf').value = (f && f.uf) || '';
}

document.getElementById('rev-fornecedor-existente').addEventListener('change', function () {
  var selecionado = fornecedoresConhecidos.find(function (f) { return f.id === this.value; }, this);
  if (selecionado) preencherCamposFornecedor(selecionado);
});

async function mostrarRevisao(dados) {
  dadosExtraidos = dados;
  var forn = dados.fornecedor || {};

  preencherCamposFornecedor({
    cnpj_cpf: forn.cnpj, razao_social: forn.razao_social, nome_fantasia: forn.nome_fantasia,
    logradouro: forn.logradouro, numero: forn.numero, bairro: forn.bairro,
    cep: forn.cep, municipio: forn.municipio, uf: forn.uf
  });

  var { data: fornecedores } = await supabaseClient.from('clientes').select('*').eq('eh_fornecedor', true).order('razao_social');
  fornecedoresConhecidos = fornecedores || [];

  var selectEl = document.getElementById('rev-fornecedor-existente');
  selectEl.innerHTML = '<option value="">— Novo fornecedor —</option>' + fornecedoresConhecidos.map(function (f) {
    return '<option value="' + f.id + '">' + f.razao_social + (f.nome_fantasia ? ' (' + f.nome_fantasia + ')' : '') + '</option>';
  }).join('');

  var badgeEl = document.getElementById('import-fornecedor-badge');
  var cnpjNormalizado = normalizarCnpjEstoque(forn.cnpj);
  var match = null;

  if (cnpjNormalizado) {
    match = fornecedoresConhecidos.find(function (f) { return normalizarCnpjEstoque(f.cnpj_cpf) === cnpjNormalizado; });
  }
  if (!match && (forn.razao_social || forn.nome_fantasia)) {
    // Documento sem CNPJ (comum em romaneio) — tenta casar pelo nome com quem já está cadastrado.
    var nomeBusca = (forn.nome_fantasia || forn.razao_social || '').toLowerCase();
    match = fornecedoresConhecidos.find(function (f) {
      return (f.razao_social || '').toLowerCase().indexOf(nomeBusca) !== -1 ||
        (f.nome_fantasia || '').toLowerCase().indexOf(nomeBusca) !== -1 ||
        nomeBusca.indexOf((f.nome_fantasia || '___').toLowerCase()) !== -1;
    });
  }

  if (match) {
    selectEl.value = match.id;
    preencherCamposFornecedor(match);
    badgeEl.innerHTML = '<span class="badge badge-ok">Já cadastrado: ' + match.razao_social + '</span>';
  } else if (cnpjNormalizado) {
    badgeEl.innerHTML = '<span class="badge badge-warning">Novo fornecedor — vai ser criado</span>';
  } else {
    badgeEl.innerHTML = '<span class="badge badge-warning">Sem CNPJ no documento — selecione o fornecedor acima ou confira os dados antes de salvar</span>';
  }

  document.getElementById('rev-itens-tbody').innerHTML = '';
  (dados.itens || []).forEach(renderRevItemRow);

  document.getElementById('rev-forma-pagamento').value = (dados.pagamento && dados.pagamento.forma) || 'boleto';
  document.getElementById('rev-parcelas-tbody').innerHTML = '';
  var parcelas = (dados.pagamento && dados.pagamento.parcelas) || [];
  if (!parcelas.length) parcelas = [{ vencimento: '', valor: dados.valor_total_documento || 0 }];
  parcelas.forEach(renderRevParcelaRow);

  document.getElementById('import-erro').style.display = 'none';
  document.getElementById('import-revisao').style.display = 'block';
}

document.getElementById('import-ler-btn').addEventListener('click', async function () {
  var fileInput = document.getElementById('import-arquivo');
  var statusEl = document.getElementById('import-status');
  var file = fileInput.files[0];

  if (!file) {
    showToast('Selecione um arquivo PDF antes.', 'warning');
    return;
  }

  if (file.size > 4 * 1024 * 1024) {
    showToast('Esse PDF tem ' + (file.size / (1024 * 1024)).toFixed(1) + 'MB — o limite é 4MB. Tenta escanear com menos qualidade ou só as páginas que importam.', 'error');
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Lendo...';
  statusEl.style.display = 'block';
  statusEl.textContent = 'Lendo o documento (pode levar alguns segundos)...';
  document.getElementById('import-revisao').style.display = 'none';

  try {
    var base64 = await arquivoParaBase64(file);
    var { data: { session } } = await supabaseClient.auth.getSession();

    var resp = await fetch('/api/ler-documento-estoque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: session ? session.access_token : null, pdfBase64: base64 })
    });
    var respData = await resp.json().catch(function () { return {}; });

    if (!resp.ok) {
      statusEl.textContent = 'Erro: ' + (respData.error || 'falha ao ler o documento.') +
        (respData.debug ? ' [debug: ' + respData.debug + ']' : '');
      showToast('Não foi possível ler o documento.', 'error');
      return;
    }

    statusEl.textContent = 'Documento lido. Confira os dados abaixo antes de salvar.';
    await mostrarRevisao(respData.dados);
  } catch (err) {
    statusEl.textContent = 'Erro ao processar: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ler documento';
  }
});

document.getElementById('rev-add-item').addEventListener('click', function () {
  renderRevItemRow({ descricao: '', codigo: '', ncm: '', quantidade: 0, valor_unitario: 0 });
});
document.getElementById('rev-add-parcela').addEventListener('click', function () {
  renderRevParcelaRow({ vencimento: '', valor: 0 });
});

document.getElementById('import-cancelar-btn').addEventListener('click', function () {
  document.getElementById('import-revisao').style.display = 'none';
  document.getElementById('import-arquivo').value = '';
  document.getElementById('import-status').style.display = 'none';
  dadosExtraidos = null;
});

function lerLinhasItens() {
  return Array.from(document.querySelectorAll('#rev-itens-tbody tr')).map(function (row) {
    var get = function (f) { return row.querySelector('[data-f="' + f + '"]').value; };
    return {
      descricao: get('descricao').trim(),
      codigo: get('codigo').trim() || null,
      ncm: get('ncm').trim() || null,
      quantidade: toNumberEstoque(get('quantidade')),
      valor_unitario: toNumberEstoque(get('valor_unitario'))
    };
  }).filter(function (i) { return i.descricao; });
}

function lerLinhasParcelas() {
  return Array.from(document.querySelectorAll('#rev-parcelas-tbody tr')).map(function (row) {
    return {
      vencimento: row.querySelector('[data-f="vencimento"]').value || null,
      valor: toNumberEstoque(row.querySelector('[data-f="valor"]').value)
    };
  }).filter(function (p) { return p.valor > 0; });
}

document.getElementById('import-confirmar-btn').addEventListener('click', async function () {
  var erroEl = document.getElementById('import-erro');
  erroEl.style.display = 'none';

  var itens = lerLinhasItens();
  var parcelas = lerLinhasParcelas();

  if (!itens.length) {
    erroEl.textContent = 'Adicione ao menos um item.';
    erroEl.style.display = 'block';
    return;
  }
  if (!parcelas.length) {
    erroEl.textContent = 'Informe ao menos uma parcela de pagamento.';
    erroEl.style.display = 'block';
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    // 1) Fornecedor — usa o selecionado na tela se houver; senão casa por CNPJ;
    //    senão cria novo (mesmo sem CNPJ, comum em romaneio — dá pra completar depois em Clientes).
    var cnpj = document.getElementById('rev-cnpj').value.trim();
    var razaoSocial = document.getElementById('rev-razao-social').value.trim();
    var idSelecionado = document.getElementById('rev-fornecedor-existente').value;
    var fornecedorId = null;
    var fornecedorNome = razaoSocial || 'Fornecedor';

    if (razaoSocial || cnpj) {
      var existente = null;
      if (idSelecionado) {
        existente = fornecedoresConhecidos.find(function (f) { return f.id === idSelecionado; });
      } else if (cnpj) {
        var { data: porCnpj } = await supabaseClient.from('clientes').select('id, razao_social, nome_fantasia').eq('cnpj_cpf', cnpj).maybeSingle();
        existente = porCnpj;
      }

      var valoresFornecedor = {
        cnpj_cpf: cnpj || (existente ? existente.cnpj_cpf : null),
        razao_social: razaoSocial || (existente ? existente.razao_social : null),
        nome_fantasia: document.getElementById('rev-nome-fantasia').value.trim() || null,
        logradouro: document.getElementById('rev-logradouro').value.trim() || null,
        numero: document.getElementById('rev-numero').value.trim() || null,
        bairro: document.getElementById('rev-bairro').value.trim() || null,
        cep: document.getElementById('rev-cep').value.trim() || null,
        municipio: document.getElementById('rev-municipio').value.trim() || null,
        uf: document.getElementById('rev-uf').value.trim().toUpperCase() || null,
        eh_fornecedor: true
      };

      if (existente) {
        fornecedorId = existente.id;
        fornecedorNome = valoresFornecedor.razao_social + (existente.nome_fantasia ? ' (' + existente.nome_fantasia + ')' : '');
        await supabaseClient.from('clientes').update(valoresFornecedor).eq('id', existente.id);
      } else {
        // Nome/telefone/e-mail do contato ficam em branco de propósito — mudam a cada compra, preenchimento manual.
        valoresFornecedor.created_by = currentUserIdEstoque;
        var { data: novoFornecedor, error: erroFornecedor } = await supabaseClient.from('clientes').insert(valoresFornecedor).select().single();
        if (erroFornecedor) throw new Error('Erro ao criar fornecedor: ' + erroFornecedor.message);
        fornecedorId = novoFornecedor.id;
        fornecedorNome = valoresFornecedor.razao_social;
      }
    }

    // 2) Itens — casa com produto existente do Catálogo pelo nome; se não achar, cria novo
    //    (preço de venda fica em branco de propósito — só o custo vem da NF).
    var produtosAtuais = allProdutosEstoque.slice();
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      var existenteProduto = produtosAtuais.find(function (p) {
        return (p.nome_produto || '').trim().toLowerCase() === item.descricao.toLowerCase();
      });

      if (existenteProduto) {
        var novaQuantidade = (existenteProduto.quantidade_estoque || 0) + item.quantidade;
        await supabaseClient.from('produtos_catalogo').update({
          quantidade_estoque: novaQuantidade,
          preco_custo: item.valor_unitario || existenteProduto.preco_custo,
          codigo_produto: existenteProduto.codigo_produto || item.codigo,
          ncm: existenteProduto.ncm || item.ncm
        }).eq('id', existenteProduto.id);
        existenteProduto.quantidade_estoque = novaQuantidade;
      } else {
        var { data: novoProduto } = await supabaseClient.from('produtos_catalogo').insert({
          nome_produto: item.descricao, codigo_produto: item.codigo, ncm: item.ncm,
          quantidade_estoque: item.quantidade, preco_custo: item.valor_unitario || null,
          created_by: currentUserIdEstoque
        }).select().single();
        if (novoProduto) produtosAtuais.push(novoProduto);
      }
    }

    // 3) Financeiro — uma saída por parcela, categoria Fornecedor.
    var saidas = parcelas.map(function (p) {
      return {
        data: p.vencimento || new Date().toISOString().slice(0, 10),
        descricao: fornecedorNome + ' — compra de estoque',
        categoria: 'Fornecedor',
        valor: p.valor,
        observacao: 'Gerado a partir da leitura de NF/romaneio.',
        created_by: currentUserIdEstoque
      };
    });
    await supabaseClient.from('financeiro_saidas').insert(saidas);

    showToast('Importação concluída: fornecedor, estoque e financeiro atualizados.', 'ok');
    document.getElementById('import-revisao').style.display = 'none';
    document.getElementById('import-arquivo').value = '';
    document.getElementById('import-status').style.display = 'none';
    dadosExtraidos = null;
    loadProdutosEstoque();
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar e Salvar';
  }
});

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  isAdminEstoque = auth.profile.role !== 'vendedor';
  currentUserIdEstoque = auth.session.user.id;
  renderHeadEstoque();
  loadProdutosEstoque();
})();
