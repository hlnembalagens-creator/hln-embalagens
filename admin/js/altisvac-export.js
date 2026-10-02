// Exporta um pedido de embalagem a vácuo no formato EXATO da planilha que a
// Altisvac recebe (admin/templates/solicitacao-pedido-altisvac.xlsx). O modelo é
// carregado e só as células de itens são preenchidas — layout, formatação,
// fórmulas e demais campos ficam exatamente como no original. O Fator (preço)
// não vai pra planilha: só tipo/material, medidas e quantidade.

var ALTISVAC_TEMPLATE_URL = 'templates/solicitacao-pedido-altisvac.xlsx';
var ALTISVAC_PRIMEIRA_LINHA = 11;
var ALTISVAC_ULTIMA_LINHA = 28; // a planilha comporta 18 itens

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

// Preenche as linhas de itens (B, C, D, E, F, H). Linhas sem item não são tocadas.
function preencherPlanilhaAltisvac(workbook, itens) {
  var ws = workbook.worksheets[0];
  itens.forEach(function (item, idx) {
    var r = ALTISVAC_PRIMEIRA_LINHA + idx;
    ws.getCell('B' + r).value = String(item.material || '').trim().toUpperCase();
    ws.getCell('C' + r).value = arredondarMedida(item.largura_m);
    ws.getCell('D' + r).value = arredondarMedida(item.comprimento_m);
    ws.getCell('E' + r).value = parseFloat(item.espessura_micras) || 0;
    var tipo = String(item.tipo || '').trim().toUpperCase();
    if (tipo) ws.getCell('F' + r).value = tipo; // sem tipo, mantém o NATURAL do modelo
    ws.getCell('H' + r).value = parseFloat(item.quantidade) || 0;
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

  preencherPlanilhaAltisvac(workbook, validos);

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
