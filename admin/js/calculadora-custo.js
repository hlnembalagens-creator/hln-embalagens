// Aceita números no formato brasileiro (vírgula decimal, ponto de milhar) —
// ex: "1.000,00" ou "45,7" — além do formato com ponto, para não travar quem digitar do jeito antigo.
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

// Dinheiro sempre com 2 casas decimais (ex: 1.000,00).
function formatMoedaBR(n) {
  return (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Fator é "número quebrado" solto (ex: 45,7 ou 45,5) — sem casas fixas.
function formatFatorBR(n) {
  return (parseFloat(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

var campoFator = document.getElementById('cc-fator');
var campoPrecoTotal = document.getElementById('cc-preco-total');

// Guarda qual dos dois campos (Fator ou Preço) foi digitado por último pelo usuário,
// para saber qual dos dois recalcular quando o peso mudar.
var ultimoCampoEditado = null;

function calcularPeso() {
  var largura = toNumberCusto(document.getElementById('cc-largura').value);
  var comprimento = toNumberCusto(document.getElementById('cc-comprimento').value);
  var espessura = toNumberCusto(document.getElementById('cc-espessura').value);
  var quantidade = toNumberCusto(document.getElementById('cc-quantidade').value);

  var pesoUnitario = largura * comprimento * espessura;
  var pesoTotal = pesoUnitario * quantidade;

  document.getElementById('cc-peso-unitario').textContent = pesoUnitario.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  document.getElementById('cc-peso-total').textContent = pesoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

  return pesoTotal;
}

function recalcular() {
  var pesoTotal = calcularPeso();

  if (ultimoCampoEditado === 'fator') {
    var rawFator = campoFator.value.trim();
    if (!rawFator || pesoTotal <= 0) { campoPrecoTotal.value = ''; return; }
    var fator = toNumberCusto(rawFator);
    campoPrecoTotal.value = formatMoedaBR(pesoTotal * fator);
  } else if (ultimoCampoEditado === 'preco') {
    var rawPreco = campoPrecoTotal.value.trim();
    if (!rawPreco || pesoTotal <= 0) { campoFator.value = ''; return; }
    var preco = toNumberCusto(rawPreco);
    campoFator.value = formatFatorBR(preco / pesoTotal);
  }
}

['cc-largura', 'cc-comprimento', 'cc-espessura', 'cc-quantidade'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', recalcular);
});

campoFator.addEventListener('input', function () {
  ultimoCampoEditado = 'fator';
  recalcular();
});

campoPrecoTotal.addEventListener('input', function () {
  ultimoCampoEditado = 'preco';
  recalcular();
});

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;

  calcularPeso();
})();
