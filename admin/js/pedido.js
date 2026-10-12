var currentUserId = null;
var currentUserRole = null;
var ROLES_VENDEDOR = ['vendedor', 'vendedor_ext', 'vendedor_int'];
var clientesCache = [];
var catalogoCache = [];
var selectedCliente = null;
var vacuoItems = [];
var geraisItems = [];
var valorTotalManuallyEdited = false;
var valorVistaManuallyEdited = false;
var pedidoEmEdicaoId = null;
var fatorPadraoVacuo = 0;

// Vendedor trabalha com o Fator padrão da empresa, fechado — só admin/ADM1
// pode digitar um valor diferente (ex: numa negociação especial).
function fatorTravadoParaRole() {
  return ROLES_VENDEDOR.indexOf(currentUserRole) !== -1;
}

// Fator de venda de cada tipo de embalagem (definido pelo admin em Estoque > Fatores das
// embalagens). O vendedor não digita: o fator acompanha o material do item.
var fatoresVendaTipo = {};
var fatoresCustoTipo = {};

function ehPedidoParaFornecedor() {
  return !!(selectedCliente && selectedCliente.eh_fornecedor);
}

function chaveTipoPorMaterial(material) {
  var m = (material || '').toLowerCase();
  if (m.indexOf('mrp') !== -1) return 'mrp';
  if (m.indexOf('term') !== -1) return 'termoencolhivel';
  if (m.indexOf('nylon') !== -1 || m.indexOf('nyon') !== -1 || m.indexOf('poli') !== -1) return 'nylon_poli';
  return null;
}

// Fator do tipo de embalagem; sem fator definido (ou material de outro tipo), cai no Fator padrão.
function fatorParaMaterial(material) {
  var chave = chaveTipoPorMaterial(material);
  // Pedido pra fornecedor (ex: Altisvac) é uma COMPRA: vale o fator de compra, não o de venda.
  var tabela = ehPedidoParaFornecedor() ? fatoresCustoTipo : fatoresVendaTipo;
  var fator = chave ? tabela[chave] : 0;
  return fator > 0 ? fator : fatorPadraoVacuo;
}

// Troca de cliente (comprador <-> fornecedor): refaz o fator dos itens de vácuo que ninguém ajustou à mão.
function reaplicarFatoresVacuo() {
  vacuoItems.forEach(function (item) {
    if (item._fatorEditado) return;
    item.taxa_preco_peso = fatorParaMaterial(item.material);
    var row = document.querySelector('#vacuo-items .item-row[data-id="' + item._id + '"]');
    if (row) {
      row.querySelector('[data-f="taxa_preco_peso"]').value = item.taxa_preco_peso;
      updateVacuoRowReadout(row, item);
    }
  });
}

async function carregarFatoresVendaTipo() {
  var { data } = await supabaseClient.from('configuracoes').select('chave, valor').in('chave', ['fator_venda_nylon_poli', 'fator_venda_mrp', 'fator_venda_termoencolhivel', 'fator_custo_nylon_poli', 'fator_custo_mrp', 'fator_custo_termoencolhivel']);
  (data || []).forEach(function (r) {
    if (r.chave.indexOf('fator_venda_') === 0) fatoresVendaTipo[r.chave.replace('fator_venda_', '')] = toNumber(r.valor);
    else fatoresCustoTipo[r.chave.replace('fator_custo_', '')] = toNumber(r.valor);
  });
}

async function carregarFatorPadrao() {
  var { data } = await supabaseClient.from('configuracoes').select('valor').eq('chave', 'fator_padrao_vacuo').maybeSingle();
  fatorPadraoVacuo = data ? toNumber(data.valor) : 0;

  var inputPadrao = document.getElementById('fator-padrao-input');
  if (inputPadrao) inputPadrao.value = fatorPadraoVacuo || '';
}

// Normaliza telefone de cliente (com ou sem DDI) pro formato que a API do WhatsApp espera.
function telefoneParaWhatsapp(telefone) {
  var digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length <= 11) digitos = '55' + digitos;
  return digitos;
}

