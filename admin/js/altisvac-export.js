// Exporta um pedido de embalagem a vácuo no formato EXATO da planilha que a
// Altisvac recebe (admin/templates/solicitacao-pedido-altisvac.xlsx). O modelo é
// carregado e só as células de itens são preenchidas — layout, formatação,
// fórmulas e demais campos ficam exatamente como no original. Além de material, medidas e
// quantidade, a planilha leva o VL. UNITÁRIO e o VL. TOTAL calculados com o fator de compra
// combinado com a Altisvac (Nylon Poli 35, MRP 72, Termoencolhível 96 — lidos de Estoque →
// Fatores; esses valores só entram aqui como reserva se a leitura falhar).

var ALTISVAC_TEMPLATE_URL = 'templates/solicitacao-pedido-altisvac.xlsx';
var ALTISVAC_PRIMEIRA_LINHA = 11;
var ALTISVAC_ULTIMA_LINHA = 28; // a planilha comporta 18 itens

var FATORES_COMPRA_ALTISVAC_PADRAO = { nylon_poli: 35, mrp: 72, termoencolhivel: 96 };

function chaveTipoAltisvac(material) {
  var m = String(material || '').toLowerCase();
  if (m.indexOf('mrp') !== -1) return 'mrp';
  if (m.indexOf('term') !== -1) return 'termoencolhivel';
  if (m.indexOf('nylon') !== -1 || m.indexOf('nyon') !== -1 || m.indexOf('poli') !== -1) return 'nylon_poli';
  return null;
}

// Fatores de compra vigentes (configuracoes.fator_custo_*), com os valores combinados como reserva.
async function carregarFatoresCompraAltisvac() {
  var fatores = Object.assign({}, FATORES_COMPRA_ALTISVAC_PADRAO);
  try {
    var { data } = await supabaseClient.from('configuracoes').select('chave, valor')
      .in('chave', ['fator_custo_nylon_poli', 'fator_custo_mrp', 'fator_custo_termoencolhivel']);
    (data || []).forEach(function (r) {
      var n = parseFloat(String(r.valor).replace(',', '.'));
      if (n > 0) fatores[r.chave.replace('fator_custo_', '')] = n;
    });
  } catch (e) { /* mantém os valores combinados */ }
  return fatores;
}

function ehClienteAltisvac(cliente) {
  if (!cliente) return false;
  return ((cliente.razao_social || '') + ' ' + (cliente.nome_fantasia || '')).toUpperCase().indexOf('ALTISVAC') !== -1;
}

function carregarExcelJS() {
  if (typeof ExcelJS !== 'undefined') return Promise.resolve();
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload = resolve;
    s.onerror = function () { reject(new Error('Não foi possível carregar o gerador de planilha. Verifique a conexão e tente de novo.')); };
    document.head.appendChild(s);
  });
}

function arredondarMedida(n) {
  return Math.round((parseFloat(n) || 0) * 10000) / 10000;
}

var ALTISVAC_FORMATO_MOEDA = '[$R$ -416]#,##0.00'; // mesmo formato do cabeçalho do modelo

// Preenche as linhas de itens (B, C, D, E, F, H e os valores K/L). Linhas sem item não são tocadas.
// fatores: { nylon_poli, mrp, termoencolhivel } — sem fator pro material, usa o fator gravado no próprio item.
function preencherPlanilhaAltisvac(workbook, itens, fatores) {
  fatores = fatores || FATORES_COMPRA_ALTISVAC_PADRAO;
  var ws = workbook.worksheets[0];
  itens.forEach(function (item, idx) {
    var r = ALTISVAC_PRIMEIRA_LINHA + idx;
    ws.getCell('B' + r).value = String(item.material || '').trim().toUpperCase();
    ws.getCell('C' + r).value = arredondarMedida(item.largura_m);
    ws.getCell('D' + r).value = arredondarMedida(item.comprimento_m);
    ws.getCell('E' + r).value = parseFloat(item.espessura_micras) || 0;
    var tipo = String(item.tipo || '').trim().toUpperCase();
    if (tipo) ws.getCell('F' + r).value = tipo; // sem tipo, mantém o NATURAL do modelo
    var quantidade = parseFloat(item.quantidade) || 0;
    ws.getCell('H' + r).value = quantidade;

    // Valor = peso (larg × comp × esp) × fator de compra do material; total = quantidade × unitário.
    var chave = chaveTipoAltisvac(item.material);
    var fator = (chave && fatores[chave] > 0) ? fatores[chave] : (parseFloat(item.taxa_preco_peso) || 0);
    if (fator > 0) {
      var peso = (parseFloat(item.largura_m) || 0) * (parseFloat(item.comprimento_m) || 0) * (parseFloat(item.espessura_micras) || 0);
      var unitario = Math.round(peso * fator * 100) / 100;
      var celK = ws.getCell('K' + r);
      var celL = ws.getCell('L' + r);
      celK.value = unitario;
      celL.value = { formula: 'H' + r + '*K' + r, result: Math.round(quantidade * unitario * 100) / 100 };
      celK.numFmt = ALTISVAC_FORMATO_MOEDA;
      celL.numFmt = ALTISVAC_FORMATO_MOEDA;
    }
  });
  workbook.calcProperties = workbook.calcProperties || {};
  workbook.calcProperties.fullCalcOnLoad = true;
}

function nomeArquivoPedidoAltisvac() {
  var d = new Date();
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  return 'PEDIDO' + dd + '-' + mm + '.xlsx';
}

// itens: [{ material, largura_m, comprimento_m, espessura_micras, tipo, quantidade }]
async function exportarPlanilhaAltisvac(itens) {
  var validos = (itens || []).filter(function (i) { return (parseFloat(i.quantidade) || 0) > 0; });
  if (!validos.length) throw new Error('Nenhum item com quantidade pra exportar.');
  var maxItens = ALTISVAC_ULTIMA_LINHA - ALTISVAC_PRIMEIRA_LINHA + 1;
  if (validos.length > maxItens) {
    throw new Error('A planilha da Altisvac comporta no máximo ' + maxItens + ' itens — este pedido tem ' + validos.length + '. Divida em dois pedidos.');
  }

  await carregarExcelJS();
  var resp = await fetch(ALTISVAC_TEMPLATE_URL);
  if (!resp.ok) throw new Error('Não foi possível carregar o modelo da planilha.');
  var workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await resp.arrayBuffer());

  preencherPlanilhaAltisvac(workbook, validos, await carregarFatoresCompraAltisvac());

  var buffer = await workbook.xlsx.writeBuffer();
  var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivoPedidoAltisvac();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
