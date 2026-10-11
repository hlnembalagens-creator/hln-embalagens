var currentUserId = null;
var currentUserRole = null;
var allProdutos = [];

// Aceita números no formato brasileiro (vírgula decimal, ponto de milhar).
function toNumber(v) {
  if (v == null) return 0;
  var s = String(v).trim();
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function resetProdutoForm() {
  document.getElementById('produto-form').reset();
  document.getElementById('produto-id').value = '';
  document.getElementById('form-title').textContent = 'Novo produto';
  document.getElementById('produto-error').style.display = 'none';
  atualizarMargemReadout();
}

// Margem sobre o custo: quanto o preço de venda está acima do que pagamos.
function calcularMargemPercentual(custo, venda) {
  if (!custo || custo <= 0 || venda == null) return null;
  return ((venda - custo) / custo) * 100;
}

function formatarMargem(margem) {
  if (margem == null) return '—';
  return margem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function atualizarMargemReadout() {
  var custo = toNumber(document.getElementById('preco_custo').value);
  var venda = toNumber(document.getElementById('preco_unitario').value);
  document.getElementById('margem-readout').textContent = formatarMargem(calcularMargemPercentual(custo, venda));
}

document.getElementById('preco_custo').addEventListener('input', atualizarMargemReadout);
document.getElementById('preco_unitario').addEventListener('input', atualizarMargemReadout);

/* ===================== NCM automático pelo tipo do produto ===================== */

async function mostrarValidacaoNcmCatalogo() {
  var hint = document.getElementById('ncm-hint');
  var valor = document.getElementById('ncm').value;
  if (!valor.trim()) { hint.textContent = 'Preenchido sozinho pelo tipo do produto (regra em Estoque).'; hint.style.color = ''; return null; }
  try {
    var r = await validarNcm(valor);
    hint.style.color = r.ok ? '#1a7a3c' : '#a92323';
    hint.textContent = r.ok ? '✔ ' + r.descricao : '✖ Esse NCM não existe na tabela oficial — confira o código.';
    return r;
  } catch (e) { return null; }
}

// Só preenche se o campo está vazio — nunca sobrescreve o que já está digitado/gravado.
function preencherNcmAutomatico() {
  var campo = document.getElementById('ncm');
  if (!campo.value.trim()) {
    var sugerido = ncmAutomatico(document.getElementById('nome_produto').value);
    if (sugerido) campo.value = sugerido;
  }
  mostrarValidacaoNcmCatalogo();
}
document.getElementById('ncm').addEventListener('input', mostrarValidacaoNcmCatalogo);

/* ===================== FATOR (embalagem) — mesma conta do Pedido ===================== */

// Fatores padrão de cada tipo (definidos em Estoque > Fatores das embalagens).
var CHAVES_TIPO_FATOR = { 'Nylon Poli': 'nylon_poli', 'MRP': 'mrp', 'Termoencolhível': 'termoencolhivel' };
var fatoresPadraoTipo = {};

async function carregarFatoresPadraoTipo() {
  var chaves = [];
  Object.keys(CHAVES_TIPO_FATOR).forEach(function (k) { chaves.push('fator_custo_' + CHAVES_TIPO_FATOR[k], 'fator_venda_' + CHAVES_TIPO_FATOR[k]); });
  var { data } = await supabaseClient.from('configuracoes').select('chave, valor').in('chave', chaves);
  (data || []).forEach(function (r) { fatoresPadraoTipo[r.chave] = toNumber(r.valor); });
}

// Peso da fórmula do Pedido (larg(m) × comp(m) × espessura(µ)) lido do nome do produto.
// Só existe pra embalagem com as 3 medidas no nome — Saco PP/PE e demais produtos voltam null.
function pesoDaEmbalagem(nome) {
  var categoria = categoriaEmbalagemDoProduto(nome);
  if (!categoria || !CHAVES_TIPO_FATOR[categoria.label]) return null;
  var m = extrairMedidasVacuoDoNome(nome);
  if (!m.largura || !m.comprimento || !m.espessura) return null;
  return calcPesoVacuo(m.largura / 100, m.comprimento / 100, m.espessura);
}

function arredondarPreco(n) { return Math.round(n * 10000) / 10000; }

// Recalcula Custo/Venda a partir dos fatores preenchidos (campo vazio = não mexe).
function aplicarFatores() {
  var peso = pesoDaEmbalagem(document.getElementById('nome_produto').value);
  var hint = document.getElementById('peso-readout-hint');
  if (peso == null) {
    hint.textContent = 'Fator vale só pra embalagem (Nylon Poli, MRP, Termoencolhível) com largura x comprimento x espessura no nome.';
    return;
  }
  hint.textContent = 'Peso da fórmula: ' + peso.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + ' (larg × comp × esp). Custo = peso × fator.';
  var fatorCusto = toNumber(document.getElementById('fator_custo').value);
  var fatorVenda = toNumber(document.getElementById('fator_venda').value);
  if (fatorCusto > 0) document.getElementById('preco_custo').value = arredondarPreco(peso * fatorCusto);
  if (fatorVenda > 0) document.getElementById('preco_unitario').value = arredondarPreco(peso * fatorVenda);
  atualizarMargemReadout();
}

// Preenche os fatores vazios com o padrão do tipo (ex: Fator Venda do MRP definido em Estoque).
function preencherFatoresPadraoDoTipo() {
  var categoria = categoriaEmbalagemDoProduto(document.getElementById('nome_produto').value);
  var chave = categoria ? CHAVES_TIPO_FATOR[categoria.label] : null;
  if (!chave) return;
  if (!document.getElementById('fator_custo').value && fatoresPadraoTipo['fator_custo_' + chave] > 0) {
    document.getElementById('fator_custo').value = fatoresPadraoTipo['fator_custo_' + chave];
  }
  if (!document.getElementById('fator_venda').value && fatoresPadraoTipo['fator_venda_' + chave] > 0) {
    document.getElementById('fator_venda').value = fatoresPadraoTipo['fator_venda_' + chave];
  }
}

document.getElementById('fator_custo').addEventListener('input', aplicarFatores);
document.getElementById('fator_venda').addEventListener('input', aplicarFatores);
document.getElementById('nome_produto').addEventListener('input', function () {
  preencherFatoresPadraoDoTipo();
  aplicarFatores();
  preencherNcmAutomatico();
});

async function loadProdutos() {
  var { data, error } = await supabaseClient
    .from('produtos_catalogo')
    .select('*')
    .order('nome_produto', { ascending: true });

  if (error) {
    showToast('Erro ao carregar catálogo: ' + error.message, 'error');
    return;
  }

  // Exibe em ordem de código (1, 2, 3...) — numérico, não alfabético; sem código vão pro fim.
  allProdutos = (data || []).slice().sort(function (a, b) {
    var ca = parseInt(a.codigo_produto, 10), cb = parseInt(b.codigo_produto, 10);
    if (isNaN(ca) && isNaN(cb)) return (a.nome_produto || '').localeCompare(b.nome_produto || '');
    if (isNaN(ca)) return 1;
    if (isNaN(cb)) return -1;
    return ca - cb;
  });
  renderProdutosTable(allProdutos);
  preencherProximoCodigo();
}

// Produto novo já abre com o próximo código da sequência (maior código usado + 1);
// dá pra trocar à mão. Produto em edição nunca é mexido.
function preencherProximoCodigo() {
  if (document.getElementById('produto-id').value) return;
  var campo = document.getElementById('codigo_produto');
  if (campo.value) return;
  var maior = allProdutos.reduce(function (acc, p) {
    var n = parseInt(p.codigo_produto, 10);
    return !isNaN(n) && n > acc ? n : acc;
  }, 0);
  campo.value = String(maior + 1);
}

function renderProdutosTable(list) {
  var tbody = document.getElementById('produtos-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7">Nenhum produto cadastrado ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function (p) {
    var codigoCell = p.codigo_produto
      ? p.codigo_produto
      : '<span class="badge badge-warning">Pendente</span>';
    var ncmCell = p.ncm
      ? p.ncm
      : '<span class="badge badge-warning">Pendente</span>';
    var custo = p.preco_custo != null ? 'R$ ' + Number(p.preco_custo).toFixed(2).replace('.', ',') : '—';
    var preco = p.preco_unitario != null
      ? 'R$ ' + Number(p.preco_unitario).toFixed(2).replace('.', ',')
      : '—';
    var margem = formatarMargem(calcularMargemPercentual(p.preco_custo, p.preco_unitario));

    return '<tr>' +
      '<td>' + p.nome_produto + '</td>' +
      '<td>' + codigoCell + '</td>' +
      '<td>' + ncmCell + '</td>' +
      '<td>' + custo + '</td>' +
      '<td>' + preco + '</td>' +
      '<td>' + margem + '</td>' +
      '<td class="row-actions">' +
        '<button data-edit="' + p.id + '">Editar</button>' +
        (currentUserRole !== 'admin1' ? '<button data-delete="' + p.id + '" class="danger">Excluir</button>' : '') +
      '</td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var produto = allProdutos.find(function (p) { return p.id === btn.dataset.edit; });
      if (!produto) return;
      document.getElementById('produto-id').value = produto.id;
      document.getElementById('nome_produto').value = produto.nome_produto || '';
      document.getElementById('codigo_produto').value = produto.codigo_produto || '';
      document.getElementById('ncm').value = produto.ncm || '';
      document.getElementById('preco_custo').value = produto.preco_custo != null ? produto.preco_custo : '';
      document.getElementById('preco_unitario').value = produto.preco_unitario != null ? produto.preco_unitario : '';
      document.getElementById('fator_custo').value = produto.fator_custo != null ? produto.fator_custo : '';
      document.getElementById('fator_venda').value = produto.fator_venda != null ? produto.fator_venda : '';
      preencherFatoresPadraoDoTipo();
      // Só calcula sozinho o que ainda está vazio — nunca sobrescreve um valor já gravado ao abrir.
      var custoAntes = document.getElementById('preco_custo').value, vendaAntes = document.getElementById('preco_unitario').value;
      aplicarFatores();
      if (custoAntes) document.getElementById('preco_custo').value = custoAntes;
      if (vendaAntes) document.getElementById('preco_unitario').value = vendaAntes;
      atualizarMargemReadout();
      document.getElementById('form-title').textContent = 'Editar produto';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  tbody.querySelectorAll('[data-delete]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Excluir este produto do catálogo?')) return;
      var { error } = await supabaseClient.from('produtos_catalogo').delete().eq('id', btn.dataset.delete);
      if (error) {
        if (error.code === '23503') {
          showToast('Não foi possível excluir: esse produto ainda está vinculado a um pedido antigo.', 'error');
        } else {
          showToast('Erro ao excluir: ' + error.message, 'error');
        }
        return;
      }
      showToast('Produto excluído.', 'ok');
      loadProdutos();
    });
  });
}