function uid() {
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Aceita números no formato brasileiro (vírgula decimal, ponto de milhar) —
// ex: "1.000,00" ou "0,20" — além do formato com ponto, e valores já numéricos.
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

function formatBRL(n) {
  return 'R$ ' + toNumber(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcVacuo(item) {
  var peso = calcPesoVacuo(item.largura_m, item.comprimento_m, item.espessura_micras);
  var pesoTotal = peso * item.quantidade;
  var vlUnitario = peso * item.taxa_preco_peso;
  var vlTotal = item.quantidade * vlUnitario;
  return { peso: peso, peso_total: pesoTotal, vl_unitario: vlUnitario, vl_total: vlTotal };
}

/* ===================== VENDEDOR RESPONSÁVEL ===================== */
// Normalmente o pedido fica em nome de quem salvou, mas um admin pode lançar
// a venda em nome de outro vendedor (o seletor só aparece pra admin/ADM1).

var vendedoresCache = [];

async function loadVendedoresSelect() {
  var select = document.getElementById('vendedor_responsavel');
  if (!select) return;

  var { data, error } = await supabaseClient.from('profiles').select('id, nome_exibicao, role').order('nome_exibicao');
  if (error) return;
  vendedoresCache = data || [];

  // Só entra quem realmente é vendedor (Ext/Int) — sócios (admin/ADM1) não
  // aparecem aqui, essa lista é só pra creditar a venda a um vendedor de verdade.
  select.innerHTML = '<option value="">— Eu mesmo —</option>' + vendedoresCache
    .filter(function (p) { return p.id !== currentUserId && ROLES_VENDEDOR.indexOf(p.role) !== -1; })
    .map(function (p) { return '<option value="' + p.id + '">' + p.nome_exibicao + '</option>'; })
    .join('');
}

function obterVendedorResponsavelId() {
  var select = document.getElementById('vendedor_responsavel');
  return (select && select.value) ? select.value : currentUserId;
}

/* ===================== CLIENTE ===================== */

async function loadClientesSelect() {
  var { data, error } = await supabaseClient.from('clientes').select('*').order('razao_social');
  if (error) { showToast('Erro ao carregar clientes: ' + error.message, 'error'); return; }
  clientesCache = data || [];

  // Vendedor não faz pedido "pra" um fornecedor (ex: Altisvac) — isso é coisa de admin/estoque.
  if (ROLES_VENDEDOR.indexOf(currentUserRole) !== -1) {
    clientesCache = clientesCache.filter(function (c) { return !c.eh_fornecedor; });
  }

  var select = document.getElementById('select-cliente');
  select.innerHTML = '<option value="">— Selecione —</option>' + clientesCache.map(function (c) {
    return '<option value="' + c.id + '">' + c.razao_social + (c.nome_fantasia ? ' (' + c.nome_fantasia + ')' : '') + '</option>';
  }).join('');
}

function atualizarCampoNfNumero() {
  document.getElementById('campo-nf-numero').style.display = document.getElementById('nf_emitida').checked ? '' : 'none';
}
document.getElementById('nf_emitida').addEventListener('change', atualizarCampoNfNumero);

// Pedido pra Altisvac sai numa planilha padrão — o botão de exportar só aparece
// quando o cliente selecionado é a Altisvac.
function atualizarModoAltisvac() {
  var ehAltisvac = ehClienteAltisvac(selectedCliente);
  document.getElementById('btn-exportar-altisvac').style.display = ehAltisvac ? '' : 'none';
  document.getElementById('aviso-altisvac').style.display = ehAltisvac ? 'block' : 'none';
}

document.getElementById('btn-exportar-altisvac').addEventListener('click', async function () {
  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try {
    await exportarPlanilhaAltisvac(vacuoItems);
    showToast('Planilha gerada. Confira o arquivo baixado.', 'ok');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Exportar planilha Altisvac';
  }
});

document.getElementById('select-cliente').addEventListener('change', function (e) {
  var id = e.target.value;
  selectedCliente = clientesCache.find(function (c) { return c.id === id; }) || null;
  atualizarModoAltisvac();
  renderGeraisItems(); // fornecedor de etiqueta troca a quantidade pra caixas
  reaplicarFatoresVacuo(); // fornecedor usa fator de compra
  updateTotals(); // fornecedor com IPI no cadastro muda o total
  var resumo = document.getElementById('cliente-resumo');

  if (!selectedCliente) {
    resumo.style.display = 'none';
    document.getElementById('alerta-orcamento-pendente').style.display = 'none';
    return;
  }

  var enderecoPartes = [
    selectedCliente.logradouro, selectedCliente.numero, selectedCliente.complemento,
    selectedCliente.bairro, selectedCliente.municipio, selectedCliente.uf
  ].filter(Boolean).join(', ');

  document.getElementById('cliente-resumo-texto').innerHTML =
    '<strong>' + selectedCliente.razao_social + '</strong><br>' +
    (enderecoPartes ? enderecoPartes + '<br>' : '') +
    (selectedCliente.cnpj_cpf ? 'CNPJ/CPF: ' + selectedCliente.cnpj_cpf + '<br>' : '') +
    (selectedCliente.contato_nome ? 'Contato: ' + selectedCliente.contato_nome +
      (selectedCliente.contato_telefone ? ' — ' + selectedCliente.contato_telefone : '') + '<br>' : '') +
    (selectedCliente.local_entrega_preferencial ? '<strong>Entregar em:</strong> ' + selectedCliente.local_entrega_preferencial + '<br>' : '') +
    (selectedCliente.observacoes ? '<strong>Observações:</strong> ' + selectedCliente.observacoes + '<br>' : '');
  resumo.style.display = 'block';

  // Pré-preenche a forma de pagamento com a particularidade cadastrada do cliente
  if (selectedCliente.forma_pagamento_padrao) {
    var formaSelect = document.getElementById('forma_pagamento');
    formaSelect.value = selectedCliente.forma_pagamento_padrao;
    formaSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  atualizarAlertaOrcamentosPendentes();
});

/* ===================== HISTÓRICO DE COMPRAS + ALERTA DE ORÇAMENTO PENDENTE ===================== */

document.getElementById('btn-ver-historico').addEventListener('click', function () {
  if (!selectedCliente) return;
  document.getElementById('historico-cliente-nome').textContent = selectedCliente.razao_social;
  document.getElementById('modal-historico').classList.add('open');
  loadHistoricoCliente(selectedCliente.id, 'historico-conteudo', atualizarAlertaOrcamentosPendentes);
});

document.getElementById('historico-btn-fechar').addEventListener('click', function () {
  document.getElementById('modal-historico').classList.remove('open');
});

async function atualizarAlertaOrcamentosPendentes() {
  var alertaEl = document.getElementById('alerta-orcamento-pendente');
  if (!selectedCliente) { alertaEl.style.display = 'none'; return; }

  var pendentes = await contarOrcamentosPendentes(selectedCliente.id);
  if (pendentes > 0) {
    alertaEl.textContent = '⚠️ Este cliente tem ' + pendentes + ' orçamento' + (pendentes > 1 ? 's' : '') + ' pendente' + (pendentes > 1 ? 's' : '') + ' aguardando virar pedido. Veja no histórico de compras.';
    alertaEl.style.display = 'block';
  } else {
    alertaEl.style.display = 'none';
  }
}

/* ===================== ITENS VÁCUO ===================== */

function renderVacuoRow(item) {
  var row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.id = item._id;

  row.innerHTML =
    '<div class="form-field"><label class="item-row-label">Material</label><input type="text" data-f="material" list="lista-materiais-vacuo" placeholder="Ex: NYLON POLI" value="' + (item.material || '') + '"></div>' +
    '<div class="form-field"><label class="item-row-label">Larg. (cm)</label><input type="text" inputmode="decimal" data-f="largura_m" placeholder="Ex: 20" value="' + (item.largura_m ? formatMedidaCm(item.largura_m) : '') + '"></div>' +
    '<div class="form-field"><label class="item-row-label">Comp. (cm)</label><input type="text" inputmode="decimal" data-f="comprimento_m" placeholder="Ex: 22" value="' + (item.comprimento_m ? formatMedidaCm(item.comprimento_m) : '') + '"></div>' +
    '<div class="form-field"><label class="item-row-label">Esp. (µ)</label><input type="text" inputmode="decimal" data-f="espessura_micras" placeholder="Ex: 120" value="' + item.espessura_micras + '"></div>' +
    '<div class="form-field"><label class="item-row-label">Tipo</label><input type="text" data-f="tipo" placeholder="Ex: NATURAL" value="' + (item.tipo || '') + '"></div>' +
    '<div class="form-field"><label class="item-row-label">Qtd.</label><input type="text" inputmode="decimal" data-f="quantidade" value="' + item.quantidade + '"></div>' +
    '<div class="form-field"><label class="item-row-label">Peso</label><span class="calc-readout" data-out="peso">0</span></div>' +
    '<div class="form-field"><label class="item-row-label">Fator</label><input type="text" inputmode="decimal" data-f="taxa_preco_peso" value="' + item.taxa_preco_peso + '"' + (fatorTravadoParaRole() ? ' readonly title="Fator definido pelo tipo de embalagem — só admin pode mudar. Fale com um administrador se precisar de uma negociação especial."' : '') + '></div>' +
    '<div class="form-field"><label class="item-row-label">Vl. Total</label><span class="calc-readout" data-out="vl_total">R$ 0,00</span></div>' +
    '<button type="button" class="item-remove" title="Remover item">✕</button>';

  // Largura e comprimento são digitados em cm (ex: 20) mas guardados internamente em
  // metros — é a unidade que a fórmula de peso (calcVacuo) e o "Fator" já usam.
  var VACUO_CAMPOS_EM_CM = ['largura_m', 'comprimento_m'];
  var VACUO_CAMPOS_NUMERICOS = ['largura_m', 'comprimento_m', 'espessura_micras', 'quantidade', 'taxa_preco_peso'];
  row.querySelectorAll('[data-f]').forEach(function (input) {
    input.addEventListener('input', function () {
      var field = input.dataset.f;
      if (VACUO_CAMPOS_EM_CM.indexOf(field) !== -1) {
        item[field] = toNumber(input.value) / 100;
      } else {
        item[field] = (VACUO_CAMPOS_NUMERICOS.indexOf(field) !== -1) ? toNumber(input.value) : input.value;
      }
      // Fator acompanha o tipo de embalagem: vendedor (travado) sempre; admin só enquanto
      // não tiver digitado um fator próprio nesse item (negociação especial).
      if (field === 'taxa_preco_peso') {
        item._fatorEditado = true;
      } else if (field === 'material' && (fatorTravadoParaRole() || !item._fatorEditado)) {
        item.taxa_preco_peso = fatorParaMaterial(item.material);
        row.querySelector('[data-f="taxa_preco_peso"]').value = item.taxa_preco_peso;
      }
      updateVacuoRowReadout(row, item);
      updateTotals();
    });
  });

  row.querySelector('.item-remove').addEventListener('click', function () {
    vacuoItems = vacuoItems.filter(function (i) { return i._id !== item._id; });
    row.remove();
    updateTotals();
  });

  document.getElementById('vacuo-items').appendChild(row);
  updateVacuoRowReadout(row, item);
}

function updateVacuoRowReadout(row, item) {
  var calc = calcVacuo(item);
  row.querySelector('[data-out="peso"]').textContent = calc.peso.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  row.querySelector('[data-out="vl_total"]').textContent = formatBRL(calc.vl_total);
}

var btnSalvarFatorPadrao = document.getElementById('btn-salvar-fator-padrao');
if (btnSalvarFatorPadrao) {
  btnSalvarFatorPadrao.addEventListener('click', async function () {
    var novoValor = toNumber(document.getElementById('fator-padrao-input').value);
    var { error } = await supabaseClient.from('configuracoes')
      .upsert({ chave: 'fator_padrao_vacuo', valor: String(novoValor), updated_at: new Date().toISOString() }, { onConflict: 'chave' });
    if (error) { showToast('Erro ao salvar Fator padrão: ' + error.message, 'error'); return; }
    fatorPadraoVacuo = novoValor;
    showToast('Fator padrão atualizado para ' + novoValor + '.', 'ok');
  });
}

document.getElementById('btn-add-vacuo').addEventListener('click', function () {
  var item = {
    _id: uid(), item: 'SACO A VÁCUO', material: '', largura_m: 0, comprimento_m: 0,
    espessura_micras: 0, tipo: '', quantidade: 0, taxa_preco_peso: fatorPadraoVacuo
  };
  vacuoItems.push(item);
  renderVacuoRow(item);
});

/* ===================== SELECIONAR EMBALAGEM DO ESTOQUE (vácuo) ===================== */

// Categorias de embalagem que ficam no estoque — usadas tanto pra filtrar o
// combo de "Itens — Embalagem a Vácuo" (só essas entram aqui) quanto pra
// excluir do combo de "Itens — Etiquetas / Equipamentos" (etiqueta/bobina PDV
// ficam lá, embalagem nunca). CATEGORIAS_EMBALAGEM_VACUO, categoriaEmbalagemDoProduto
// e extrairMedidasVacuoDoNome vêm de calc-vacuo.js (compartilhado com o Estoque).

function openSelecionarVacuoModal() {
  document.getElementById('select-vacuo-categoria').value = '';
  document.getElementById('select-vacuo-produto').innerHTML = '<option value="">— Escolha a categoria primeiro —</option>';
  document.getElementById('select-vacuo-estoque-readout').textContent = '';
  document.getElementById('select-vacuo-quantidade').value = '';
  document.getElementById('selecionar-vacuo-error').style.display = 'none';
  document.getElementById('modal-selecionar-vacuo').classList.add('open');
}
function closeSelecionarVacuoModal() {
  document.getElementById('modal-selecionar-vacuo').classList.remove('open');
}

document.getElementById('btn-open-selecionar-vacuo').addEventListener('click', async function () {
  await loadCatalogoParaSelecionar();
  var categoriaSelect = document.getElementById('select-vacuo-categoria');
  categoriaSelect.innerHTML = '<option value="">— Selecione —</option>' + CATEGORIAS_EMBALAGEM_VACUO.map(function (c) {
    return '<option value="' + c.label + '">' + c.label + '</option>';
  }).join('');
  openSelecionarVacuoModal();
});
document.getElementById('selecionar-vacuo-btn-cancelar').addEventListener('click', closeSelecionarVacuoModal);

document.getElementById('select-vacuo-categoria').addEventListener('change', function (e) {
  var produtoSelect = document.getElementById('select-vacuo-produto');
  var categoria = CATEGORIAS_EMBALAGEM_VACUO.find(function (c) { return c.label === e.target.value; });

  if (!categoria) {
    produtoSelect.innerHTML = '<option value="">— Escolha a categoria primeiro —</option>';
    return;
  }

  var produtos = catalogoCache.filter(function (p) {
    var c = categoriaEmbalagemDoProduto(p.nome_produto);
    return c && c.label === categoria.label;
  });

  if (!produtos.length) {
    produtoSelect.innerHTML = '<option value="">Nenhuma medida cadastrada nessa categoria</option>';
    return;
  }

  produtoSelect.innerHTML = '<option value="">— Selecione —</option>' + produtos.map(function (p) {
    return '<option value="' + p.id + '">' + p.nome_produto + '</option>';
  }).join('');
  document.getElementById('select-vacuo-estoque-readout').textContent = '';
});

document.getElementById('select-vacuo-produto').addEventListener('change', function (e) {
  var produto = catalogoCache.find(function (p) { return p.id === e.target.value; });
  document.getElementById('select-vacuo-estoque-readout').textContent = produto
    ? 'Em estoque: ' + (produto.quantidade_estoque || 0).toLocaleString('pt-BR') + ' un.'
    : '';
});

document.getElementById('selecionar-vacuo-btn-adicionar').addEventListener('click', function () {
  var errorEl = document.getElementById('selecionar-vacuo-error');
  errorEl.style.display = 'none';

  var categoria = CATEGORIAS_EMBALAGEM_VACUO.find(function (c) { return c.label === document.getElementById('select-vacuo-categoria').value; });
  if (!categoria) {
    errorEl.textContent = 'Selecione a categoria.';
    errorEl.style.display = 'block';
    return;
  }

  var produtoId = document.getElementById('select-vacuo-produto').value;
  var produto = catalogoCache.find(function (p) { return p.id === produtoId; });
  if (!produto) {
    errorEl.textContent = 'Selecione a medida.';
    errorEl.style.display = 'block';
    return;
  }

  var quantidade = toNumber(document.getElementById('select-vacuo-quantidade').value);
  if (quantidade <= 0) {
    errorEl.textContent = 'Informe a quantidade.';
    errorEl.style.display = 'block';
    return;
  }

  var medidas = extrairMedidasVacuoDoNome(produto.nome_produto);
  var item = {
    _id: uid(), item: 'SACO A VÁCUO', material: categoria.label,
    largura_m: medidas.largura / 100, comprimento_m: medidas.comprimento / 100,
    espessura_micras: medidas.espessura, tipo: '', quantidade: quantidade,
    taxa_preco_peso: fatorParaMaterial(categoria.label)
  };
  vacuoItems.push(item);
  renderVacuoRow(item);
  updateTotals();
  closeSelecionarVacuoModal();
});

/* ===================== ITENS GERAIS ===================== */

// Pedido pra fornecedor de etiqueta: a quantidade é lançada em CAIXAS (o sistema converte
// pra rolos pela regra de caixas-etiqueta.js) e o documento do fornecedor mostra só caixas.
function modoFornecedorEtiqueta() {
  return !!(selectedCliente && selectedCliente.eh_fornecedor && selectedCliente.tipo_fornecedor === 'etiqueta');
}

function formatarCaixasPedido(rolos, rolosPorCaixa) {
  if (!rolosPorCaixa) return '—';
  var caixas = Math.floor(rolos / rolosPorCaixa);
  var resto = rolos % rolosPorCaixa;
  return caixas + ' cx' + (resto ? ' + ' + resto + ' rolos' : '');
}

// Texto da quantidade no documento do fornecedor de etiqueta: só caixas.
function ehItemEmRolos(nomeProduto) {
  return /ETIQUETA|ETQ|BOBINA/i.test(String(nomeProduto || ''));
}

function textoQuantidadeFornecedor(g) {
  var rolosPorCaixa = rolosPorCaixaDoProduto(g.nome_produto);
  if (!rolosPorCaixa) return g.quantidade + (ehItemEmRolos(g.nome_produto) ? ' rolos' : ' un.');
  var caixas = Math.round((g.quantidade / rolosPorCaixa) * 100) / 100;
  return String(caixas).replace('.', ',') + (caixas === 1 ? ' caixa' : ' caixas');
}

function renderGeraisItems() {
  var container = document.getElementById('gerais-items');
  if (!geraisItems.length) {
    container.innerHTML = '<p style="color:var(--gray-400); font-size:0.88rem;">Nenhum item adicionado ainda.</p>';
    return;
  }

  var modoCaixas = modoFornecedorEtiqueta();

  container.innerHTML = geraisItems.map(function (g) {
    var precoTotal = g.preco_unitario * g.quantidade;
    var rolosPorCaixa = rolosPorCaixaDoProduto(g.nome_produto);
    var pendencias = [];
    if (!g.codigo_produto) pendencias.push('Código');
    if (!g.ncm) pendencias.push('NCM');
    var badge = pendencias.length ? ' <span class="badge badge-warning">' + pendencias.join(' + ') + ' pendente</span>' : '';
    var caixasPorInput = modoCaixas && rolosPorCaixa;

    var celulaQtd = caixasPorInput
      ? '<span class="calc-readout" data-out="rolos">' + g.quantidade.toLocaleString('pt-BR') + '</span>'
      : '<input type="text" inputmode="decimal" data-f="quantidade" value="' + g.quantidade + '">';
    var celulaCaixas = caixasPorInput
      ? '<input type="text" inputmode="decimal" data-f="caixas" value="' + (Math.round((g.quantidade / rolosPorCaixa) * 100) / 100) + '">'
      : '<span class="calc-readout" data-out="caixas">' + formatarCaixasPedido(g.quantidade, rolosPorCaixa) + '</span>';

    return '<div class="item-row item-row-gerais" data-id="' + g._id + '">' +
      '<div class="form-field"><label class="item-row-label">Produto</label><span class="calc-readout">' + g.nome_produto + badge + '</span></div>' +
      '<div class="form-field"><label class="item-row-label">Cód.</label><span class="calc-readout">' + (g.codigo_produto || '—') + '</span></div>' +
      '<div class="form-field"><label class="item-row-label">NCM</label><span class="calc-readout">' + (g.ncm || '—') + '</span></div>' +
      '<div class="form-field"><label class="item-row-label">Unit. (R$)</label><input type="text" inputmode="decimal" data-f="preco_unitario" value="' + g.preco_unitario + '"></div>' +
      '<div class="form-field"><label class="item-row-label">Qtd. (rolos)</label>' + celulaQtd + '</div>' +
      '<div class="form-field"><label class="item-row-label">Caixas</label>' + celulaCaixas + '</div>' +
      '<div class="form-field"><label class="item-row-label">Vl. Total</label><span class="calc-readout" data-out="preco_total">' + formatBRL(precoTotal) + '</span></div>' +
      '<button type="button" class="item-remove" title="Remover item">✕</button>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.item-row-gerais').forEach(function (row) {
    var g = geraisItems.find(function (item) { return item._id === row.dataset.id; });
    if (!g) return;
    var rolosPorCaixa = rolosPorCaixaDoProduto(g.nome_produto);
    row.querySelectorAll('[data-f]').forEach(function (input) {
      input.addEventListener('input', function () {
        var v = toNumber(input.value);
        if (input.dataset.f === 'caixas') {
          g.quantidade = Math.round(v * rolosPorCaixa);
          var rolosEl = row.querySelector('[data-out="rolos"]');
          if (rolosEl) rolosEl.textContent = g.quantidade.toLocaleString('pt-BR');
        } else {
          g[input.dataset.f] = v;
          var caixasEl = row.querySelector('[data-out="caixas"]');
          if (caixasEl) caixasEl.textContent = formatarCaixasPedido(g.quantidade, rolosPorCaixa);
        }
        row.querySelector('[data-out="preco_total"]').textContent = formatBRL(g.preco_unitario * g.quantidade);
        updateTotals();
      });
    });
  });

  container.querySelectorAll('.item-remove').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.closest('[data-id]').dataset.id;
      geraisItems = geraisItems.filter(function (g) { return g._id !== id; });
      renderGeraisItems();
      updateTotals();
    });
  });
}

/* ===================== MODAL CADASTRO (produto novo) ===================== */

function openModal() {
  document.getElementById('modal-nome').value = '';
  document.getElementById('modal-codigo').value = '';
  document.getElementById('modal-ncm').value = '';
  document.getElementById('modal-preco').value = '';
  document.getElementById('modal-quantidade').value = '';
  document.getElementById('modal-salvar-catalogo').checked = true;
  document.getElementById('modal-error').style.display = 'none';
  document.getElementById('modal-cadastro').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-cadastro').classList.remove('open');
}

document.getElementById('btn-open-cadastro').addEventListener('click', openModal);
document.getElementById('modal-btn-cancelar').addEventListener('click', closeModal);

document.getElementById('modal-btn-adicionar').addEventListener('click', async function () {
  var nome = document.getElementById('modal-nome').value.trim();
  var errorEl = document.getElementById('modal-error');
  errorEl.style.display = 'none';

  if (!nome) {
    errorEl.textContent = 'Nome do Produto é obrigatório.';
    errorEl.style.display = 'block';
    return;
  }

  var codigo = document.getElementById('modal-codigo').value.trim();
  var ncm = document.getElementById('modal-ncm').value.trim();
  var preco = toNumber(document.getElementById('modal-preco').value);
  var quantidade = toNumber(document.getElementById('modal-quantidade').value);
  var salvarCatalogo = document.getElementById('modal-salvar-catalogo').checked;
  var produtoCatalogoId = null;

  if (quantidade <= 0) {
    errorEl.textContent = 'Informe a quantidade.';
    errorEl.style.display = 'block';
    return;
  }

  if (!codigo || !ncm) {
    var faltando = [];
    if (!codigo) faltando.push('Código');
    if (!ncm) faltando.push('NCM');
    showToast('Lembre de preencher depois: ' + faltando.join(' e ') + '.', 'warning');
  }

  if (salvarCatalogo) {
    // Já existe um produto com esse nome? Atualiza o preço dele em vez de duplicar o cadastro.
    var { data: existente } = await supabaseClient
      .from('produtos_catalogo').select('id').ilike('nome_produto', nome).limit(1).maybeSingle();

    if (existente) {
      var { error: updateError } = await supabaseClient.from('produtos_catalogo').update({
        codigo_produto: codigo || null, ncm: ncm || null, preco_unitario: preco || null
      }).eq('id', existente.id);
      if (!updateError) {
        produtoCatalogoId = existente.id;
        showToast('Já existia um produto com esse nome — preço atualizado no catálogo em vez de duplicar.', 'ok');
      }
    } else {
      var { data, error } = await supabaseClient.from('produtos_catalogo').insert({
        nome_produto: nome, codigo_produto: codigo || null, ncm: ncm || null,
        preco_unitario: preco || null, created_by: currentUserId
      }).select().single();
      if (!error && data) produtoCatalogoId = data.id;
    }
  }

  geraisItems.push({
    _id: uid(), produto_catalogo_id: produtoCatalogoId, nome_produto: nome,
    codigo_produto: codigo || null, ncm: ncm || null, preco_unitario: preco, quantidade: quantidade
  });

  renderGeraisItems();
  updateTotals();
  closeModal();
});

/* ===================== MODAL SELECIONAR (produto já cadastrado) ===================== */

async function loadCatalogoParaSelecionar() {
  var { data, error } = await supabaseClient.from('produtos_catalogo').select('*').order('nome_produto');
  if (error) return;
  catalogoCache = data || [];

  // Embalagem (vácuo) só entra pelo combo de Itens — Embalagem a Vácuo, nunca
  // aqui em Etiquetas/Equipamentos — evita listar as mesmas medidas nos 2 lugares.
  var produtosEtiquetas = catalogoCache.filter(function (p) { return !categoriaEmbalagemDoProduto(p.nome_produto); });

  var select = document.getElementById('select-produto-existente');
  if (!produtosEtiquetas.length) {
    select.innerHTML = '<option value="">Nenhum produto cadastrado ainda</option>';
    return;
  }
  select.innerHTML = '<option value="">— Selecione —</option>' + produtosEtiquetas.map(function (p) {
    return '<option value="' + p.id + '">' + p.nome_produto + '</option>';
  }).join('');
}

function openSelecionarModal() {
  document.getElementById('select-produto-existente').value = '';
  document.getElementById('select-produto-codigo-readout').textContent = '—';
  document.getElementById('select-produto-ncm-readout').textContent = '—';
  document.getElementById('select-produto-preco').value = '';
  document.getElementById('select-produto-quantidade').value = '';
  document.getElementById('selecionar-error').style.display = 'none';
  document.getElementById('modal-selecionar').classList.add('open');
}

function closeSelecionarModal() {
  document.getElementById('modal-selecionar').classList.remove('open');
}

document.getElementById('btn-open-selecionar').addEventListener('click', function () {
  loadCatalogoParaSelecionar();
  openSelecionarModal();
});
document.getElementById('selecionar-btn-cancelar').addEventListener('click', closeSelecionarModal);

document.getElementById('select-produto-existente').addEventListener('change', function (e) {
  var produto = catalogoCache.find(function (p) { return p.id === e.target.value; });
  var labelQtd = document.querySelector('label[for="select-produto-quantidade"]');
  if (labelQtd) labelQtd.textContent = (modoFornecedorEtiqueta() && produto && rolosPorCaixaDoProduto(produto.nome_produto)) ? 'Quantidade (caixas) *' : 'Quantidade *';
  document.getElementById('select-produto-codigo-readout').textContent = produto && produto.codigo_produto ? produto.codigo_produto : '—';
  document.getElementById('select-produto-ncm-readout').textContent = produto && produto.ncm ? produto.ncm : '—';
  // Pedido pra fornecedor é compra: o preço sugerido é o de CUSTO, não o de venda.
  var paraFornecedor = ehPedidoParaFornecedor();
  document.getElementById('select-produto-preco').value = produto ? ((paraFornecedor ? produto.preco_custo : produto.preco_unitario) || 0) : '';
  document.getElementById('select-produto-preco-hint').textContent = paraFornecedor
    ? 'Fornecedor: preço de CUSTO do catálogo, editável só para este pedido.'
    : 'Preenchido do catálogo, editável só para este pedido.';
});

document.getElementById('selecionar-btn-adicionar').addEventListener('click', function () {
  var errorEl = document.getElementById('selecionar-error');
  errorEl.style.display = 'none';

  var produtoId = document.getElementById('select-produto-existente').value;
  var produto = catalogoCache.find(function (p) { return p.id === produtoId; });
  if (!produto) {
    errorEl.textContent = 'Selecione um produto cadastrado.';
    errorEl.style.display = 'block';
    return;
  }

  var quantidade = toNumber(document.getElementById('select-produto-quantidade').value);
  if (quantidade <= 0) {
    errorEl.textContent = 'Informe a quantidade.';
    errorEl.style.display = 'block';
    return;
  }

  // Fornecedor de etiqueta: o número digitado é de CAIXAS — guarda em rolos.
  var rolosPorCaixaSel = rolosPorCaixaDoProduto(produto.nome_produto);
  if (modoFornecedorEtiqueta() && rolosPorCaixaSel) quantidade = quantidade * rolosPorCaixaSel;

  var precoEditado = toNumber(document.getElementById('select-produto-preco').value);

  geraisItems.push({
    _id: uid(), produto_catalogo_id: produto.id, nome_produto: produto.nome_produto,
    codigo_produto: produto.codigo_produto, ncm: produto.ncm,
    preco_unitario: precoEditado, quantidade: quantidade
  });

  renderGeraisItems();
  updateTotals();
  closeSelecionarModal();
});

/* ===================== PAGAMENTO / TOTAIS ===================== */

function deveMostrarDescontoVista() {
  var forma = document.getElementById('forma_pagamento').value;
  return forma === 'a_vista' || forma === 'pix';
}

document.getElementById('forma_pagamento').addEventListener('change', function (e) {
  var v = e.target.value;
  document.getElementById('boleto-quantidade-field').style.display = v === 'boleto' ? 'flex' : 'none';
  document.getElementById('boleto-dias-field').style.display = v === 'boleto' ? 'flex' : 'none';
  document.getElementById('cartao-parcelas-field').style.display = v === 'cartao_credito' ? 'flex' : 'none';
  var mostrarVista = deveMostrarDescontoVista();
  document.getElementById('desconto-vista-field').style.display = mostrarVista ? 'flex' : 'none';
  document.getElementById('valor-vista-field').style.display = mostrarVista ? 'flex' : 'none';
  // O Pix fica sempre visível quando alguma forma de pagamento é escolhida — o cliente
  // pode acabar pagando via Pix mesmo que o pedido tenha sido fechado em outra forma.
  document.getElementById('pix-info-group').style.display = v ? 'grid' : 'none';
  atualizarValorVista();
});

document.getElementById('valor_total_a_pagar').addEventListener('input', function () {
  valorTotalManuallyEdited = true;
  atualizarValorVista();
});

// Escape hatch pra quando o valor ficar "preso" num total antigo (ex: pedido
// editado antes dessa trava ter um jeito melhor de destravar sozinha) — força
// recalcular a partir dos itens de novo, ignorando qualquer edição manual anterior.
document.getElementById('btn-recalcular-total').addEventListener('click', function () {
  valorTotalManuallyEdited = false;
  updateTotals();
  showToast('Valor recalculado a partir dos itens.', 'ok');
});

document.getElementById('desconto_percentual').addEventListener('input', function () {
  valorVistaManuallyEdited = false;
  atualizarValorVista();
});

document.getElementById('valor_total_a_pagar_vista').addEventListener('input', function () {
  valorVistaManuallyEdited = true;
});

function atualizarValorVista() {
  if (valorVistaManuallyEdited) return;
  var valorCheio = toNumber(document.getElementById('valor_total_a_pagar').value);
  var desconto = toNumber(document.getElementById('desconto_percentual').value);
  document.getElementById('valor_total_a_pagar_vista').value = (valorCheio * (1 - desconto / 100)).toFixed(2);
}

// Fornecedor com imposto no cadastro (ex: Thermoprint — ICMS 18% já incluso no preço, IPI 3,25%
// acrescentado nos itens de 30 m): o IPI entra no total do pedido.
function regraImpostoFornecedor() {
  if (!selectedCliente || !selectedCliente.eh_fornecedor) return null;
  var ipi = parseFloat(selectedCliente.ipi_percentual) || 0;
  var icms = parseFloat(selectedCliente.icms_incluso_percentual) || 0;
  return (ipi > 0 || icms > 0) ? { ipi: ipi, icms: icms } : null;
}

function marcaDoFornecedor() {
  return ehPedidoParaFornecedor() ? (selectedCliente.marca_produto || '').trim() : '';
}

function calcularIpiPedido() {
  var regra = regraImpostoFornecedor();
  if (!regra || !(regra.ipi > 0)) return 0;
  var base = geraisItems.reduce(function (acc, g) {
    return itemSujeitoIpiFornecedor(g.nome_produto, marcaDoFornecedor()) ? acc + g.preco_unitario * g.quantidade : acc;
  }, 0);
  return Math.round(base * regra.ipi) / 100;
}

function formatarPercentualPedido(n) {
  return String(n).replace('.', ',') + '%';
}

// Campos ICMS/IPI do pedido se preenchem sozinhos pela regra — sem sobrescrever texto digitado à mão.
var textoIcmsAuto = '', textoIpiAuto = '';
function atualizarCamposImposto(regra, ipiValor) {
  var icmsEl = document.getElementById('icms'), ipiEl = document.getElementById('ipi');
  var novoIcms = regra && regra.icms > 0 ? formatarPercentualPedido(regra.icms) + ' incluso no preço' : '';
  var novoIpi = regra && regra.ipi > 0 ? formatarPercentualPedido(regra.ipi) + ' a acrescentar (' + formatBRL(ipiValor) + ')' : '';
  if (!icmsEl.value || icmsEl.value === textoIcmsAuto) { icmsEl.value = novoIcms; }
  if (!ipiEl.value || ipiEl.value === textoIpiAuto) { ipiEl.value = novoIpi; }
  textoIcmsAuto = novoIcms;
  textoIpiAuto = novoIpi;
}

function updateTotals() {
  var qtdTotal = 0, pesoTotal = 0, valorItens = 0;

  vacuoItems.forEach(function (item) {
    var calc = calcVacuo(item);
    qtdTotal += item.quantidade;
    pesoTotal += calc.peso_total;
    valorItens += calc.vl_total;
  });

  geraisItems.forEach(function (g) {
    qtdTotal += g.quantidade;
    valorItens += g.preco_unitario * g.quantidade;
  });

  document.getElementById('total-quantidade').textContent = qtdTotal.toLocaleString('pt-BR');
  document.getElementById('total-peso').textContent = pesoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  document.getElementById('total-itens').textContent = formatBRL(valorItens);

  var regraImposto = regraImpostoFornecedor();
  var ipiValor = calcularIpiPedido();
  document.getElementById('total-ipi-box').style.display = (regraImposto && regraImposto.ipi > 0) ? '' : 'none';
  document.getElementById('total-ipi-label').textContent = regraImposto && regraImposto.ipi > 0 ? 'IPI ' + formatarPercentualPedido(regraImposto.ipi) + ' (somado ao total)' : 'IPI';
  document.getElementById('total-ipi').textContent = formatBRL(ipiValor);
  atualizarCamposImposto(regraImposto, ipiValor);

  if (!valorTotalManuallyEdited) {
    document.getElementById('valor_total_a_pagar').value = (valorItens + ipiValor).toFixed(2);
  }
  atualizarValorVista();
}

/* ===================== SALVAR PEDIDO / ORÇAMENTO ===================== */

function validarPedido(errorEl) {
  errorEl.style.display = 'none';

  if (!selectedCliente) {
    errorEl.textContent = 'Selecione um cliente antes de continuar.';
    errorEl.style.display = 'block';
    return false;
  }
  if (!vacuoItems.length && !geraisItems.length) {
    errorEl.textContent = 'Adicione ao menos um item ao pedido.';
    errorEl.style.display = 'block';
    return false;
  }
  if (!document.getElementById('forma_pagamento').value) {
    errorEl.textContent = 'Selecione a forma de pagamento.';
    errorEl.style.display = 'block';
    return false;
  }
  return true;
}

async function salvarPedidoNoBanco(tipo, statusOrcamento) {
  var formaPagamento = document.getElementById('forma_pagamento').value;

  var pedidoPayload = {
    cliente_id: selectedCliente.id,
    prazo_entrega: document.getElementById('prazo_entrega').value || null,
    icms: document.getElementById('icms').value || null,
    ipi: document.getElementById('ipi').value || null,
    regime_tributacao: document.getElementById('regime_tributacao').value || null,
    transportadora_empresa: document.getElementById('transp_empresa').value || null,
    transportadora_cnpj: document.getElementById('transp_cnpj').value || null,
    transportadora_endereco: document.getElementById('transp_endereco').value || null,
    transportadora_telefone: document.getElementById('transp_tel').value || null,
    observacao: document.getElementById('observacao').value || null,
    nf_emitida: document.getElementById('nf_emitida').checked,
    nf_numero: document.getElementById('nf_emitida').checked ? (document.getElementById('nf_numero').value.trim() || null) : null,
    forma_pagamento: formaPagamento,
    boleto_quantidade: formaPagamento === 'boleto' ? (toNumber(document.getElementById('boleto_quantidade').value) || null) : null,
    boleto_dias: formaPagamento === 'boleto' ? (toNumber(document.getElementById('boleto_dias').value) || null) : null,
    cartao_parcelas: formaPagamento === 'cartao_credito' ? (toNumber(document.getElementById('cartao_parcelas').value) || null) : null,
    pix_dias: toNumber(document.getElementById('pix_dias').value) || null,
    valor_total_a_pagar: toNumber(document.getElementById('valor_total_a_pagar').value),
    desconto_percentual: deveMostrarDescontoVista() ? (toNumber(document.getElementById('desconto_percentual').value) || null) : null,
    valor_total_a_pagar_vista: deveMostrarDescontoVista() ? toNumber(document.getElementById('valor_total_a_pagar_vista').value) : null,
    created_by: currentUserId,
    // Normalmente é quem salvou, mas um admin pode lançar o pedido em nome de
    // outro vendedor (ex: Paulo) pelo seletor "Vendedor responsável" — assim a
    // comissão no Financeiro vai pra pessoa certa mesmo que outra tenha digitado.
    vendedor_id: obterVendedorResponsavelId()
  };

  var pedido, pedidoError;

  if (pedidoEmEdicaoId) {
    // Edição: atualiza o registro existente sem tocar em tipo/status_orcamento —
    // isso só muda pelos botões dedicados (Converter em pedido / Marcar como não convertido).
    var updateResult = await supabaseClient.from('pedidos').update(pedidoPayload).eq('id', pedidoEmEdicaoId).select().single();
    pedido = updateResult.data;
    pedidoError = updateResult.error;
    if (pedidoError) return { error: pedidoError };

    await supabaseClient.from('pedido_itens_vacuo').delete().eq('pedido_id', pedidoEmEdicaoId);
    await supabaseClient.from('pedido_itens_gerais').delete().eq('pedido_id', pedidoEmEdicaoId);
  } else {
    pedidoPayload.tipo = tipo;
    pedidoPayload.status_orcamento = statusOrcamento;
    var insertResult = await supabaseClient.from('pedidos').insert(pedidoPayload).select().single();
    pedido = insertResult.data;
    pedidoError = insertResult.error;
    if (pedidoError) return { error: pedidoError };
  }

  var vacuoRows = vacuoItems.map(function (item, idx) {
    var calc = calcVacuo(item);
    return {
      pedido_id: pedido.id, ordem: idx, item: item.item, material: item.material,
      largura_m: item.largura_m, comprimento_m: item.comprimento_m, espessura_micras: item.espessura_micras,
      tipo: item.tipo, quantidade: item.quantidade, peso: calc.peso, peso_total: calc.peso_total,
      taxa_preco_peso: item.taxa_preco_peso, vl_unitario: calc.vl_unitario, vl_total: calc.vl_total
    };
  });

  var geraisRows = geraisItems.map(function (g, idx) {
    return {
      pedido_id: pedido.id, ordem: idx, produto_catalogo_id: g.produto_catalogo_id,
      nome_produto: g.nome_produto, codigo_produto: g.codigo_produto, ncm: g.ncm,
      preco_unitario: g.preco_unitario, quantidade: g.quantidade, preco_total: g.preco_unitario * g.quantidade
    };
  });

  if (vacuoRows.length) await supabaseClient.from('pedido_itens_vacuo').insert(vacuoRows);
  if (geraisRows.length) await supabaseClient.from('pedido_itens_gerais').insert(geraisRows);

  var nomeClienteFinanceiro = selectedCliente.razao_social + (selectedCliente.nome_fantasia ? ' (' + selectedCliente.nome_fantasia + ')' : '');
  await sincronizarFinanceiroDoPedido(pedido, nomeClienteFinanceiro, !!selectedCliente.eh_fornecedor, !!selectedCliente.nao_contabilizar);

  pedidoEmEdicaoId = pedido.id;
  pedidoEmEdicaoTipo = pedido.tipo;
  pedidoEmEdicaoPago = !!pedido.pago;
  pedidoEmEdicaoDataPagamento = pedido.data_pagamento || null;
  if (pedido.tipo === 'pedido') {
    document.getElementById('edicao-banner-texto').textContent = '✏️ Editando Pedido nº ' + pedido.numero;
    document.getElementById('edicao-banner').style.display = 'flex';
  }
  renderPedidoPagoStatus();

  return { pedido: pedido };
}

/* ===================== SALVAR + IMPRIMIR / SALVAR + ENVIAR ORÇAMENTO (fluxos compartilhados) ===================== */

async function processarPedidoEImprimir(errorEl) {
  var estavaEditando = !!pedidoEmEdicaoId;
  var result = await salvarPedidoNoBanco('pedido', null);

  if (result.error) {
    errorEl.textContent = 'Erro ao salvar pedido: ' + result.error.message;
    errorEl.style.display = 'block';
    return false;
  }

  showToast((estavaEditando ? 'Pedido nº ' + result.pedido.numero + ' atualizado com sucesso.' : 'Pedido nº ' + result.pedido.numero + ' salvo com sucesso.'), 'ok');
  atualizarAlertaOrcamentosPendentes();

  document.getElementById('print-sheet').innerHTML = buildViaHtml('Cliente') + buildViaHtml('Empresa');
  document.getElementById('orcamento-sheet').innerHTML = ''; // evita sobrepor com um orçamento gerado antes

  var nomeCliente = selectedCliente.razao_social || selectedCliente.nome_fantasia || 'Pedido';
  document.title = nomeCliente + ' - Portal HLN';
  window.print();
  return true;
}

async function processarPedidoSoSalvar(errorEl) {
  var estavaEditando = !!pedidoEmEdicaoId;
  var result = await salvarPedidoNoBanco('pedido', null);

  if (result.error) {
    errorEl.textContent = 'Erro ao salvar pedido: ' + result.error.message;
    errorEl.style.display = 'block';
    return false;
  }

  showToast((estavaEditando ? 'Pedido nº ' + result.pedido.numero + ' atualizado.' : 'Pedido nº ' + result.pedido.numero + ' salvo como pendente — envie ou imprima quando quiser.'), 'ok');
  atualizarAlertaOrcamentosPendentes();
  return true;
}

async function processarOrcamentoEEnviarEmail(errorEl) {
  var emailDestino = (selectedCliente.contato_email || selectedCliente.email_empresa || '').trim();
  if (!emailDestino) {
    errorEl.textContent = 'Este cliente não tem e-mail cadastrado (nem do contato, nem da empresa). Cadastre um e-mail antes de enviar.';
    errorEl.style.display = 'block';
    return false;
  }

  var estavaEditando = !!pedidoEmEdicaoId;
  var result = await salvarPedidoNoBanco('orcamento', 'pendente');

  if (result.error) {
    errorEl.textContent = 'Erro ao salvar orçamento: ' + result.error.message;
    errorEl.style.display = 'block';
    return false;
  }

  var { data: { session } } = await supabaseClient.auth.getSession();

  var resp;
  try {
    resp = await fetch('/api/enviar-orcamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: session ? session.access_token : null,
        to: emailDestino,
        subject: 'Orçamento nº ' + result.pedido.numero + ' — HLN Embalagens e Equipamentos',
        html: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' + buildOrcamentoHtml() + '</body></html>'
      })
    });
  } catch (err) {
    resp = null;
  }

  var respData = resp ? await resp.json().catch(function () { return {}; }) : {};

  if (!resp || !resp.ok) {
    errorEl.textContent = 'Orçamento salvo, mas houve erro ao enviar o e-mail: ' + (respData.error || 'falha de conexão.');
    errorEl.style.display = 'block';
    return false;
  }

  // Notificação por WhatsApp além do e-mail — best-effort: se o cliente não tem
  // telefone, se o template ainda não foi aprovado pela Meta, ou se falhar por
  // qualquer motivo, o orçamento já foi salvo e enviado por e-mail normalmente.
  var enviadoWhatsapp = false;
  var telefoneWhats = telefoneParaWhatsapp(selectedCliente.contato_telefone || selectedCliente.telefone_empresa);
  if (telefoneWhats) {
    var nomeCliente = selectedCliente.razao_social || selectedCliente.nome_fantasia || 'Cliente';
    try {
      var respWa = await fetch('/api/whatsapp-enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: session ? session.access_token : null,
          to: telefoneWhats,
          tipo: 'template',
          templateName: 'orcamento_pronto',
          templateLanguage: 'pt_BR',
          templateComponents: [{
            type: 'body',
            parameters: [
              { type: 'text', text: nomeCliente },
              { type: 'text', text: String(result.pedido.numero) }
            ]
          }]
        })
      });
      enviadoWhatsapp = respWa.ok;
    } catch (err) {
      enviadoWhatsapp = false;
    }
  }

  showToast(
    (estavaEditando ? 'Orçamento nº ' + result.pedido.numero + ' atualizado e enviado' : 'Orçamento nº ' + result.pedido.numero + ' salvo e enviado') +
    ' por e-mail para ' + emailDestino + (enviadoWhatsapp ? ' e por WhatsApp.' : '.'),
    'ok'
  );
  atualizarAlertaOrcamentosPendentes();
  return true;
}

