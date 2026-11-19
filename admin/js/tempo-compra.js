/* Tempo de compra por cliente — regras:
   < 30 dias  -> "N dias"
   30 a 364   -> meses (30 = 1 mês, 60 = 2 meses, 180 = 6 meses)
   365 ou +   -> anos (365 = 1 ano) */

function formatarTempoCompra(dias) {
  dias = Math.max(0, Math.round(Number(dias) || 0));
  if (dias === 0) return 'hoje';
  if (dias < 30) return dias + (dias === 1 ? ' dia' : ' dias');
  if (dias < 365) {
    var m = Math.min(11, Math.floor(dias / 30));
    return m + (m === 1 ? ' mês' : ' meses');
  }
  var a = Math.floor(dias / 365);
  var restoMeses = Math.floor((dias - a * 365) / 30);
  var txt = a + (a === 1 ? ' ano' : ' anos');
  if (restoMeses > 0) txt += ' e ' + restoMeses + (restoMeses === 1 ? ' mês' : ' meses');
  return txt;
}

// Texto completo: "1 mês (35 dias)". Abaixo de 30 dias só os dias.
function formatarTempoCompraCompleto(dias) {
  dias = Math.max(0, Math.round(Number(dias) || 0));
  var base = formatarTempoCompra(dias);
  return dias >= 30 ? base + ' (' + dias + ' dias)' : base;
}

function diasEntreDatas(isoA, isoB) {
  return Math.floor((new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000);
}

// datas: lista de ISO (qualquer ordem). Retorna estatísticas de recompra do cliente.
function estatisticasCompra(datas, agora) {
  var ref = agora ? new Date(agora).getTime() : Date.now();
  var ordenadas = (datas || []).map(function (d) { return new Date(d).getTime(); })
    .filter(function (t) { return !isNaN(t); }).sort(function (a, b) { return a - b; });
  if (!ordenadas.length) return null;

  var intervalos = [];
  for (var i = 1; i < ordenadas.length; i++) {
    intervalos.push(Math.floor((ordenadas[i] - ordenadas[i - 1]) / 86400000));
  }
  var media = intervalos.length
    ? Math.round(intervalos.reduce(function (s, v) { return s + v; }, 0) / intervalos.length)
    : null;
  var ultima = ordenadas[ordenadas.length - 1];
  var diasUltima = Math.floor((ref - ultima) / 86400000);

  // "Compra todo mês": pelo menos 3 pedidos e intervalo médio entre ~3 semanas e ~6 semanas.
  var mensal = ordenadas.length >= 3 && media != null && media >= 20 && media <= 45;

  return {
    pedidos: ordenadas.length,
    ultimaCompra: new Date(ultima).toISOString(),
    diasDesdeUltima: diasUltima,
    intervaloMedio: media,
    mensal: mensal,
    // Hora de ligar: já passou (quase) o intervalo médio desde a última compra.
    horaDeLigar: mensal && diasUltima >= media - 5,
    atrasado: media != null && diasUltima > media + 7
  };
}

// Agrupa pedidos [{cliente_id, created_at}] por cliente e devolve {cliente_id: estatisticas}.
function estatisticasPorCliente(pedidos, agora) {
  var porCliente = {};
  (pedidos || []).forEach(function (p) {
    if (!p.cliente_id) return;
    (porCliente[p.cliente_id] = porCliente[p.cliente_id] || []).push(p.created_at);
  });
  var out = {};
  Object.keys(porCliente).forEach(function (id) { out[id] = estatisticasCompra(porCliente[id], agora); });
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { formatarTempoCompra: formatarTempoCompra, formatarTempoCompraCompleto: formatarTempoCompraCompleto, estatisticasCompra: estatisticasCompra, estatisticasPorCliente: estatisticasPorCliente, diasEntreDatas: diasEntreDatas };
}