/* ===================== EXPORTAR / IMPORTAR EXCEL ===================== */

var PRODUTO_COLUNAS_EXCEL = ['nome_produto', 'codigo_produto', 'ncm', 'preco_custo', 'preco_unitario'];

document.getElementById('btn-exportar-produtos').addEventListener('click', function () {
  var linhas = allProdutos.map(function (p) {
    return {
      nome_produto: p.nome_produto || '',
      codigo_produto: p.codigo_produto || '',
      ncm: p.ncm || '',
      preco_custo: p.preco_custo != null ? p.preco_custo : '',
      preco_unitario: p.preco_unitario != null ? p.preco_unitario : ''
    };
  });
  baixarExcel('catalogo.xlsx', linhas, PRODUTO_COLUNAS_EXCEL);
});

document.getElementById('btn-importar-produtos').addEventListener('click', function () {
  document.getElementById('input-importar-produtos').click();
});

document.getElementById('input-importar-produtos').addEventListener('change', async function (e) {
  var file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  var statusEl = document.getElementById('importar-produtos-status');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Lendo arquivo...';

  var linhas;
  try {
    linhas = await lerArquivoExcel(file);
  } catch (err) {
    statusEl.textContent = 'Erro ao ler o arquivo: ' + err.message;
    return;
  }

  var criados = 0, atualizados = 0, semNome = 0, comErro = 0;
  // Cópia local que também recebe os registros criados/atualizados durante este
  // mesmo import, pra linhas repetidas no arquivo se reconhecerem entre si
  // (allProdutos só é recarregado no final, não a cada linha).
  var produtosConhecidos = allProdutos.slice();

  for (var i = 0; i < linhas.length; i++) {
    var linha = linhas[i];
    var nome = campoExcel(linha, ['nome_produto', 'Nome do Produto', 'Nome']);
    if (!nome) { semNome++; continue; }

    var codigo = campoExcel(linha, ['codigo_produto', 'Código do Produto', 'Código']);
    var ncm = campoExcel(linha, ['ncm', 'NCM']);
    var custoTexto = campoExcel(linha, ['preco_custo', 'Preço de Custo', 'Custo']);
    var custo = custoTexto ? toNumber(custoTexto) : null;
    var precoTexto = campoExcel(linha, ['preco_unitario', 'Preço Unitário', 'Preço', 'Preço de Venda']);
    var preco = precoTexto ? toNumber(precoTexto) : null;

    var existente = produtosConhecidos.find(function (p) {
      return (p.nome_produto || '').trim().toLowerCase() === nome.toLowerCase();
    });

    var values = {
      nome_produto: nome, codigo_produto: codigo || null, ncm: ncm || null, preco_custo: custo, preco_unitario: preco
    };

    var resultado;
    if (existente) {
      resultado = await supabaseClient.from('produtos_catalogo').update(values).eq('id', existente.id).select().single();
    } else {
      values.created_by = currentUserId;
      resultado = await supabaseClient.from('produtos_catalogo').insert(values).select().single();
    }

    if (resultado.error) { comErro++; continue; }
    if (existente) {
      atualizados++;
      Object.assign(existente, resultado.data);
    } else {
      criados++;
      produtosConhecidos.push(resultado.data);
    }
  }

  var resumoPartes = [];
  if (criados) resumoPartes.push(criados + ' criado(s)');
  if (atualizados) resumoPartes.push(atualizados + ' atualizado(s) por nome já existente');
  if (semNome) resumoPartes.push(semNome + ' linha(s) ignorada(s) por falta de nome');
  if (comErro) resumoPartes.push(comErro + ' com erro');

  statusEl.textContent = 'Importação concluída: ' + (resumoPartes.join(', ') || 'nenhuma linha processada') + '.';
  showToast('Importação de produtos concluída.', comErro ? 'warning' : 'ok');
  await loadProdutos();
});