document.getElementById('btn-salvar-pedido').addEventListener('click', function () {
  var errorEl = document.getElementById('pedido-error');
  if (!validarPedido(errorEl)) return;
  document.getElementById('salvar-tipo-error').style.display = 'none';
  document.getElementById('modal-salvar-tipo').classList.add('open');
});

document.getElementById('salvar-tipo-cancelar').addEventListener('click', function () {
  document.getElementById('modal-salvar-tipo').classList.remove('open');
});

document.getElementById('salvar-tipo-imprimir').addEventListener('click', async function () {
  var btn = this;
  var errorEl = document.getElementById('salvar-tipo-error');
  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  var ok = await processarPedidoEImprimir(errorEl);

  btn.disabled = false;
  btn.textContent = 'Imprimir (2 vias)';
  if (ok) document.getElementById('modal-salvar-tipo').classList.remove('open');
});

document.getElementById('salvar-tipo-so-salvar').addEventListener('click', async function () {
  var btn = this;
  var errorEl = document.getElementById('salvar-tipo-error');
  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  var ok = await processarPedidoSoSalvar(errorEl);

  btn.disabled = false;
  btn.textContent = 'Só salvar (pendente)';
  if (ok) document.getElementById('modal-salvar-tipo').classList.remove('open');
});

document.getElementById('salvar-tipo-orcamento').addEventListener('click', async function () {
  var btn = this;
  var errorEl = document.getElementById('salvar-tipo-error');
  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  var ok = await processarOrcamentoEEnviarEmail(errorEl);

  btn.disabled = false;
  btn.textContent = 'Orçamento (enviar e-mail)';
  if (ok) document.getElementById('modal-salvar-tipo').classList.remove('open');
});

