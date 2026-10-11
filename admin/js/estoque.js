var isAdminEstoque = false;
var ROLES_VENDEDOR_ESTOQUE = ['vendedor', 'vendedor_ext', 'vendedor_int'];
var allProdutosEstoque = [];
// Cada tipo de embalagem tem o seu Fator Custo (compra) e Fator Venda, gravados em
// `configuracoes` (chaves fator_custo_<tipo> / fator_venda_<tipo>) — o admin muda
// pela tela de Estoque, sem precisar de ajuda técnica. Saco PP/PE ficam de fora:
// o nome cadastrado não tem espessura, então a fórmula não se aplica.
var TIPOS_FATOR_ESTOQUE = [
  { label: 'Nylon Poli', chave: 'nylon_poli' },
  { label: 'MRP', chave: 'mrp' },
  { label: 'Termoencolhível', chave: 'termoencolhivel' }
];
var fatoresEstoque = {}; // { nylon_poli: { custo: 0, venda: 0 }, ... }

function tipoFatorDoProduto(nomeProduto) {
  var categoria = categoriaEmbalagemDoProduto(nomeProduto);
  if (!categoria) return null;
  return TIPOS_FATOR_ESTOQUE.find(function (t) { return t.label === categoria.label; }) || null;
}

async function carregarFatoresEstoque() {
  var chaves = [];
  TIPOS_FATOR_ESTOQUE.forEach(function (t) { chaves.push('fator_custo_' + t.chave, 'fator_venda_' + t.chave); });
  var { data } = await supabaseClient.from('configuracoes').select('chave, valor').in('chave', chaves);
  var porChave = {};
  (data || []).forEach(function (r) { porChave[r.chave] = toNumberEstoque(r.valor); });
  TIPOS_FATOR_ESTOQUE.forEach(function (t) {
    fatoresEstoque[t.chave] = { custo: porChave['fator_custo_' + t.chave] || 0, venda: porChave['fator_venda_' + t.chave] || 0 };
  });
}

// Custo/Venda calculados com a MESMA fórmula do Pedido (calc-vacuo.js):
// peso = larg(m) × comp(m) × espessura(µ); valor = peso × fator do tipo.
// Devolve null quando não dá pra calcular (sem as 3 medidas, tipo sem fator ou fator 0).
function calcularValorEmbalagemEstoque(nomeProduto, campo) {
  var tipo = tipoFatorDoProduto(nomeProduto);
  if (!tipo || !fatoresEstoque[tipo.chave]) return null;
  var fator = fatoresEstoque[tipo.chave][campo];
  var m = extrairMedidasVacuoDoNome(nomeProduto);
  if (!fator || !m.largura || !m.comprimento || !m.espessura) return null;
  return calcPrecoVacuo(m.largura / 100, m.comprimento / 100, m.espessura, fator);
}

function calcularPrecoVendaEmbalagemEstoque(nomeProduto) {
  return calcularValorEmbalagemEstoque(nomeProduto, 'venda');
}

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

// Margem sobre o custo: quanto o preço de venda está acima do que pagamos.
function calcularMargemPercentualEstoque(custo, venda) {
  if (!custo || custo <= 0 || venda == null) return null;
  return ((venda - custo) / custo) * 100;
}
function formatarMargemEstoque(margem) {
  if (margem == null) return '—';
  return margem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function formatarCaixasEstoque(produto) {
  var rolosPorCaixa = rolosPorCaixaDoProduto(produto.nome_produto); // regra em caixas-etiqueta.js
  if (!rolosPorCaixa) return '—';

  var qtd = produto.quantidade_estoque || 0;
  var caixas = Math.floor(qtd / rolosPorCaixa);
  var resto = qtd % rolosPorCaixa;
  return caixas + ' cx' + (resto ? ' + ' + resto : '');
}

function renderHeadEstoque() {
  var thead = document.getElementById('estoque-thead');
  thead.innerHTML = isAdminEstoque
    ? '<tr><th>Nome</th><th>Código</th><th>NCM</th><th>Custo Unit.</th><th>Venda Unit.</th><th>Margem</th><th>Estoque</th><th class="col-caixas">Caixas</th><th></th></tr>'
    : '<tr><th>Nome</th><th>Estoque</th><th class="col-caixas">Caixas</th></tr>';
}

function renderEstoqueTable(list) {
  var tbody = document.getElementById('estoque-tbody');
  var colspan = isAdminEstoque ? 9 : 3;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="' + colspan + '">Nenhum produto cadastrado ainda.</td></tr>';
    return;
  }

  if (!isAdminEstoque) {
    tbody.innerHTML = list.map(function (p) {
      var qtd = p.quantidade_estoque || 0;
      var qtdCell = qtd <= 0
        ? '<span style="color:#a92323; font-weight:600;">' + qtd.toLocaleString('pt-BR') + '</span>'
        : qtd.toLocaleString('pt-BR');
      return '<tr><td>' + p.nome_produto + '</td><td>' + qtdCell + '</td><td class="col-caixas">' + formatarCaixasEstoque(p) + '</td></tr>';
    }).join('');
    return;
  }

  tbody.innerHTML = list.map(function (p) {
    var codigoCell = p.codigo_produto ? p.codigo_produto : '<span class="badge badge-warning">Pendente</span>';
    var ncmCell = p.ncm ? p.ncm : '<span class="badge badge-warning">Pendente</span>';
    var custo = p.preco_custo != null ? 'R$ ' + Number(p.preco_custo).toFixed(2).replace('.', ',') : '—';
    var preco = p.preco_unitario != null ? 'R$ ' + Number(p.preco_unitario).toFixed(2).replace('.', ',') : '—';
    var margem = formatarMargemEstoque(calcularMargemPercentualEstoque(p.preco_custo, p.preco_unitario));
    var qtdEstoque = p.quantidade_estoque || 0;
    var estoqueCell = qtdEstoque <= 0
      ? '<span style="color:#a92323; font-weight:600;">' + qtdEstoque.toLocaleString('pt-BR') + '</span>'
      : qtdEstoque.toLocaleString('pt-BR');

    return '<tr>' +
      '<td>' + p.nome_produto + '</td>' +
      '<td>' + codigoCell + '</td>' +
      '<td>' + ncmCell + '</td>' +
      '<td>' + custo + '</td>' +
      '<td>' + preco + '</td>' +
      '<td>' + margem + '</td>' +
      '<td>' + estoqueCell + '</td>' +
      '<td class="col-caixas">' + formatarCaixasEstoque(p) + '</td>' +
      '<td class="row-actions"><button data-ajustar="' + p.id + '">Editar</button> <button data-excluir-produto="' + p.id + '" style="color:#a92323;">Excluir</button></td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-ajustar]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var produto = allProdutosEstoque.find(function (p) { return p.id === btn.dataset.ajustar; });
      if (!produto) return;
      abrirModalAjustar(produto);
    });
  });

  tbody.querySelectorAll('[data-excluir-produto]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var produto = allProdutosEstoque.find(function (p) { return p.id === btn.dataset.excluirProduto; });
      if (!produto) return;
      if (!confirm('Excluir "' + produto.nome_produto + '" do estoque? Essa ação não pode ser desfeita.')) return;

      btn.disabled = true;
      var { error } = await supabaseClient.from('produtos_catalogo').delete().eq('id', produto.id);
      if (error) {
        showToast('Erro ao excluir: ' + error.message, 'error');
        btn.disabled = false;
        return;
      }
      showToast('Produto excluído. Use "Reorganizar códigos" pra fechar o buraco na numeração.', 'ok');
      loadProdutosEstoque();
    });
  });
}