document.getElementById('produto-search').addEventListener('input', function (e) {
  var term = e.target.value.toLowerCase();
  var filtered = allProdutos.filter(function (p) {
    return (p.nome_produto || '').toLowerCase().includes(term) ||
      (p.codigo_produto || '').toLowerCase().includes(term);
  });
  renderProdutosTable(filtered);
});

document.getElementById('produto-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var errorEl = document.getElementById('produto-error');
  var saveBtn = document.getElementById('produto-save-btn');
  errorEl.style.display = 'none';

  var nome = document.getElementById('nome_produto').value.trim();
  if (!nome) {
    errorEl.textContent = 'Nome do Produto é obrigatório.';
    errorEl.style.display = 'block';
    return;
  }

  var codigo = document.getElementById('codigo_produto').value.trim();
  var ncm = document.getElementById('ncm').value.trim();
  if (ncm) {
    var valNcm = null;
    try { valNcm = await validarNcm(ncm); } catch (e) { valNcm = null; }
    if (valNcm && !valNcm.ok) {
      errorEl.textContent = 'Esse NCM não existe na tabela oficial — confira o código (8 dígitos) ou deixe em branco.';
      errorEl.style.display = 'block';
      return;
    }
    if (valNcm) ncm = valNcm.formatado;
  }

  if (!codigo || !ncm) {
    var faltando = [];
    if (!codigo) faltando.push('Código do Produto');
    if (!ncm) faltando.push('NCM');
    showToast('Lembre de preencher depois: ' + faltando.join(' e ') + '.', 'warning');
  }

  var values = {
    nome_produto: nome,
    codigo_produto: codigo || null,
    ncm: ncm || null,
    preco_custo: document.getElementById('preco_custo').value ? toNumber(document.getElementById('preco_custo').value) : null,
    preco_unitario: document.getElementById('preco_unitario').value ? toNumber(document.getElementById('preco_unitario').value) : null,
    fator_custo: document.getElementById('fator_custo').value ? toNumber(document.getElementById('fator_custo').value) : null,
    fator_venda: document.getElementById('fator_venda').value ? toNumber(document.getElementById('fator_venda').value) : null
  };

  var produtoId = document.getElementById('produto-id').value;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';

  var result;
  if (produtoId) {
    result = await supabaseClient.from('produtos_catalogo').update(values).eq('id', produtoId);
  } else {
    values.created_by = currentUserId;
    result = await supabaseClient.from('produtos_catalogo').insert(values);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Salvar produto';

  if (result.error) {
    errorEl.textContent = 'Erro ao salvar: ' + result.error.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Produto salvo com sucesso.', 'ok');
  resetProdutoForm();
  loadProdutos();
});

document.getElementById('produto-cancel-btn').addEventListener('click', function () {
  resetProdutoForm();
  preencherProximoCodigo();
});

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  currentUserId = auth.session.user.id;
  currentUserRole = auth.profile.role;
  await carregarFatoresPadraoTipo();
  await carregarRegrasNcm();
  loadProdutos();
})();