/* ===================== FORMA DE PAGAMENTO (texto p/ impressão) ===================== */

var FORMA_PAGAMENTO_LABELS = {
  boleto: 'Boleto', a_vista: 'À Vista', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', pix: 'Pix', link_pagamento: 'Link de Pagamento'
};

function formatarFormaPagamento() {
  var forma = document.getElementById('forma_pagamento').value;
  var texto = FORMA_PAGAMENTO_LABELS[forma] || '-';

  if (forma === 'boleto') {
    var qtd = document.getElementById('boleto_quantidade').value;
    var dias = document.getElementById('boleto_dias').value;
    var detalhes = [];
    if (qtd) detalhes.push(qtd + 'x');
    if (dias) detalhes.push(dias + ' dias');
    if (detalhes.length) texto += ' (' + detalhes.join(', ') + ')';
  } else if (forma === 'cartao_credito') {
    var parcelas = document.getElementById('cartao_parcelas').value;
    if (parcelas) texto += ' (' + parcelas + 'x)';
  }

  return texto;
}

function deveMostrarChavePix() {
  // O Pix aparece sempre que alguma forma de pagamento foi escolhida — o cliente
  // pode acabar pagando via Pix mesmo que o pedido tenha sido fechado em outra forma.
  return !!document.getElementById('forma_pagamento').value;
}

