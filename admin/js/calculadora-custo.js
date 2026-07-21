// Aceita números no formato brasileiro (vírgula decimal, ponto de milhar) —
// ex: "1.000,00" ou "0,20" — além do formato com ponto, para não travar quem digitar do jeito antigo.
function toNumberCusto(v) {
  if (v == null) return 0;
  var s = String(v).trim();
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatBRLCusto(n) {
  return 'R$ ' + (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Mesma fórmula da calculadora de pedido (Peso = Larg × Comp × Espessura).
// Aqui usamos o peso para converter o preço TOTAL do concorrente em R$/Peso.
function calcularValorConcorrente() {
  var largura = toNumberCusto(document.getElementById('cc-largura').value);
  var comprimento = toNumberCusto(document.getElementById('cc-comprimento').value);
  var espessura = toNumberCusto(document.getElementById('cc-espessura').value);
  var quantidade = toNumberCusto(document.getElementById('cc-quantidade').value);
  var precoConcorrente = toNumberCusto(document.getElementById('cc-preco-concorrente').value);

  var pesoUnitario = largura * comprimento * espessura;
  var pesoTotal = pesoUnitario * quantidade;
  var precoConcorrentePorPeso = pesoTotal > 0 ? (precoConcorrente / pesoTotal) : 0;

  document.getElementById('cc-peso-unitario').textContent = pesoUnitario.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  document.getElementById('cc-peso-total').textContent = pesoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  document.getElementById('cc-preco-concorrente-peso').textContent = formatBRLCusto(precoConcorrentePorPeso);
}

['cc-largura', 'cc-comprimento', 'cc-espessura', 'cc-quantidade', 'cc-preco-concorrente'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', calcularValorConcorrente);
});

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;

  calcularValorConcorrente();
})();
