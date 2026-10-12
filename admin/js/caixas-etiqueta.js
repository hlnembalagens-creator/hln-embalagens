// Quantos rolos de etiqueta vêm em cada caixa fechada — regra compartilhada entre
// o Estoque (coluna Caixas) e o Pedido (conversão rolos <-> caixas). Largura e
// metragem são lidas do nome do produto (ex: "Etiqueta Térmica 40x40 - 21M"):
//   40 mm: 21 m = 60 rolos/caixa, 30 m = 48 rolos/caixa
//   60 mm: 21 m = 33 rolos/caixa, 30 m = 30 rolos/caixa (60xContínua segue a metragem)
// Outras larguras/metragens, ou nome sem metragem, não têm conversão (null).
function rolosPorCaixaEtiqueta(largura, metragem) {
  if (largura === 40) {
    if (metragem === 21) return 60;
    if (metragem === 30) return 48;
  }
  if (largura === 60) {
    if (metragem === 21) return 33;
    if (metragem === 30) return 30;
  }
  return null;
}

function medidasEtiqueta(nomeProduto) {
  var nome = (nomeProduto || '').toUpperCase();
  if (nome.indexOf('ETQ') === -1 && nome.indexOf('ETIQUETA') === -1) return null;
  var larg = nome.match(/(\d{2,3})\s*X/);
  // metragem escrita como 21M, 30 Mts, 30mts, 30 metros...
  var metr = nome.match(/(\d{2})\s*(?:MTS?|METROS?|M)(?![A-Z])/);
  if (!larg) return null;
  return { largura: parseInt(larg[1], 10), metragem: metr ? parseInt(metr[1], 10) : null };
}

function rolosPorCaixaDoProduto(nomeProduto) {
  var medidas = medidasEtiqueta(nomeProduto);
  return medidas ? rolosPorCaixaEtiqueta(medidas.largura, medidas.metragem) : null;
}

// Itens do fornecedor Thermoprint — identificados pelo "THERMO" no nome do produto (ex:
// "Etiqueta 60X40 - 30M - THERMO"): preço já com ICMS incluso e IPI acrescentado ao total.
// Produtos de 30 m de outros fornecedores (sem THERMO no nome) ficam fora da regra.
function itemSujeitoIpiFornecedor(nomeProduto) {
  return /THERMO/i.test(String(nomeProduto || ''));
}

// Nome como o fornecedor conhece (sem a marca THERMO que usamos só pra identificar).
function nomeParaFornecedor(nomeProduto) {
  return String(nomeProduto || '').replace(/\s*-?\s*THERMO\b/i, '').trim();
}