function obterPixDiasTexto() {
  var dias = document.getElementById('pix_dias').value;
  return dias ? dias + ' dias para pagamento' : '';
}

/* ===================== IMPRESSÃO (2 vias) ===================== */

// Documento do pedido pra fornecedor de etiqueta: modelo, caixas, valor da caixa, total por item
// e fechamento com IPI discriminado (ICMS já está no preço). Só mostra o que está preenchido.
function buildViaFornecedorEtiquetaHtml(label) {
  var dataStr = new Date().toLocaleDateString('pt-BR');
  var fornecedor = selectedCliente || {};
  var regra = regraImpostoFornecedor();
  var enderecoCompleto = [fornecedor.logradouro, fornecedor.numero, fornecedor.complemento, fornecedor.bairro, fornecedor.municipio, fornecedor.uf].filter(Boolean).join(', ');
  var valorCampo = function (id) { return (document.getElementById(id).value || '').trim(); };

  var subtotal = geraisItems.reduce(function (acc, g) { return acc + g.preco_unitario * g.quantidade; }, 0);
  var ipiValor = calcularIpiPedido();
  var totalPedido = toNumber(valorCampo('valor_total_a_pagar'));

  var linhas = geraisItems.map(function (g) {
    var rolosPorCaixa = rolosPorCaixaDoProduto(g.nome_produto);
    var valorUnidade = rolosPorCaixa ? formatBRL(g.preco_unitario * rolosPorCaixa) + ' / caixa' : formatBRL(g.preco_unitario) + (ehItemEmRolos(g.nome_produto) ? ' / rolo' : ' / un.');
    return '<tr><td>' + nomeParaFornecedor(g.nome_produto, marcaDoFornecedor()) + '</td>' +
      '<td>' + textoQuantidadeFornecedor(g) + '</td>' +
      '<td>' + valorUnidade + '</td>' +
      '<td>' + formatBRL(g.preco_unitario * g.quantidade) + '</td></tr>';
  }).join('');

  var linhaTotal = function (rotulo, valor, forte) {
    return '<tr><td style="text-align:right; border:none;' + (forte ? ' font-weight:700;' : '') + '">' + rotulo + '</td>' +
      '<td style="width:150px; text-align:right; border:none;' + (forte ? ' font-weight:700;' : '') + '">' + valor + '</td></tr>';
  };
  var totais = '<table style="width:100%; margin-top:6px;"><tbody>' +
    linhaTotal('Subtotal dos itens', formatBRL(subtotal)) +
    (regra && regra.ipi > 0 ? linhaTotal('IPI ' + formatarPercentualPedido(regra.ipi) + ' (incluído no total)', formatBRL(ipiValor)) : '') +
    linhaTotal('TOTAL DO PEDIDO', formatBRL(totalPedido), true) +
    '</tbody></table>';

  var observacoesImposto = [];
  if (regra && regra.icms > 0) observacoesImposto.push('ICMS de ' + formatarPercentualPedido(regra.icms) + ' já incluso nos valores unitários.');
  if (regra && regra.ipi > 0) observacoesImposto.push('IPI de ' + formatarPercentualPedido(regra.ipi) + ' (' + formatBRL(ipiValor) + ') incluído no valor total do pedido.');

  var linhaInfo = function (rotulo, valor) { return valor ? '<p><strong>' + rotulo + ':</strong> ' + valor + '</p>' : ''; };
  var transportadora = [valorCampo('transp_empresa'), valorCampo('transp_endereco'), valorCampo('transp_tel')].filter(Boolean).join(' — ');

  return '<div class="print-via">' +
    '<div class="print-header"><div><h2>Pedido de compra — HLN Embalagens e Equipamentos</h2>CNPJ ' + HLN_DADOS_EMPRESA.cnpj + ' — Data: ' + dataStr + '</div>' +
    '<div class="print-via-label">Via ' + (label === 'Cliente' ? 'Fornecedor' : label) + '</div></div>' +
    '<p><strong>FORNECEDOR:</strong> ' + (fornecedor.razao_social || '') + (fornecedor.nome_fantasia ? ' (' + fornecedor.nome_fantasia + ')' : '') + '</p>' +
    linhaInfo('ENDEREÇO', enderecoCompleto) +
    linhaInfo('CNPJ', fornecedor.cnpj_cpf) +
    linhaInfo('CONTATO', [fornecedor.contato_nome, fornecedor.contato_telefone, fornecedor.contato_email].filter(Boolean).join(' — ')) +
    '<table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor unitário</th><th>Valor total</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
    totais +
    (observacoesImposto.length ? '<p style="margin-top:8px;"><strong>' + observacoesImposto.join(' ') + '</strong></p>' : '') +
    linhaInfo('PRAZO DE ENTREGA', valorCampo('prazo_entrega')) +
    linhaInfo('FORMA DE PAGAMENTO', formatarFormaPagamento()) +
    linhaInfo('TRANSPORTADORA', transportadora) +
    linhaInfo('OBSERVAÇÃO', valorCampo('observacao')) +
  '</div>';
}

