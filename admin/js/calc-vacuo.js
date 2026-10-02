// Regras compartilhadas dos itens de Embalagem a Vácuo — usadas tanto no Pedido
// (cálculo do Valor Total a Pagar) quanto no Estoque (cálculo automático do
// Venda Unit. a partir do Fator padrão da empresa). Ficam nesse arquivo só,
// carregado nas duas páginas, pra nunca desalinhar o cálculo entre elas.

var CATEGORIAS_EMBALAGEM_VACUO = [
  { label: 'Nylon Poli', match: 'NYLON POLI' },
  { label: 'MRP', match: 'MRP' },
  { label: 'Termoencolhível', match: 'TERMOENCOLHIVEL' },
  { label: 'Saco PP', match: 'SACO PP' },
  { label: 'Saco PE', match: 'SACO PE' }
];

function categoriaEmbalagemDoProduto(nomeProduto) {
  var nome = (nomeProduto || '').toUpperCase();
  for (var i = 0; i < CATEGORIAS_EMBALAGEM_VACUO.length; i++) {
    if (nome.indexOf(CATEGORIAS_EMBALAGEM_VACUO[i].match) !== -1) return CATEGORIAS_EMBALAGEM_VACUO[i];
  }
  return null;
}

// Tira largura, comprimento e espessura do nome do produto — "NYLON POLI 15X20X10"
// ou "SACO A VÁCUO - NYLON POLI 0,20x0,22x120" (a notação "0,20" de metro vira
// "20" antes de extrair os números). Produtos sem as 3 medidas no nome (ex: Saco
// PP/PE, que só têm largura x comprimento) voltam com espessura 0.
function extrairMedidasVacuoDoNome(nomeProduto) {
  var limpo = (nomeProduto || '').replace(/0,(?=\d)/g, '');
  var nums = (limpo.match(/\d+/g) || []).map(function (n) { return parseInt(n, 10); });
  return { largura: nums[0] || 0, comprimento: nums[1] || 0, espessura: nums[2] || 0 };
}

// Mesma fórmula usada em pedido.js (calcVacuo): peso = larg(m) × comp(m) × espessura(µ).
function calcPesoVacuo(larguraM, comprimentoM, espessuraMicras) {
  return (larguraM || 0) * (comprimentoM || 0) * (espessuraMicras || 0);
}

function calcPrecoVacuo(larguraM, comprimentoM, espessuraMicras, fator) {
  return calcPesoVacuo(larguraM, comprimentoM, espessuraMicras) * (fator || 0);
}
