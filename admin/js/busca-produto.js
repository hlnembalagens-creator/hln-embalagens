// Busca de produto por termo e por medida — usada no Estoque e no Pedido.
//   "nylon poli"      → todos os Nylon Poli
//   "20x25"           → toda embalagem 20 x 25 (qualquer espessura)
//   "20x25x12"        → 20 x 25 com espessura 120 µ (a micra pode ser digitada "12" ou "120")
//   "20x25x120"       → idem
//   "nylon 20x25x12"  → mistura de palavras e medida
// Todos os pedaços digitados precisam bater (E). Acento e maiúscula não importam.

function normalizarBuscaProduto(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

// Largura, comprimento e espessura (como texto) do nome: "NYLON POLI 20X25X120 - ALTISVAC".
function medidasDoNomeProduto(nome) {
  var m = normalizarBuscaProduto(nome).match(/(\d+)\s*X\s*(\d+)(?:\s*X\s*(\d+))?/);
  return m ? { largura: m[1], comprimento: m[2], espessura: m[3] || '' } : null;
}

function medidaCombinaBusca(medidas, partes) {
  if (!medidas) return false;
  var dadas = partes.filter(function (p) { return p !== ''; });
  if (!dadas.length) return false;
  var alvos = [medidas.largura, medidas.comprimento];
  for (var i = 0; i < partes.length; i++) {
    var digitado = partes[i];
    if (digitado === '') continue;
    var ultimaDigitada = digitado === dadas[dadas.length - 1] && i === partes.lastIndexOf(digitado);
    if (i < 2) {
      var alvo = alvos[i];
      if (ultimaDigitada ? alvo.indexOf(digitado) !== 0 : alvo !== digitado) return false;
    } else if (i === 2) {
      // Espessura: aceita "12" (centésimos de mm) e "120" (µ). Compara como prefixo.
      var ep = medidas.espessura;
      if (!ep) return false;
      var candidatas = [ep];
      if (parseInt(ep, 10) < 50) candidatas.push(String(parseInt(ep, 10) * 10));
      if (!candidatas.some(function (c) { return c.indexOf(digitado) === 0; })) return false;
    }
  }
  return true;
}

function produtoCombinaBusca(produto, termo) {
  var consulta = normalizarBuscaProduto(termo).replace(/(\d)\s*[X×*]\s*(?=\d)/g, '$1X').trim();
  if (!consulta) return true;

  var nome = normalizarBuscaProduto(produto.nome_produto);
  var codigo = normalizarBuscaProduto(produto.codigo_produto);
  var medidas = medidasDoNomeProduto(produto.nome_produto);

  return consulta.split(/\s+/).every(function (pedaco) {
    if (/^\d+(X\d*)+$/.test(pedaco)) {
      return medidaCombinaBusca(medidas, pedaco.split('X'));
    }
    return nome.indexOf(pedaco) !== -1 || (codigo && codigo.indexOf(pedaco) !== -1);
  });
}