function buildViaHtml(label) {
  if (ehPedidoParaFornecedor() && geraisItems.length && !vacuoItems.length) return buildViaFornecedorEtiquetaHtml(label);
  var dataStr = new Date().toLocaleDateString('pt-BR');
  var cliente = selectedCliente || {};
  var enderecoCompleto = [
    cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.uf
  ].filter(Boolean).join(', ');

  var vacuoRowsHtml = vacuoItems.map(function (item) {
    var calc = calcVacuo(item);
    return '<tr>' +
      '<td>' + item.item + '</td><td>' + (item.material || '') + '</td>' +
      '<td>' + formatMedidaCm(item.largura_m) + '</td><td>' + formatMedidaCm(item.comprimento_m) + '</td><td>' + item.espessura_micras + '</td>' +
      '<td>' + (item.tipo || '') + '</td><td>' + calc.peso.toFixed(4) + '</td><td>' + item.quantidade + '</td>' +
      '<td>' + calc.peso_total.toFixed(2) + '</td><td>' + formatBRL(calc.vl_unitario) + '</td><td>' + formatBRL(calc.vl_total) + '</td>' +
    '</tr>';
  }).join('');

  var geraisRowsHtml = modoFornecedorEtiqueta()
    ? geraisItems.map(function (g) {
        return '<tr><td>' + g.nome_produto + '</td><td>' + textoQuantidadeFornecedor(g) + '</td></tr>';
      }).join('')
    : geraisItems.map(function (g) {
        return '<tr>' +
          '<td>' + nomeParaFornecedor(g.nome_produto, marcaDoFornecedor()) + '</td><td>' + (g.codigo_produto || '-') + '</td><td>' + (g.ncm || '-') + '</td>' +
          '<td>' + formatBRL(g.preco_unitario) + '</td><td>' + g.quantidade + '</td><td>' + formatBRL(g.preco_unitario * g.quantidade) + '</td>' +
        '</tr>';
      }).join('');

  var formaPagamentoLabels = {
    boleto: 'Boleto', a_vista: 'À Vista', cartao_credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito', pix: 'Pix', link_pagamento: 'Link de Pagamento'
  };
  var formaPagamentoTexto = formatarFormaPagamento();

  return '<div class="print-via">' +
    '<div class="print-header"><div><h2>Pedido — ' + (cliente.razao_social || cliente.nome_fantasia || '') + ' — HLN Embalagens e Equipamentos</h2>Data: ' + dataStr + '</div>' +
    '<div class="print-via-label">Via ' + label + '</div></div>' +
    '<p><strong>CLIENTE:</strong> ' + (cliente.razao_social || '') + (cliente.nome_fantasia ? ' (' + cliente.nome_fantasia + ')' : '') + '</p>' +
    '<p><strong>ENDEREÇO:</strong> ' + enderecoCompleto + '</p>' +
    '<p><strong>CNPJ/CPF:</strong> ' + (cliente.cnpj_cpf || '') + ' &nbsp; <strong>CÓDIGO:</strong> ' + (cliente.codigo || '') + ' &nbsp; <strong>I.E:</strong> ' + (cliente.ie || '') + '</p>' +
    '<p><strong>CONTATO:</strong> ' + (cliente.contato_nome || '') + ' &nbsp; <strong>TEL:</strong> ' + (cliente.contato_telefone || '') + ' &nbsp; <strong>EMAIL:</strong> ' + (cliente.contato_email || '') + '</p>' +
    (vacuoRowsHtml ? '<table><thead><tr><th>Item</th><th>Material</th><th>Larg.</th><th>Comp.</th><th>Esp.</th><th>Tipo</th><th>Peso</th><th>Qtd</th><th>Peso Total</th><th>Vl. Unit.</th><th>Vl. Total</th></tr></thead><tbody>' + vacuoRowsHtml + '</tbody></table>' : '') +
    (geraisRowsHtml ? (modoFornecedorEtiqueta()
      ? '<table><thead><tr><th>Produto</th><th>Quantidade</th></tr></thead><tbody>' + geraisRowsHtml + '</tbody></table>'
      : '<table><thead><tr><th>Produto</th><th>Código</th><th>NCM</th><th>Vl. Unit.</th><th>Qtd</th><th>Vl. Total</th></tr></thead><tbody>' + geraisRowsHtml + '</tbody></table>') : '') +
    '<p><strong>PRAZO DE ENTREGA:</strong> ' + (document.getElementById('prazo_entrega').value || '') + '</p>' +
    '<p><strong>ICMS:</strong> ' + (document.getElementById('icms').value || '') + ' &nbsp; <strong>IPI:</strong> ' + (document.getElementById('ipi').value || '') + ' &nbsp; <strong>REGIME:</strong> ' + (document.getElementById('regime_tributacao').value || '') + '</p>' +
    '<p><strong>TRANSPORTADORA:</strong> ' + (document.getElementById('transp_empresa').value || '') + ' — ' + (document.getElementById('transp_endereco').value || '') + ' — ' + (document.getElementById('transp_tel').value || '') + '</p>' +
    '<p><strong>OBSERVAÇÃO:</strong> ' + (document.getElementById('observacao').value || '') + '</p>' +
    '<p><strong>FORMA DE PAGAMENTO:</strong> ' + formaPagamentoTexto + ' &nbsp; <strong>VALOR TOTAL A PAGAR:</strong> ' + formatBRL(document.getElementById('valor_total_a_pagar').value) + '</p>' +
    (deveMostrarDescontoVista() ? '<p><strong>TOTAL A PAGAR À VISTA:</strong> ' + formatBRL(document.getElementById('valor_total_a_pagar_vista').value) + '</p>' : '') +
    (deveMostrarChavePix() ? '<p><strong>CHAVE PIX:</strong> 66878650000142' + (obterPixDiasTexto() ? ' &nbsp; <strong>Pix:</strong> ' + obterPixDiasTexto() : '') + '</p>' : '') +
  '</div>';
}

