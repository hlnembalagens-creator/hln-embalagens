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

// Alguns fornecedores embalam diferente da regra geral — identificados pela marca no nome do
// produto. Thermoprint: caixa de 60 mm de 30 m tem 32 rolos (40 mm de 30 m = 48, igual à regra geral).
// Capital: caixa de 40 mm de 30 m tem 60 rolos (a regra geral dá 48).
var ROLOS_POR_CAIXA_POR_MARCA = {
  THERMO: { 60: { 30: 32 } },
  CAPITAL: { 40: { 30: 60 } }
};

function rolosPorCaixaDoProduto(nomeProduto) {
  var medidas = medidasEtiqueta(nomeProduto);
  if (!medidas) return null;
  var nome = String(nomeProduto || '').toUpperCase();
  var marcas = Object.keys(ROLOS_POR_CAIXA_POR_MARCA);
  for (var i = 0; i < marcas.length; i++) {
    if (nome.indexOf(marcas[i]) === -1) continue;
    var porLargura = ROLOS_POR_CAIXA_POR_MARCA[marcas[i]][medidas.largura];
    if (porLargura && porLargura[medidas.metragem]) return porLargura[medidas.metragem];
  }
  return rolosPorCaixaEtiqueta(medidas.largura, medidas.metragem);
}

// Cada fornecedor tem uma "marca" cadastrada (ex: THERMO, ALTISVAC) que a gente coloca no fim do nome
// dos produtos dele (ex: "Etiqueta 60X40 - 30M - THERMO"). A marca identifica de quem é o produto,
// define quais itens levam o IPI/ICMS do fornecedor e NÃO aparece nos documentos enviados a ele.
function itemSujeitoIpiFornecedor(nomeProduto, marca) {
  var m = String(marca || '').trim();
  if (!m) return true; // fornecedor sem marca: a regra vale pra todos os itens dele
  return String(nomeProduto || '').toUpperCase().indexOf(m.toUpperCase()) !== -1;
}

// Nome como o fornecedor conhece (sem a marca que usamos só pra identificar).
function nomeParaFornecedor(nomeProduto, marca) {
  var nome = String(nomeProduto || '').trim();
  var m = String(marca || '').trim();
  if (!m) return nome;
  var escapada = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return nome.replace(new RegExp('\\s*-?\\s*' + escapada + '\\b', 'i'), '').trim();
}

// Marcas de TODOS os fornecedores (a lista é completada com as cadastradas em Clientes). Nenhum documento
// (orçamento, pedido de venda ou de compra) mostra a marca: ela é só um marcador interno.
var MARCAS_FORNECEDOR = ['THERMO', 'ALTISVAC', 'CAPITAL', 'BRASIL PDV'];

function registrarMarcasFornecedor(clientes) {
  (clientes || []).forEach(function (c) {
    var m = String((c && c.marca_produto) || '').trim().toUpperCase();
    if (m && MARCAS_FORNECEDOR.indexOf(m) === -1) MARCAS_FORNECEDOR.push(m);
  });
}

function nomeSemMarcas(nomeProduto) {
  var nome = String(nomeProduto || '').trim();
  MARCAS_FORNECEDOR.forEach(function (m) {
    var escapada = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nome = nome.replace(new RegExp('\\s*-?\\s*\\b' + escapada + '\\b', 'gi'), '');
  });
  return nome.replace(/^\s*-\s*/, '').replace(/\s*-\s*$/, '').replace(/\s{2,}/g, ' ').trim();
}

// Produto novo vindo de um fornecedor com marca já nasce identificado: "<descrição> - MARCA".
function aplicarMarcaNoNome(nomeProduto, marca) {
  var nome = String(nomeProduto || '').trim();
  var m = String(marca || '').trim();
  if (!m || nome.toUpperCase().indexOf(m.toUpperCase()) !== -1) return nome;
  return nome + ' - ' + m;
}