function ordenarPorCodigoEstoque(list) {
  return list.slice().sort(function (a, b) {
    var codA = a.codigo_produto, codB = b.codigo_produto;
    if (!codA && !codB) return 0;
    if (!codA) return 1;
    if (!codB) return -1;
    return codA.localeCompare(codB, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}

async function loadProdutosEstoque() {
  var { data, error } = await supabaseClient
    .from('produtos_catalogo')
    .select('*');

  if (error) {
    showToast('Erro ao carregar estoque: ' + error.message, 'error');
    return;
  }

  allProdutosEstoque = ordenarPorCodigoEstoque(data || []);
  renderEstoqueTable(allProdutosEstoque);
  if (isAdminEstoque) renderConferenciaNcm();
}

document.getElementById('estoque-search').addEventListener('input', function (e) {
  var term = e.target.value.toLowerCase();
  var filtered = allProdutosEstoque.filter(function (p) {
    return (p.nome_produto || '').toLowerCase().includes(term) ||
      (p.codigo_produto || '').toLowerCase().includes(term);
  });
  renderEstoqueTable(filtered);
});

/* ===================== PRODUTO: NOVO / EDITAR (admin) ===================== */

var produtoEmAjuste = null; // produto em edição; null = cadastrando um novo

function pesoEmbalagemEstoque(nome) {
  if (!tipoFatorDoProduto(nome)) return null;
  var m = extrairMedidasVacuoDoNome(nome);
  if (!m.largura || !m.comprimento || !m.espessura) return null;
  return calcPesoVacuo(m.largura / 100, m.comprimento / 100, m.espessura);
}

function arredondarPrecoEstoque(n) { return Math.round(n * 10000) / 10000; }

function atualizarMargemPreviewAjuste() {
  var custo = toNumberEstoque(document.getElementById('ajustar-custo').value);
  var preco = toNumberEstoque(document.getElementById('ajustar-preco').value);
  var margem = calcularMargemPercentualEstoque(custo, preco);
  document.getElementById('ajustar-margem').textContent = formatarMargemEstoque(margem);
}

// Fatores vazios recebem o padrão do tipo (card "Fatores das embalagens") e o NCM
// vazio recebe a regra do tipo (card "NCM por tipo") — nunca sobrescreve o que já está lá.
function preencherPadroesDoTipoModal() {
  var nome = document.getElementById('ajustar-nome').value;
  var tipo = tipoFatorDoProduto(nome);
  if (tipo && fatoresEstoque[tipo.chave]) {
    var fc = document.getElementById('ajustar-fator-custo'), fv = document.getElementById('ajustar-fator-venda');
    if (!fc.value && fatoresEstoque[tipo.chave].custo > 0) fc.value = fatoresEstoque[tipo.chave].custo;
    if (!fv.value && fatoresEstoque[tipo.chave].venda > 0) fv.value = fatoresEstoque[tipo.chave].venda;
  }
  var ncmEl = document.getElementById('ajustar-ncm');
  if (!ncmEl.value.trim()) {
    var sugerido = ncmAutomatico(nome);
    if (sugerido) ncmEl.value = sugerido;
  }
}

// Custo/Venda = peso × fator (mesma conta do Pedido); campo de fator vazio não mexe no valor.
function aplicarFatoresModal() {
  var peso = pesoEmbalagemEstoque(document.getElementById('ajustar-nome').value);
  var hint = document.getElementById('ajustar-peso-hint');
  if (peso == null) {
    hint.textContent = 'Fator vale só pra embalagem (Nylon Poli, MRP, Termoencolhível) com medidas no nome.';
    return;
  }
  hint.textContent = 'Peso da fórmula: ' + peso.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + ' (larg × comp × esp).';
  var fc = toNumberEstoque(document.getElementById('ajustar-fator-custo').value);
  var fv = toNumberEstoque(document.getElementById('ajustar-fator-venda').value);
  if (fc > 0) document.getElementById('ajustar-custo').value = arredondarPrecoEstoque(peso * fc);
  if (fv > 0) document.getElementById('ajustar-preco').value = arredondarPrecoEstoque(peso * fv);
  atualizarMargemPreviewAjuste();
}

async function mostrarValidacaoNcmModal() {
  var hint = document.getElementById('ajustar-ncm-hint');
  var valor = document.getElementById('ajustar-ncm').value;
  if (!valor.trim()) { hint.style.color = ''; hint.textContent = 'Preenchido sozinho pelo tipo do produto.'; return; }
  try {
    var r = await validarNcm(valor);
    hint.style.color = r.ok ? '#1a7a3c' : '#a92323';
    hint.textContent = r.ok ? '✔ ' + r.descricao : '✖ Esse NCM não existe na tabela oficial — confira o código.';
  } catch (e) { /* tabela indisponível — a validação final acontece ao salvar */ }
}

function abrirModalProduto(produto) {
  produtoEmAjuste = produto || null;
  var set = function (id, v) { document.getElementById(id).value = v; };
  document.getElementById('ajustar-titulo').textContent = produto ? 'Editar produto' : 'Novo produto';

  if (produto) {
    set('ajustar-nome', produto.nome_produto || '');
    set('ajustar-codigo', produto.codigo_produto || '');
    set('ajustar-ncm', produto.ncm || '');
    set('ajustar-fator-custo', produto.fator_custo != null ? produto.fator_custo : '');
    set('ajustar-fator-venda', produto.fator_venda != null ? produto.fator_venda : '');
    set('ajustar-custo', produto.preco_custo != null ? produto.preco_custo : '');
    set('ajustar-preco', produto.preco_unitario != null ? produto.preco_unitario : '');
    set('ajustar-quantidade', produto.quantidade_estoque || 0);
  } else {
    ['ajustar-nome', 'ajustar-ncm', 'ajustar-fator-custo', 'ajustar-fator-venda', 'ajustar-custo', 'ajustar-preco'].forEach(function (id) { set(id, ''); });
    set('ajustar-codigo', proximoCodigoSequencialEstoque(allProdutosEstoque));
    set('ajustar-quantidade', 0);
  }

  preencherPadroesDoTipoModal();
  // Ao abrir, só calcula o que ainda está vazio — nunca sobrescreve um valor já gravado.
  var custoAntes = document.getElementById('ajustar-custo').value, precoAntes = document.getElementById('ajustar-preco').value;
  aplicarFatoresModal();
  if (custoAntes) document.getElementById('ajustar-custo').value = custoAntes;
  if (precoAntes) document.getElementById('ajustar-preco').value = precoAntes;

  atualizarMargemPreviewAjuste();
  mostrarValidacaoNcmModal();
  document.getElementById('ajustar-error').style.display = 'none';
  document.getElementById('modal-ajustar-estoque').classList.add('open');
}

function abrirModalAjustar(produto) { abrirModalProduto(produto); }

document.getElementById('ajustar-custo').addEventListener('input', atualizarMargemPreviewAjuste);
document.getElementById('ajustar-preco').addEventListener('input', atualizarMargemPreviewAjuste);
document.getElementById('ajustar-fator-custo').addEventListener('input', aplicarFatoresModal);
document.getElementById('ajustar-fator-venda').addEventListener('input', aplicarFatoresModal);
document.getElementById('ajustar-ncm').addEventListener('input', mostrarValidacaoNcmModal);
document.getElementById('ajustar-nome').addEventListener('input', function () {
  preencherPadroesDoTipoModal();
  aplicarFatoresModal();
  mostrarValidacaoNcmModal();
});

var btnNovoProduto = document.getElementById('btn-novo-produto');
if (btnNovoProduto) btnNovoProduto.addEventListener('click', function () { abrirModalProduto(null); });

function fecharModalAjustar() {
  document.getElementById('modal-ajustar-estoque').classList.remove('open');
  produtoEmAjuste = null;
}

var ajustarCancelarBtn = document.getElementById('ajustar-cancelar');
if (ajustarCancelarBtn) ajustarCancelarBtn.addEventListener('click', fecharModalAjustar);

var ajustarConfirmarBtn = document.getElementById('ajustar-confirmar');
if (ajustarConfirmarBtn) ajustarConfirmarBtn.addEventListener('click', async function () {
  var errorEl = document.getElementById('ajustar-error');
  var btn = this;
  errorEl.style.display = 'none';
  var falhar = function (msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Salvar'; };

  var nome = document.getElementById('ajustar-nome').value.trim();
  if (!nome) return falhar('A descrição não pode ficar vazia.');

  var quantidade = toNumberEstoque(document.getElementById('ajustar-quantidade').value);
  if (quantidade < 0) return falhar('A quantidade não pode ser negativa.');

  var custoStr = document.getElementById('ajustar-custo').value.trim();
  var precoStr = document.getElementById('ajustar-preco').value.trim();
  var custo = custoStr ? toNumberEstoque(custoStr) : null;
  var preco = precoStr ? toNumberEstoque(precoStr) : null;
  if (custo != null && custo < 0) return falhar('O custo não pode ser negativo.');
  if (preco != null && preco < 0) return falhar('O preço de venda não pode ser negativo.');

  var fcStr = document.getElementById('ajustar-fator-custo').value.trim();
  var fvStr = document.getElementById('ajustar-fator-venda').value.trim();

  var codigo = document.getElementById('ajustar-codigo').value.trim();
  if (codigo) {
    var idAtual = produtoEmAjuste ? produtoEmAjuste.id : null;
    var repetido = allProdutosEstoque.find(function (p) { return p.id !== idAtual && (p.codigo_produto || '').trim() === codigo; });
    if (repetido) return falhar('O código ' + codigo + ' já é do produto "' + repetido.nome_produto + '". Use outro ou deixe o sugerido.');
  }

  btn.disabled = true;
  btn.textContent = 'Salvando...';

  var ncm = document.getElementById('ajustar-ncm').value.trim() || null;
  if (ncm) {
    var valNcm = null;
    try { valNcm = await validarNcm(ncm); } catch (e) { valNcm = null; }
    if (valNcm && !valNcm.ok) return falhar('Esse NCM não existe na tabela oficial — confira o código (8 dígitos).');
    if (valNcm) ncm = valNcm.formatado;
  }

  var valores = {
    nome_produto: nome, codigo_produto: codigo || null, ncm: ncm,
    fator_custo: fcStr ? toNumberEstoque(fcStr) : null, fator_venda: fvStr ? toNumberEstoque(fvStr) : null,
    preco_custo: custo, preco_unitario: preco, quantidade_estoque: quantidade
  };

  var resultado;
  if (produtoEmAjuste) {
    resultado = await supabaseClient.from('produtos_catalogo').update(valores).eq('id', produtoEmAjuste.id);
  } else {
    valores.created_by = currentUserIdEstoque;
    resultado = await supabaseClient.from('produtos_catalogo').insert(valores);
  }

  btn.disabled = false;
  btn.textContent = 'Salvar';
  if (resultado.error) return falhar('Erro ao salvar: ' + resultado.error.message);

  showToast(produtoEmAjuste ? 'Produto atualizado.' : 'Produto cadastrado.', 'ok');
  fecharModalAjustar();
  loadProdutosEstoque();
});

/* ===================== EXPORTAR / IMPORTAR EXCEL (admin) ===================== */

var PRODUTO_COLUNAS_EXCEL = ['nome_produto', 'codigo_produto', 'ncm', 'preco_custo', 'preco_unitario'];

var btnExportarProdutos = document.getElementById('btn-exportar-produtos');
if (btnExportarProdutos) btnExportarProdutos.addEventListener('click', function () {
  var linhas = allProdutosEstoque.map(function (p) {
    return {
      nome_produto: p.nome_produto || '', codigo_produto: p.codigo_produto || '', ncm: p.ncm || '',
      preco_custo: p.preco_custo != null ? p.preco_custo : '', preco_unitario: p.preco_unitario != null ? p.preco_unitario : ''
    };
  });
  baixarExcel('produtos.xlsx', linhas, PRODUTO_COLUNAS_EXCEL);
});

var btnImportarProdutos = document.getElementById('btn-importar-produtos');
if (btnImportarProdutos) btnImportarProdutos.addEventListener('click', function () {
  document.getElementById('input-importar-produtos').click();
});

var inputImportarProdutos = document.getElementById('input-importar-produtos');
if (inputImportarProdutos) inputImportarProdutos.addEventListener('change', async function (e) {
  var file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  var statusEl = document.getElementById('importar-produtos-status');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Lendo arquivo...';

  var linhas;
  try { linhas = await lerArquivoExcel(file); }
  catch (err) { statusEl.textContent = 'Erro ao ler o arquivo: ' + err.message; return; }

  var criados = 0, atualizados = 0, semNome = 0, comErro = 0, ncmInvalidos = 0;
  // Cópia local que também recebe o que for criado/atualizado neste import, pra linhas
  // repetidas do arquivo se reconhecerem entre si (e o próximo código não repetir).
  var conhecidos = allProdutosEstoque.slice();

  for (var i = 0; i < linhas.length; i++) {
    var linha = linhas[i];
    var nome = campoExcel(linha, ['nome_produto', 'Nome do Produto', 'Nome']);
    if (!nome) { semNome++; continue; }

    var codigo = campoExcel(linha, ['codigo_produto', 'Código do Produto', 'Código']);
    var ncm = campoExcel(linha, ['ncm', 'NCM']);
    var custoTexto = campoExcel(linha, ['preco_custo', 'Preço de Custo', 'Custo']);
    var precoTexto = campoExcel(linha, ['preco_unitario', 'Preço Unitário', 'Preço', 'Preço de Venda']);

    if (ncm) {
      var v = null;
      try { v = await validarNcm(ncm); } catch (err) { v = null; }
      if (v && !v.ok) { ncmInvalidos++; ncm = ''; } else if (v) { ncm = v.formatado; }
    }

    var existente = conhecidos.find(function (p) { return (p.nome_produto || '').trim().toLowerCase() === nome.toLowerCase(); });
    var values = {
      nome_produto: nome,
      codigo_produto: codigo || (existente ? existente.codigo_produto : proximoCodigoSequencialEstoque(conhecidos)),
      ncm: ncm || (existente && existente.ncm) || ncmAutomatico(nome),
      preco_custo: custoTexto ? toNumberEstoque(custoTexto) : (existente ? existente.preco_custo : null),
      preco_unitario: precoTexto ? toNumberEstoque(precoTexto) : (existente ? existente.preco_unitario : null)
    };

    var resultado;
    if (existente) {
      resultado = await supabaseClient.from('produtos_catalogo').update(values).eq('id', existente.id).select().single();
    } else {
      values.created_by = currentUserIdEstoque;
      resultado = await supabaseClient.from('produtos_catalogo').insert(values).select().single();
    }

    if (resultado.error) { comErro++; continue; }
    if (existente) { atualizados++; Object.assign(existente, resultado.data); }
    else { criados++; conhecidos.push(resultado.data); }
  }

  var partes = [];
  if (criados) partes.push(criados + ' criado(s)');
  if (atualizados) partes.push(atualizados + ' atualizado(s) por nome já existente');
  if (semNome) partes.push(semNome + ' linha(s) ignorada(s) por falta de nome');
  if (ncmInvalidos) partes.push(ncmInvalidos + ' NCM inexistente(s) ignorado(s)');
  if (comErro) partes.push(comErro + ' com erro');
  statusEl.textContent = 'Importação concluída: ' + (partes.join(', ') || 'nenhuma linha processada') + '.';
  showToast('Importação de produtos concluída.', comErro ? 'warning' : 'ok');
  await loadProdutosEstoque();
});

/* ===================== FATORES DAS EMBALAGENS (admin) ===================== */

function preencherCamposFator() {
  var selectTipo = document.getElementById('fator-tipo');
  if (!selectTipo) return;
  var f = fatoresEstoque[selectTipo.value] || { custo: 0, venda: 0 };
  document.getElementById('fator-custo').value = f.custo || '';
  document.getElementById('fator-venda').value = f.venda || '';
}

function iniciarCardFatores() {
  var selectTipo = document.getElementById('fator-tipo');
  var btnSalvar = document.getElementById('btn-salvar-fatores');
  if (!selectTipo || !btnSalvar) return; // card some pra quem não é admin

  selectTipo.innerHTML = TIPOS_FATOR_ESTOQUE.map(function (t) {
    return '<option value="' + t.chave + '">' + t.label + '</option>';
  }).join('');
  preencherCamposFator();
  selectTipo.addEventListener('change', preencherCamposFator);

  btnSalvar.addEventListener('click', async function () {
    var tipo = TIPOS_FATOR_ESTOQUE.find(function (t) { return t.chave === selectTipo.value; });
    var statusEl = document.getElementById('fatores-status');
    var custo = toNumberEstoque(document.getElementById('fator-custo').value);
    var venda = toNumberEstoque(document.getElementById('fator-venda').value);

    if (custo < 0 || venda < 0) {
      showToast('Os fatores não podem ser negativos.', 'error');
      return;
    }

    var produtosDoTipo = allProdutosEstoque.filter(function (p) {
      var t = tipoFatorDoProduto(p.nome_produto);
      return t && t.chave === tipo.chave;
    });

    if (!confirm('Salvar os fatores de ' + tipo.label + ' e recalcular ' + produtosDoTipo.length + ' produto(s)? ' +
      'O Custo Unit. e o Venda Unit. atuais deles (só dos fatores preenchidos) serão substituídos.')) return;

    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';

    var agora = new Date().toISOString();
    var { error } = await supabaseClient.from('configuracoes').upsert([
      { chave: 'fator_custo_' + tipo.chave, valor: String(custo), updated_at: agora },
      { chave: 'fator_venda_' + tipo.chave, valor: String(venda), updated_at: agora }
    ], { onConflict: 'chave' });

    if (error) {
      showToast('Erro ao salvar os fatores: ' + error.message, 'error');
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar e recalcular';
      return;
    }

    fatoresEstoque[tipo.chave] = { custo: custo, venda: venda };

    var atualizados = 0, falhas = 0;
    for (var i = 0; i < produtosDoTipo.length; i += 20) {
      var lote = produtosDoTipo.slice(i, i + 20);
      var resultados = await Promise.all(lote.map(function (p) {
        var novo = {};
        var novoCusto = calcularValorEmbalagemEstoque(p.nome_produto, 'custo');
        var novaVenda = calcularValorEmbalagemEstoque(p.nome_produto, 'venda');
        if (novoCusto != null) novo.preco_custo = novoCusto;
        if (novaVenda != null) novo.preco_unitario = novaVenda;
        // Grava o fator usado no próprio produto (aparece no Catálogo, onde dá pra ajustar por item).
        if (novoCusto != null) novo.fator_custo = custo;
        if (novaVenda != null) novo.fator_venda = venda;
        if (!Object.keys(novo).length) return Promise.resolve({ ignorado: true });
        return supabaseClient.from('produtos_catalogo').update(novo).eq('id', p.id);
      }));
      resultados.forEach(function (r) {
        if (r.ignorado) return;
        if (r.error) falhas++; else atualizados++;
      });
    }

    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar e recalcular';
    statusEl.style.display = 'block';
    statusEl.textContent = tipo.label + ': ' + atualizados + ' produto(s) recalculado(s)' + (falhas ? ', ' + falhas + ' com erro.' : '.');
    showToast('Fatores de ' + tipo.label + ' salvos.', 'ok');
    loadProdutosEstoque();
  });
}

/* ===================== REORGANIZAR CÓDIGOS (admin) ===================== */

var btnResequenciar = document.getElementById('btn-resequenciar-codigos');
if (btnResequenciar) btnResequenciar.addEventListener('click', async function () {
  if (!confirm('Renumerar os produtos em sequência (1, 2, 3...), mantendo a ordem atual e fechando os buracos? Os códigos de alguns produtos vão mudar.')) return;
  btnResequenciar.disabled = true;
  var { data, error } = await supabaseClient.rpc('resequenciar_codigos_produtos');
  btnResequenciar.disabled = false;
  if (error) { showToast('Erro ao reorganizar: ' + error.message, 'error'); return; }
  showToast(data ? data + ' código(s) ajustado(s). Numeração em sequência.' : 'A numeração já estava em sequência.', 'ok');
  loadProdutosEstoque();
});

/* ===================== NCM POR TIPO DE PRODUTO (admin) ===================== */

async function atualizarValidacaoNcm() {
  var el = document.getElementById('ncm-validacao');
  var valor = document.getElementById('ncm-valor').value;
  if (!valor.trim()) { el.textContent = ''; return null; }
  try {
    var r = await validarNcm(valor);
    if (r.ok) {
      el.style.color = '#1a7a3c';
      el.textContent = '✔ ' + r.formatado + ' existe na tabela oficial (' + r.vigencia + '): ' + r.descricao;
    } else {
      el.style.color = '#a92323';
      el.textContent = '✖ Esse NCM não existe na tabela oficial — confira o código (8 dígitos).';
    }
    return r;
  } catch (e) {
    el.style.color = 'var(--gray-400)';
    el.textContent = 'Não foi possível consultar a tabela oficial agora.';
    return null;
  }
}

async function renderConferenciaNcm() {
  var el = document.getElementById('ncm-conferencia');
  if (!el) return;
  var tabela;
  try { tabela = await carregarTabelaNcm(); } catch (e) { el.textContent = ''; return; }

  var invalidos = [], vazios = [];
  allProdutosEstoque.forEach(function (p) {
    var d = ncmSoDigitos(p.ncm);
    if (!d) vazios.push(p);
    else if (!tabela.codigos[d]) invalidos.push(p);
  });

  if (!invalidos.length && !vazios.length) {
    el.innerHTML = '<span style="color:#1a7a3c;">✔ Todos os ' + allProdutosEstoque.length + ' produtos têm NCM válido na tabela oficial (' + tabela.vigencia + ').</span>';
    return;
  }
  var linhas = function (lista) {
    return lista.slice(0, 8).map(function (p) { return p.nome_produto + (p.ncm ? ' (' + p.ncm + ')' : ''); }).join('; ') + (lista.length > 8 ? '; ...' : '');
  };
  el.innerHTML =
    (invalidos.length ? '<p style="color:#a92323;"><strong>' + invalidos.length + ' produto(s) com NCM que não existe na tabela oficial:</strong> ' + linhas(invalidos) + '</p>' : '') +
    (vazios.length ? '<p style="color:#8a6100;"><strong>' + vazios.length + ' produto(s) sem NCM:</strong> ' + linhas(vazios) + '</p>' : '') +
    '<p style="color:var(--gray-400);">Defina a regra do tipo acima e clique em "Salvar e aplicar" para corrigir todos de uma vez, ou ajuste um a um em Editar.</p>';
}

function iniciarCardNcm() {
  var selectTipo = document.getElementById('ncm-tipo');
  var btn = document.getElementById('btn-salvar-ncm');
  if (!selectTipo || !btn) return; // card some pra quem não é admin

  selectTipo.innerHTML = NCM_TIPOS.map(function (t) { return '<option value="' + t.chave + '">' + t.label + '</option>'; }).join('');
  var preencher = function () {
    document.getElementById('ncm-valor').value = ncmRegras[selectTipo.value] || '';
    atualizarValidacaoNcm();
  };
  preencher();
  selectTipo.addEventListener('change', preencher);
  document.getElementById('ncm-valor').addEventListener('input', atualizarValidacaoNcm);

  var buscaTimer = null;
  document.getElementById('ncm-busca').addEventListener('input', function (e) {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(async function () {
      var box = document.getElementById('ncm-busca-resultados');
      try {
        var achados = await buscarNcm(e.target.value);
        box.innerHTML = achados.map(function (a) {
          return '<div style="padding:4px 0;"><a href="#" data-usar-ncm="' + a.codigo + '" style="font-weight:700;">' + a.codigo + '</a> — ' + a.descricao + '</div>';
        }).join('');
        box.querySelectorAll('[data-usar-ncm]').forEach(function (link) {
          link.addEventListener('click', function (ev) {
            ev.preventDefault();
            document.getElementById('ncm-valor').value = link.dataset.usarNcm;
            atualizarValidacaoNcm();
          });
        });
      } catch (err) { box.textContent = ''; }
    }, 250);
  });

  btn.addEventListener('click', async function () {
    var tipo = NCM_TIPOS.find(function (t) { return t.chave === selectTipo.value; });
    var r = await atualizarValidacaoNcm();
    if (!r || !r.ok) { showToast('Informe um NCM que exista na tabela oficial.', 'error'); return; }

    var produtosDoTipo = allProdutosEstoque.filter(function (p) {
      var t = tipoNcmDoProduto(p.nome_produto);
      return t && t.chave === tipo.chave;
    });
    if (!confirm('Salvar o NCM ' + r.formatado + ' como regra de ' + tipo.label + ' e aplicar em ' + produtosDoTipo.length + ' produto(s) desse tipo?')) return;

    btn.disabled = true;
    var { error } = await supabaseClient.from('configuracoes').upsert(
      { chave: 'ncm_' + tipo.chave, valor: r.formatado, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
    if (error) { showToast('Erro ao salvar: ' + error.message, 'error'); btn.disabled = false; return; }
    ncmRegras[tipo.chave] = r.formatado;

    var { error: erroAplicar } = await supabaseClient.from('produtos_catalogo').update({ ncm: r.formatado })
      .in('id', produtosDoTipo.map(function (p) { return p.id; }));
    btn.disabled = false;
    if (erroAplicar) { showToast('Regra salva, mas falhou ao aplicar nos produtos: ' + erroAplicar.message, 'error'); return; }

    showToast('NCM de ' + tipo.label + ' salvo e aplicado a ' + produtosDoTipo.length + ' produto(s).', 'ok');
    await loadProdutosEstoque();
  });
}

/* ===================== IMPORTAÇÕES PENDENTES (automáticas, pasta Nfe) ===================== */

var pendentesCache = [];
var pendenteEmRevisaoId = null;

async function loadPendentes() {
  var { data, error } = await supabaseClient
    .from('estoque_importacoes_pendentes')
    .select('*')
    .in('status', ['pendente', 'erro'])
    .order('created_at', { ascending: true });

  if (error) return;
  pendentesCache = data || [];
  renderPendentes();
}

function renderPendentes() {
  var card = document.getElementById('card-pendentes');
  var lista = document.getElementById('pendentes-lista');

  if (!pendentesCache.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  lista.innerHTML = pendentesCache.map(function (p) {
    if (p.status === 'erro') {
      return '<div class="form-actions" style="justify-content:space-between; border-bottom:1px solid var(--off-white); padding:10px 0;">' +
        '<div><strong>' + p.nome_arquivo + '</strong><br><span style="color:var(--gray-400); font-size:0.85rem;">Falha na leitura: ' + (p.erro || 'erro desconhecido') + '</span></div>' +
        '<button type="button" class="btn btn-outline" data-descartar-pendente="' + p.id + '">Descartar</button>' +
      '</div>';
    }
    var forn = (p.dados && p.dados.fornecedor) || {};
    var valor = (p.dados && p.dados.valor_total_documento) || 0;
    return '<div class="form-actions" style="justify-content:space-between; border-bottom:1px solid var(--off-white); padding:10px 0;">' +
      '<div><strong>' + p.nome_arquivo + '</strong><br><span style="color:var(--gray-400); font-size:0.85rem;">' +
        (forn.razao_social || forn.nome_fantasia || 'Fornecedor não identificado') + ' — R$ ' + Number(valor).toFixed(2).replace('.', ',') +
      '</span></div>' +
      '<div>' +
        '<button type="button" class="btn btn-outline" data-descartar-pendente="' + p.id + '">Descartar</button> ' +
        '<button type="button" class="btn btn-primary" data-revisar-pendente="' + p.id + '">Revisar</button>' +
      '</div>' +
    '</div>';
  }).join('');

  lista.querySelectorAll('[data-revisar-pendente]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pendente = pendentesCache.find(function (p) { return p.id === btn.dataset.revisarPendente; });
      if (!pendente) return;
      pendenteEmRevisaoId = pendente.id;
      document.getElementById('import-status').style.display = 'none';
      mostrarRevisao(pendente.dados);
      document.getElementById('import-revisao').scrollIntoView({ behavior: 'smooth' });
    });
  });

  lista.querySelectorAll('[data-descartar-pendente]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      await supabaseClient.from('estoque_importacoes_pendentes')
        .update({ status: 'descartado', processado_em: new Date().toISOString(), processado_por: currentUserIdEstoque })
        .eq('id', btn.dataset.descartarPendente);
      if (pendenteEmRevisaoId === btn.dataset.descartarPendente) {
        pendenteEmRevisaoId = null;
        document.getElementById('import-revisao').style.display = 'none';
      }
      loadPendentes();
    });
  });
}

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

// Normaliza pra comparar descrições vindas de PDF/foto com o que já está
// cadastrado, ignorando acento, caixa e pontuação (varia bastante entre
// romaneios do mesmo fornecedor).
function normalizarNomeProdutoEstoque(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Extrai as medidas (largura/comprimento/espessura) de um nome de produto,
// como uma lista de números ordenada — "0,15 x 0,20 - 160" e "15X20X160"
// viram os dois [15,20,160]. O "0," de notação em metro (0,15 = 15cm) é
// removido antes de extrair, pra unificar os dois jeitos de escrever.
function extrairDimensoesEstoque(nome) {
  var limpo = (nome || '').replace(/0,(?=\d)/g, '');
  var nums = (limpo.match(/\d+/g) || []).map(function (n) { return parseInt(n, 10); });
  // Espessura (3º número) no catálogo vem em centésimos de mm (12 = 120 µ) e nas
  // notas em µ direto — normaliza pra µ antes de comparar.
  if (nums.length === 3 && nums[2] > 0 && nums[2] < 50) nums[2] = nums[2] * 10;
  return nums.sort(function (a, b) { return a - b; });
}

function dimensoesIguaisEstoque(a, b) {
  if (!a.length || !b.length || a.length !== b.length) return false;
  return a.every(function (n, i) { return n === b[i]; });
}

// Próximo código da nossa numeração sequencial interna (1, 2, 3...) — nunca
// o código/SKU do fornecedor, que a IA às vezes lê do documento mas não tem
// nada a ver com a nossa numeração.
function proximoCodigoSequencialEstoque(produtos) {
  var max = produtos.reduce(function (acc, p) {
    var n = parseInt(p.codigo_produto, 10);
    return !isNaN(n) && n > acc ? n : acc;
  }, 0);
  return String(max + 1);
}

// Acha o produto já cadastrado mais parecido com a descrição lida — igual
// exata primeiro. Quando a descrição tem medidas (a imensa maioria — vácuo,
// etiqueta, saco), SÓ casa se as medidas baterem certinho: nomes com as
// mesmas palavras (SACO, VÁCUO, NYLON, POLI...) mas tamanho diferente são
// produtos diferentes, então sobreposição de palavras sozinha dava falso
// positivo. Sem medida numérica clara, cai pra sobreposição de palavras
// (score >= 0.6), útil pra produtos com nome genérico (ex: "Bobina de PDV").
function encontrarProdutoParecidoEstoque(descricao, produtos) {
  var alvo = normalizarNomeProdutoEstoque(descricao);
  if (!alvo) return null;

  var exato = produtos.find(function (p) { return normalizarNomeProdutoEstoque(p.nome_produto) === alvo; });
  if (exato) return exato;

  var dimensoesAlvo = extrairDimensoesEstoque(descricao);
  if (dimensoesAlvo.length >= 2) {
    return produtos.find(function (p) {
      return dimensoesIguaisEstoque(dimensoesAlvo, extrairDimensoesEstoque(p.nome_produto));
    }) || null;
  }

  var alvoTokens = alvo.split(' ').filter(Boolean);
  if (!alvoTokens.length) return null;

  var melhor = null, melhorScore = 0;
  produtos.forEach(function (p) {
    var tokensP = normalizarNomeProdutoEstoque(p.nome_produto).split(' ').filter(Boolean);
    if (!tokensP.length) return;
    var comuns = alvoTokens.filter(function (t) { return tokensP.indexOf(t) !== -1; }).length;
    var score = comuns / Math.max(alvoTokens.length, tokensP.length);
    if (score > melhorScore) { melhorScore = score; melhor = p; }
  });
  return melhorScore >= 0.6 ? melhor : null;
}

function renderRevItemRow(item) {
  var tbody = document.getElementById('rev-itens-tbody');
  var row = document.createElement('tr');

  var sugestao = encontrarProdutoParecidoEstoque(item.descricao, allProdutosEstoque);
  var selectHtml = '<select data-f="produto_id" style="width:180px;"><option value="">— Novo produto —</option>' +
    allProdutosEstoque.map(function (p) {
      var selecionado = sugestao && sugestao.id === p.id ? ' selected' : '';
      return '<option value="' + p.id + '"' + selecionado + '>' + p.nome_produto + '</option>';
    }).join('') +
    '</select>';

  row.innerHTML =
    '<td>' + selectHtml + '</td>' +
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
  pendenteEmRevisaoId = null;
});

function lerLinhasItens() {
  return Array.from(document.querySelectorAll('#rev-itens-tbody tr')).map(function (row) {
    var get = function (f) { return row.querySelector('[data-f="' + f + '"]').value; };
    return {
      produtoId: get('produto_id') || null,
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

    // 2) Itens — usa o produto selecionado na tela (ou casado por nome/similaridade
    //    automaticamente); se não achar, cria novo (preço de venda fica em branco
    //    de propósito — só o custo vem da NF).
    var produtosAtuais = allProdutosEstoque.slice();
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      var existenteProduto = item.produtoId
        ? produtosAtuais.find(function (p) { return p.id === item.produtoId; })
        : encontrarProdutoParecidoEstoque(item.descricao, produtosAtuais);

      if (existenteProduto) {
        var novaQuantidade = (existenteProduto.quantidade_estoque || 0) + item.quantidade;
        await supabaseClient.from('produtos_catalogo').update({
          quantidade_estoque: novaQuantidade,
          preco_custo: item.valor_unitario || existenteProduto.preco_custo,
          // Só preenche Venda Unit. automático se ainda não tinha um (nunca sobrescreve
          // um preço que o admin já ajustou manualmente).
          preco_unitario: existenteProduto.preco_unitario != null ? existenteProduto.preco_unitario : calcularPrecoVendaEmbalagemEstoque(existenteProduto.nome_produto)
        }).eq('id', existenteProduto.id);
        existenteProduto.quantidade_estoque = novaQuantidade;
      } else {
        // Código é sempre o próximo da nossa sequência interna — nunca o código
        // do fornecedor no documento. NCM fica em branco (só o admin preenche;
        // a IA não deve inventar um NCM que não está escrito no documento).
        var { data: novoProduto } = await supabaseClient.from('produtos_catalogo').insert({
          nome_produto: item.descricao, codigo_produto: proximoCodigoSequencialEstoque(produtosAtuais),
          quantidade_estoque: item.quantidade, preco_custo: item.valor_unitario || null,
          ncm: ncmAutomatico(item.descricao),
          preco_unitario: calcularPrecoVendaEmbalagemEstoque(item.descricao),
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

    if (pendenteEmRevisaoId) {
      await supabaseClient.from('estoque_importacoes_pendentes')
        .update({ status: 'processado', processado_em: new Date().toISOString(), processado_por: currentUserIdEstoque })
        .eq('id', pendenteEmRevisaoId);
      pendenteEmRevisaoId = null;
      loadPendentes();
    }

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

/* ===================== EXPORTAR LISTA DE PREÇO ===================== */

var BRAND_MARK_HTML_ESTOQUE =
  '<div class="brand-mark" role="img" aria-label="HLN Embalagens e Equipamentos">' +
    '<span class="bm-label" aria-hidden="true">Embalagens</span>' +
    '<svg class="bm-arc" viewBox="0 0 200 40" aria-hidden="true">' +
      '<path d="M6 38 Q100 2 194 38"/><path d="M30 38 Q100 14 170 38"/><path d="M54 38 Q100 24 146 38"/>' +
    '</svg>' +
    '<span class="bm-hln" aria-hidden="true">HLN</span>' +
    '<svg class="bm-arc" viewBox="0 0 200 40" aria-hidden="true">' +
      '<path d="M6 2 Q100 38 194 2"/><path d="M30 2 Q100 26 170 2"/><path d="M54 2 Q100 16 146 2"/>' +
    '</svg>' +
    '<span class="bm-label" aria-hidden="true">e Equipamentos</span>' +
  '</div>';

function formatBRLEstoque(n) {
  return 'R$ ' + toNumberEstoque(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildListaPrecoHtml(produtos) {
  var dataStr = new Date().toLocaleDateString('pt-BR');
  var linhasHtml = produtos.map(function (p) {
    return '<tr>' +
      '<td>' + p.nome_produto + '</td>' +
      '<td>' + (p.codigo_produto || '—') + '</td>' +
      '<td>' + formatBRLEstoque(p.preco_unitario) + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="orcamento-via">' +
    '<div class="orcamento-header">' +
      '<div>' + BRAND_MARK_HTML_ESTOQUE +
        '<div class="orcamento-empresa-dados">' +
          'HLN Embalagens e Equipamentos<br>' +
          'CNPJ: 66.878.650/0001-42<br>' +
          'Jardim Nossa Senhora de Fátima, Americana - SP, CEP 13478-570' +
        '</div>' +
      '</div>' +
      '<div class="orcamento-titulo"><h1>LISTA DE PREÇOS</h1>Data: ' + dataStr + '</div>' +
    '</div>' +
    '<table><thead><tr><th>Produto</th><th>Código</th><th>Preço</th></tr></thead><tbody>' + linhasHtml + '</tbody></table>' +
  '</div>';
}

document.getElementById('btn-exportar-lista-preco').addEventListener('click', function () {
  var produtosComPreco = allProdutosEstoque
    .filter(function (p) { return p.preco_unitario != null; })
    .slice()
    .sort(function (a, b) { return (a.nome_produto || '').localeCompare(b.nome_produto || ''); });

  if (!produtosComPreco.length) {
    showToast('Nenhum produto com preço de venda cadastrado ainda.', 'warning');
    return;
  }

  document.getElementById('lista-preco-sheet').innerHTML = buildListaPrecoHtml(produtosComPreco);
  var tituloOriginal = document.title;
  document.title = 'Lista de Preços - Portal HLN';
  window.print();
  document.title = tituloOriginal;
});

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  isAdminEstoque = ROLES_VENDEDOR_ESTOQUE.indexOf(auth.profile.role) === -1;
  currentUserIdEstoque = auth.session.user.id;
  renderHeadEstoque();
  loadProdutosEstoque();
  if (isAdminEstoque) {
    await carregarFatoresEstoque();
    await carregarRegrasNcm();
    iniciarCardFatores();
    iniciarCardNcm();
    loadPendentes();
  }
})();