/* ===================== ORÇAMENTO (A4, papel timbrado) ===================== */

var HLN_DADOS_EMPRESA = {
  cnpj: '66.878.650/0001-42',
  endereco: 'Jardim Nossa Senhora de Fátima, Americana - SP, CEP 13478-570'
};

var BRAND_MARK_HTML =
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

function buildOrcamentoHtml() {
  var dataStr = new Date().toLocaleDateString('pt-BR');
  var cliente = selectedCliente || {};
  var enderecoCompleto = [
    cliente.logradouro, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.uf
  ].filter(Boolean).join(', ');

  var vacuoRowsHtml = vacuoItems.map(function (item) {
    var calc = calcVacuo(item);
    return '<tr>' +
      '<td>' + (item.material || 'SACO A VÁCUO') + '</td>' +
      '<td>' + formatMedidaCm(item.largura_m) + 'x' + formatMedidaCm(item.comprimento_m) + 'x' + item.espessura_micras + (item.tipo ? ' — ' + item.tipo : '') + '</td>' +
      '<td>' + item.quantidade + '</td><td>' + formatBRL(calc.vl_unitario) + '</td><td>' + formatBRL(calc.vl_total) + '</td>' +
    '</tr>';
  }).join('');

  var geraisRowsHtml = geraisItems.map(function (g) {
    return '<tr>' +
      '<td>' + g.nome_produto + '</td><td>—</td>' +
      '<td>' + g.quantidade + '</td><td>' + formatBRL(g.preco_unitario) + '</td><td>' + formatBRL(g.preco_unitario * g.quantidade) + '</td>' +
    '</tr>';
  }).join('');

  var formaPagamentoTexto = formatarFormaPagamento();

  return '<div class="orcamento-via">' +
    '<div class="orcamento-header">' +
      '<div>' + BRAND_MARK_HTML +
        '<div class="orcamento-empresa-dados">' +
          'HLN Embalagens e Equipamentos<br>' +
          'CNPJ: ' + HLN_DADOS_EMPRESA.cnpj + '<br>' +
          HLN_DADOS_EMPRESA.endereco +
        '</div>' +
      '</div>' +
      '<div class="orcamento-titulo"><h1>ORÇAMENTO</h1>Data: ' + dataStr + '</div>' +
    '</div>' +

    '<div class="secao-titulo">Cliente</div>' +
    '<p><strong>' + (cliente.razao_social || '') + (cliente.nome_fantasia ? ' (' + cliente.nome_fantasia + ')' : '') + '</strong></p>' +
    '<p>' + enderecoCompleto + '</p>' +
    '<p>CNPJ/CPF: ' + (cliente.cnpj_cpf || '') + (cliente.contato_nome ? ' &nbsp; Contato: ' + cliente.contato_nome : '') +
      (cliente.contato_telefone ? ' — ' + cliente.contato_telefone : '') + '</p>' +

    '<div class="secao-titulo">Itens</div>' +
    (vacuoRowsHtml || geraisRowsHtml
      ? '<table><thead><tr><th>Produto</th><th>Especificação</th><th>Qtd</th><th>Vl. Unit.</th><th>Vl. Total</th></tr></thead><tbody>' + vacuoRowsHtml + geraisRowsHtml + '</tbody></table>'
      : '<p>Nenhum item adicionado.</p>') +

    '<div class="secao-titulo">Condições</div>' +
    '<p><strong>Prazo de entrega:</strong> ' + (document.getElementById('prazo_entrega').value || '') +
      ' &nbsp; <strong>Forma de pagamento:</strong> ' + formaPagamentoTexto + '</p>' +
    '<p><strong>Valor total:</strong> ' + formatBRL(document.getElementById('valor_total_a_pagar').value) + '</p>' +
    (deveMostrarDescontoVista() ? '<p><strong>Total à vista:</strong> ' + formatBRL(document.getElementById('valor_total_a_pagar_vista').value) + '</p>' : '') +
    (deveMostrarChavePix() ? '<p><strong>Chave PIX:</strong> 66878650000142' + (obterPixDiasTexto() ? ' &nbsp; <strong>Pix:</strong> ' + obterPixDiasTexto() : '') + '</p>' : '') +
  '</div>';
}

var originalDocumentTitle = document.title;

document.getElementById('btn-imprimir').addEventListener('click', function () {
  if (!selectedCliente) {
    showToast('Selecione um cliente antes de imprimir.', 'warning');
    return;
  }
  document.getElementById('print-sheet').innerHTML = buildViaHtml('Cliente') + buildViaHtml('Empresa');
  document.getElementById('orcamento-sheet').innerHTML = ''; // evita sobrepor com um orçamento gerado antes

  // O nome sugerido ao salvar como PDF vem do document.title — troca temporariamente
  // para o nome do cliente, assim os PDFs saem identificados em vez de todos com o mesmo nome.
  var nomeCliente = selectedCliente.razao_social || selectedCliente.nome_fantasia || 'Pedido';
  document.title = nomeCliente + ' - Portal HLN';

  window.print();
});

document.getElementById('btn-orcamento').addEventListener('click', function () {
  var errorEl = document.getElementById('pedido-error');
  if (!validarPedido(errorEl)) return;

  document.getElementById('orcamento-preview-conteudo').innerHTML = buildOrcamentoHtml();
  document.getElementById('orcamento-preview-error').style.display = 'none';
  document.getElementById('modal-orcamento-preview').classList.add('open');
});

document.getElementById('orcamento-preview-cancelar').addEventListener('click', function () {
  document.getElementById('modal-orcamento-preview').classList.remove('open');
});

