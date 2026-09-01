function formatBRLDash(n) {
  return 'R$ ' + (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDataDash(iso) {
  var d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function diasDesde(iso) {
  var ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function semaforoClasse(dias) {
  if (dias <= 30) return 'semaforo-verde';
  if (dias <= 60) return 'semaforo-amarelo';
  return 'semaforo-vermelho';
}

/* ===================== TOP CLIENTES + SEMÁFORO ===================== */

async function carregarClientesRanking() {
  var { data, error } = await supabaseClient
    .from('pedidos')
    .select('cliente_id, valor_total_a_pagar, created_at, clientes(razao_social, nome_fantasia, municipio, uf)')
    .eq('tipo', 'pedido')
    .order('created_at', { ascending: false });

  var topEl = document.getElementById('top-clientes');
  var semaforoTbody = document.getElementById('semaforo-tbody');
  var heatmapEl = document.getElementById('heatmap-uf');

  if (error) {
    topEl.innerHTML = '<p class="dashboard-empty">Erro ao carregar: ' + error.message + '</p>';
    semaforoTbody.innerHTML = '<tr><td colspan="5">Erro ao carregar.</td></tr>';
    heatmapEl.innerHTML = '<p class="dashboard-empty">Erro ao carregar.</p>';
    return;
  }

  var pedidos = (data || []).filter(function (p) { return p.cliente_id && p.clientes; });

  if (!pedidos.length) {
    topEl.innerHTML = '<p class="dashboard-empty">Nenhum pedido confirmado ainda.</p>';
    semaforoTbody.innerHTML = '<tr><td colspan="5">Nenhum pedido confirmado ainda.</td></tr>';
    heatmapEl.innerHTML = '<p class="dashboard-empty">Nenhum pedido confirmado ainda.</p>';
    return;
  }

  // Agrupa por cliente — pedidos já vem ordenado por created_at desc, então o
  // primeiro pedido encontrado de cada cliente já é a compra mais recente dele.
  var porCliente = {};
  pedidos.forEach(function (p) {
    var id = p.cliente_id;
    if (!porCliente[id]) {
      porCliente[id] = {
        cliente: p.clientes, total: 0, qtdPedidos: 0, ultimaCompra: p.created_at
      };
    }
    porCliente[id].total += parseFloat(p.valor_total_a_pagar) || 0;
    porCliente[id].qtdPedidos += 1;
  });

  var lista = Object.keys(porCliente).map(function (id) { return porCliente[id]; });

  // Top 5 por valor total comprado
  var top5 = lista.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
  topEl.innerHTML = top5.map(function (c, idx) {
    var dias = diasDesde(c.ultimaCompra);
    var nome = c.cliente.razao_social + (c.cliente.nome_fantasia ? ' (' + c.cliente.nome_fantasia + ')' : '');
    return '<div class="ranking-row">' +
      '<div class="ranking-pos">' + (idx + 1) + '</div>' +
      '<span class="semaforo-dot ' + semaforoClasse(dias) + '" title="Última compra há ' + dias + ' dia(s)"></span>' +
      '<div class="ranking-info">' +
        '<div class="ranking-nome">' + nome + '</div>' +
        '<div class="ranking-sub">' + c.qtdPedidos + ' pedido(s) — ' + (c.cliente.municipio || '—') + (c.cliente.uf ? '/' + c.cliente.uf : '') + '</div>' +
      '</div>' +
      '<div class="ranking-valor">' + formatBRLDash(c.total) + '</div>' +
    '</div>';
  }).join('');

  // Semáforo — todos os clientes com pedido, ordenados da compra mais recente pra mais antiga
  var todosOrdenados = lista.slice().sort(function (a, b) { return new Date(b.ultimaCompra) - new Date(a.ultimaCompra); });
  semaforoTbody.innerHTML = todosOrdenados.map(function (c) {
    var dias = diasDesde(c.ultimaCompra);
    var nome = c.cliente.razao_social + (c.cliente.nome_fantasia ? ' (' + c.cliente.nome_fantasia + ')' : '');
    var localidade = [c.cliente.municipio, c.cliente.uf].filter(Boolean).join('/') || '—';
    return '<tr>' +
      '<td><span class="semaforo-dot ' + semaforoClasse(dias) + '"></span></td>' +
      '<td>' + nome + '</td>' +
      '<td>' + localidade + '</td>' +
      '<td>' + formatDataDash(c.ultimaCompra) + '</td>' +
      '<td>' + dias + ' dia(s)</td>' +
    '</tr>';
  }).join('');

  // Mapa de calor por UF — conta pedidos por estado do cliente
  var porUf = {};
  pedidos.forEach(function (p) {
    var uf = (p.clientes.uf || '').toUpperCase().trim();
    if (!uf) return;
    porUf[uf] = (porUf[uf] || 0) + 1;
  });

  var ufsOrdenadas = Object.keys(porUf).sort(function (a, b) { return porUf[b] - porUf[a]; });
  if (!ufsOrdenadas.length) {
    heatmapEl.innerHTML = '<p class="dashboard-empty">Nenhum cliente com UF cadastrada ainda.</p>';
  } else {
    var maxCount = porUf[ufsOrdenadas[0]];
    heatmapEl.innerHTML = ufsOrdenadas.map(function (uf) {
      var count = porUf[uf];
      var intensidade = 0.35 + 0.65 * (count / maxCount); // 0.35 a 1.0 de opacidade
      return '<div class="heatmap-cell" style="background: rgba(47, 125, 225, ' + intensidade.toFixed(2) + ');">' +
        '<span class="heatmap-uf">' + uf + '</span>' +
        '<span class="heatmap-count">' + count + ' pedido(s)</span>' +
      '</div>';
    }).join('');
  }
}

/* ===================== PRODUTOS MAIS VENDIDOS ===================== */

async function carregarProdutosRanking() {
  var topEl = document.getElementById('top-produtos');

  var [geraisRes, vacuoRes] = await Promise.all([
    supabaseClient.from('pedido_itens_gerais').select('nome_produto, quantidade, pedidos!inner(tipo)').eq('pedidos.tipo', 'pedido'),
    supabaseClient.from('pedido_itens_vacuo').select('material, tipo, quantidade, pedidos!inner(tipo)').eq('pedidos.tipo', 'pedido')
  ]);

  if (geraisRes.error && vacuoRes.error) {
    topEl.innerHTML = '<p class="dashboard-empty">Erro ao carregar produtos.</p>';
    return;
  }

  var porProduto = {};
  (geraisRes.data || []).forEach(function (i) {
    var nome = i.nome_produto || 'Produto sem nome';
    porProduto[nome] = (porProduto[nome] || 0) + (parseFloat(i.quantidade) || 0);
  });
  (vacuoRes.data || []).forEach(function (i) {
    var nome = 'Saco a Vácuo' + (i.material ? ' — ' + i.material : '') + (i.tipo ? ' / ' + i.tipo : '');
    porProduto[nome] = (porProduto[nome] || 0) + (parseFloat(i.quantidade) || 0);
  });

  var ranking = Object.keys(porProduto)
    .map(function (nome) { return { nome: nome, quantidade: porProduto[nome] }; })
    .sort(function (a, b) { return b.quantidade - a.quantidade; })
    .slice(0, 5);

  if (!ranking.length) {
    topEl.innerHTML = '<p class="dashboard-empty">Nenhum item vendido ainda.</p>';
    return;
  }

  topEl.innerHTML = ranking.map(function (p, idx) {
    return '<div class="ranking-row">' +
      '<div class="ranking-pos">' + (idx + 1) + '</div>' +
      '<div class="ranking-info"><div class="ranking-nome">' + p.nome + '</div></div>' +
      '<div class="ranking-valor">' + p.quantidade.toLocaleString('pt-BR') + ' un.</div>' +
    '</div>';
  }).join('');
}

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  carregarClientesRanking();
  carregarProdutosRanking();
})();