document.getElementById('orcamento-preview-confirmar').addEventListener('click', async function () {
  var btn = this;
  var errorEl = document.getElementById('orcamento-preview-error');
  var estavaEditando = !!pedidoEmEdicaoId;
  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  var result = await salvarPedidoNoBanco('orcamento', 'pendente');

  btn.disabled = false;
  btn.textContent = 'Confirmar e Imprimir';

  if (result.error) {
    errorEl.textContent = 'Erro ao salvar orçamento: ' + result.error.message;
    errorEl.style.display = 'block';
    return;
  }

  document.getElementById('modal-orcamento-preview').classList.remove('open');
  document.getElementById('orcamento-sheet').innerHTML = buildOrcamentoHtml();
  document.getElementById('print-sheet').innerHTML = ''; // evita sobrepor com um romaneio gerado antes

  var nomeCliente = selectedCliente.razao_social || selectedCliente.nome_fantasia || 'Orcamento';
  document.title = 'Orçamento - ' + nomeCliente + ' - Portal HLN';

  window.print();

  showToast((estavaEditando ? 'Orçamento nº ' + result.pedido.numero + ' atualizado.' : 'Orçamento nº ' + result.pedido.numero + ' salvo como pendente.'), 'ok');
  atualizarAlertaOrcamentosPendentes();
});

document.getElementById('orcamento-preview-enviar-email').addEventListener('click', async function () {
  var btn = this;
  var errorEl = document.getElementById('orcamento-preview-error');
  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  var ok = await processarOrcamentoEEnviarEmail(errorEl);

  btn.disabled = false;
  btn.textContent = 'Confirmar e Enviar por E-mail';
  if (ok) document.getElementById('modal-orcamento-preview').classList.remove('open');
});

window.addEventListener('afterprint', function () {
  document.title = originalDocumentTitle;
});

/* ===================== EDITAR PEDIDO/ORÇAMENTO EXISTENTE ===================== */

async function iniciarEdicaoPedido(pedidoId) {
  var { data: pedido, error } = await supabaseClient
    .from('pedidos')
    .select('*, pedido_itens_vacuo(*), pedido_itens_gerais(*)')
    .eq('id', pedidoId)
    .single();

  if (error || !pedido) {
    showToast('Não foi possível carregar esse registro para edição.', 'error');
    return;
  }

  // limpa o formulário atual antes de popular
  vacuoItems = [];
  geraisItems = [];
  document.getElementById('vacuo-items').innerHTML = '';
  valorTotalManuallyEdited = false;
  valorVistaManuallyEdited = false;

  document.getElementById('select-cliente').value = pedido.cliente_id || '';
  document.getElementById('select-cliente').dispatchEvent(new Event('change', { bubbles: true }));

  var vendedorSelect = document.getElementById('vendedor_responsavel');
  if (vendedorSelect) vendedorSelect.value = (pedido.vendedor_id && pedido.vendedor_id !== currentUserId) ? pedido.vendedor_id : '';

  (pedido.pedido_itens_vacuo || []).slice().sort(function (a, b) { return a.ordem - b.ordem; }).forEach(function (i) {
    var item = {
      _id: uid(), item: i.item, material: i.material, largura_m: parseFloat(i.largura_m) || 0,
      comprimento_m: parseFloat(i.comprimento_m) || 0, espessura_micras: parseFloat(i.espessura_micras) || 0,
      tipo: i.tipo, quantidade: parseFloat(i.quantidade) || 0, taxa_preco_peso: parseFloat(i.taxa_preco_peso) || 0,
      _fatorEditado: true
    };
    vacuoItems.push(item);
    renderVacuoRow(item);
  });

  geraisItems = (pedido.pedido_itens_gerais || []).slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (g) {
    return {
      _id: uid(), produto_catalogo_id: g.produto_catalogo_id, nome_produto: g.nome_produto,
      codigo_produto: g.codigo_produto, ncm: g.ncm, preco_unitario: parseFloat(g.preco_unitario) || 0,
      quantidade: parseFloat(g.quantidade) || 0
    };
  });
  renderGeraisItems();

  document.getElementById('prazo_entrega').value = pedido.prazo_entrega || '';
  document.getElementById('icms').value = pedido.icms || '';
  document.getElementById('ipi').value = pedido.ipi || '';
  document.getElementById('regime_tributacao').value = pedido.regime_tributacao || '';
  document.getElementById('transp_empresa').value = pedido.transportadora_empresa || '';
  document.getElementById('transp_cnpj').value = pedido.transportadora_cnpj || '';
  document.getElementById('transp_endereco').value = pedido.transportadora_endereco || '';
  document.getElementById('transp_tel').value = pedido.transportadora_telefone || '';
  document.getElementById('observacao').value = pedido.observacao || '';
  document.getElementById('nf_emitida').checked = !!pedido.nf_emitida;
  document.getElementById('nf_numero').value = pedido.nf_numero || '';
  atualizarCampoNfNumero();

  var formaSelect = document.getElementById('forma_pagamento');
  formaSelect.value = pedido.forma_pagamento || '';
  formaSelect.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('boleto_quantidade').value = pedido.boleto_quantidade || '';
  document.getElementById('boleto_dias').value = pedido.boleto_dias || '';
  document.getElementById('cartao_parcelas').value = pedido.cartao_parcelas || '';
  document.getElementById('pix_dias').value = pedido.pix_dias || '';

  // Só trava o recálculo automático se o valor salvo já era diferente da soma
  // dos itens (ou seja, alguém ajustou manualmente antes) — assim, corrigir uma
  // quantidade durante a edição continua atualizando o "Valor Total a Pagar"
  // sozinho, em vez de ficar travado no valor antigo salvo.
  var somaItensAtual = vacuoItems.reduce(function (acc, item) { return acc + calcVacuo(item).vl_total; }, 0) +
    geraisItems.reduce(function (acc, g) { return acc + g.preco_unitario * g.quantidade; }, 0);
  var valorSalvo = parseFloat(pedido.valor_total_a_pagar) || 0;
  valorTotalManuallyEdited = Math.abs((somaItensAtual + calcularIpiPedido()) - valorSalvo) > 0.01;
  document.getElementById('valor_total_a_pagar').value = pedido.valor_total_a_pagar || 0;

  document.getElementById('desconto_percentual').value = pedido.desconto_percentual || '';
  var valorVistaEsperado = valorSalvo * (1 - (parseFloat(pedido.desconto_percentual) || 0) / 100);
  var valorVistaSalvo = parseFloat(pedido.valor_total_a_pagar_vista) || 0;
  valorVistaManuallyEdited = Math.abs(valorVistaEsperado - valorVistaSalvo) > 0.01;
  document.getElementById('valor_total_a_pagar_vista').value = pedido.valor_total_a_pagar_vista || 0;

  updateTotals();

  pedidoEmEdicaoId = pedido.id;
  pedidoEmEdicaoTipo = pedido.tipo;
  pedidoEmEdicaoPago = !!pedido.pago;
  pedidoEmEdicaoDataPagamento = pedido.data_pagamento || null;
  var tipoLabel = pedido.tipo === 'orcamento' ? 'Orçamento' : 'Pedido';
  document.getElementById('pagina-titulo').textContent = 'Editando ' + tipoLabel + ' nº ' + pedido.numero;
  document.getElementById('edicao-banner-texto').textContent = '✏️ Editando ' + tipoLabel + ' nº ' + pedido.numero;
  document.getElementById('edicao-banner').style.display = 'flex';
  document.getElementById('btn-salvar-pedido').textContent = 'Salvar alterações';
  renderPedidoPagoStatus();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.iniciarEdicaoPedido = iniciarEdicaoPedido;

/* ===================== STATUS DE PAGAMENTO (só pra pedido já salvo, tipo "pedido") ===================== */

var pedidoEmEdicaoTipo = null;
var pedidoEmEdicaoPago = false;
var pedidoEmEdicaoDataPagamento = null;

function renderPedidoPagoStatus() {
  var el = document.getElementById('pedido-pago-status');
  if (!pedidoEmEdicaoId || pedidoEmEdicaoTipo !== 'pedido') {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = 'inline-flex';
  el.innerHTML = pedidoEmEdicaoPago
    ? '<span class="badge badge-ok">Pago' + (pedidoEmEdicaoDataPagamento ? ' em ' + new Date(pedidoEmEdicaoDataPagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '') + '</span>' +
      '<button type="button" class="btn btn-outline" style="padding:4px 10px; font-size:0.78rem;" id="btn-marcar-pendente">Marcar como pendente</button>'
    : '<span class="badge badge-warning">Pendente de pagamento</span>' +
      '<button type="button" class="btn btn-primary" style="padding:4px 10px; font-size:0.78rem;" id="btn-marcar-pago">Pago</button>';

  var btnPago = document.getElementById('btn-marcar-pago');
  if (btnPago) {
    btnPago.addEventListener('click', async function () {
      btnPago.disabled = true;
      var result = await marcarPedidoPago(pedidoEmEdicaoId, true);
      btnPago.disabled = false;
      if (result.error) { showToast('Erro ao marcar como pago: ' + result.error.message, 'error'); return; }
      pedidoEmEdicaoPago = true;
      pedidoEmEdicaoDataPagamento = result.dataPagamento;
      renderPedidoPagoStatus();
      showToast('Pedido marcado como pago.', 'ok');
    });
  }

  var btnPendente = document.getElementById('btn-marcar-pendente');
  if (btnPendente) {
    btnPendente.addEventListener('click', async function () {
      btnPendente.disabled = true;
      var result = await marcarPedidoPago(pedidoEmEdicaoId, false);
      btnPendente.disabled = false;
      if (result.error) { showToast('Erro: ' + result.error.message, 'error'); return; }
      pedidoEmEdicaoPago = false;
      pedidoEmEdicaoDataPagamento = null;
      renderPedidoPagoStatus();
      showToast('Pedido marcado como pendente de pagamento.', 'ok');
    });
  }
}

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  currentUserId = auth.session.user.id;
  currentUserRole = auth.profile.role;
  await loadClientesSelect();
  await loadVendedoresSelect();
  await carregarFatorPadrao();
  await carregarFatoresVendaTipo();
  renderGeraisItems();
  updateTotals();

  var params = new URLSearchParams(location.search);
  var editarId = params.get('editar');
  var clienteId = params.get('cliente');
  if (editarId) {
    iniciarEdicaoPedido(editarId);
  } else if (clienteId) {
    // Veio do botão "Pedido" na busca de Clientes — já chega com o cliente selecionado.
    var selectCliente = document.getElementById('select-cliente');
    selectCliente.value = clienteId;
    selectCliente.dispatchEvent(new Event('change'));
  }
})();
