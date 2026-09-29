function formatBRLDash(n) {
  return 'R$ ' + (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDataDash(iso) {
  var d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function formatCmDash(metros) {
  return Math.round((parseFloat(metros) || 0) * 100);
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

/* ===================== BUSCA COMPARTILHADA ===================== */

// Uma única busca de pedidos confirmados, reaproveitada pelos KPIs, gráficos
// e rankings — evita repetir a mesma query várias vezes na mesma tela.
async function buscarPedidosDashboard(vendedorId) {
  var { data, error } = await supabaseClient
    .from('pedidos')
    .select('cliente_id, vendedor_id, valor_total_a_pagar, created_at, pago, clientes(razao_social, nome_fantasia, municipio, uf, eh_fornecedor)')
    .eq('tipo', 'pedido')
    .order('created_at', { ascending: false });

  if (error) return { error: error };

  // Cadastros marcados como fornecedor (ex: Altisvac) são pedidos feitos por nós a
  // eles, não vendas — não entram nos números. Vendedor só enxerga as vendas dele.
  var pedidos = (data || []).filter(function (p) {
    if (!p.cliente_id || !p.clientes || p.clientes.eh_fornecedor) return false;
    if (vendedorId && p.vendedor_id !== vendedorId) return false;
    return true;
  });

  return { pedidos: pedidos };
}

/* ===================== KPIS + GRÁFICOS ===================== */

function mesmoMes(dataIso, ref) {
  var d = new Date(dataIso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

async function carregarKpisEGraficos(pedidos) {
  var agora = new Date();
  var pedidosMes = pedidos.filter(function (p) { return mesmoMes(p.created_at, agora); });

  var faturamentoMes = pedidosMes.reduce(function (acc, p) { return acc + (parseFloat(p.valor_total_a_pagar) || 0); }, 0);
  var ticketMedio = pedidosMes.length ? faturamentoMes / pedidosMes.length : 0;

  document.getElementById('kpi-faturamento').textContent = formatBRLDash(faturamentoMes);
  document.getElementById('kpi-faturamento-sub').textContent = pedidosMes.length + ' pedido(s) este mês';
  document.getElementById('kpi-pedidos').textContent = pedidosMes.length.toLocaleString('pt-BR');
  document.getElementById('kpi-ticket').textContent = formatBRLDash(ticketMedio);

  // Clientes ativos = distintos com pelo menos 1 compra nos últimos 30 dias
  var clientesRecentes = {};
  pedidos.forEach(function (p) {
    if (diasDesde(p.created_at) <= 30) clientesRecentes[p.cliente_id] = true;
  });
  document.getElementById('kpi-clientes-ativos').textContent = Object.keys(clientesRecentes).length.toLocaleString('pt-BR');

  if (typeof Chart === 'undefined') return; // CDN bloqueado/offline — KPIs continuam funcionando sem os gráficos.

  // Gráfico de barras — últimos 6 meses (incluindo meses sem venda, com 0)
  var meses = [];
  for (var i = 5; i >= 0; i--) {
    var ref = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({ ref: ref, label: ref.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), total: 0 });
  }
  pedidos.forEach(function (p) {
    var d = new Date(p.created_at);
    var mesObj = meses.find(function (m) { return m.ref.getFullYear() === d.getFullYear() && m.ref.getMonth() === d.getMonth(); });
    if (mesObj) mesObj.total += parseFloat(p.valor_total_a_pagar) || 0;
  });

  var ctxMes = document.getElementById('chart-vendas-mes');
  if (ctxMes) {
    new Chart(ctxMes, {
      type: 'bar',
      data: {
        labels: meses.map(function (m) { return m.label; }),
        datasets: [{ data: meses.map(function (m) { return m.total; }), backgroundColor: '#2f7de1', borderRadius: 6, maxBarThickness: 46 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return formatBRLDash(ctx.parsed.y); } } } },
        scales: { y: { ticks: { callback: function (v) { return 'R$ ' + v.toLocaleString('pt-BR'); } }, grid: { color: '#eef1f5' } }, x: { grid: { display: false } } }
      }
    });
  }

  // Donut — total recebido (pago) x pendente, todos os pedidos confirmados
  var totalPago = 0, totalPendente = 0;
  pedidos.forEach(function (p) {
    var v = parseFloat(p.valor_total_a_pagar) || 0;
    if (p.pago) totalPago += v; else totalPendente += v;
  });

  var ctxPago = document.getElementById('chart-pago-pendente');
  if (ctxPago) {
    new Chart(ctxPago, {
      type: 'doughnut',
      data: {
        labels: ['Recebido', 'Pendente'],
        datasets: [{ data: [totalPago, totalPendente], backgroundColor: ['#1fa855', '#e0a800'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'Open Sans' } } }, tooltip: { callbacks: { label: function (ctx) { return ctx.label + ': ' + formatBRLDash(ctx.parsed); } } } }
      }
    });
  }
}

/* ===================== TOP CLIENTES + SEMÁFORO ===================== */

function renderClientesRanking(pedidos) {
  var topEl = document.getElementById('top-clientes');
  var semaforoTbody = document.getElementById('semaforo-tbody');
  var heatmapEl = document.getElementById('heatmap-uf');

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

  // Mapa de calor por cidade — conta pedidos pelo município do cliente
  var porCidade = {};
  pedidos.forEach(function (p) {
    var cidade = (p.clientes.municipio || '').trim();
    if (!cidade) return;
    var uf = (p.clientes.uf || '').toUpperCase().trim();
    var chave = cidade + (uf ? '/' + uf : '');
    porCidade[chave] = (porCidade[chave] || 0) + 1;
  });

  var cidadesOrdenadas = Object.keys(porCidade).sort(function (a, b) { return porCidade[b] - porCidade[a]; });
  if (!cidadesOrdenadas.length) {
    heatmapEl.innerHTML = '<p class="dashboard-empty">Nenhum cliente com cidade cadastrada ainda.</p>';
  } else {
    var maxCount = porCidade[cidadesOrdenadas[0]];
    heatmapEl.innerHTML = cidadesOrdenadas.map(function (cidade) {
      var count = porCidade[cidade];
      var intensidade = 0.35 + 0.65 * (count / maxCount); // 0.35 a 1.0 de opacidade
      return '<div class="heatmap-cell" style="background: rgba(47, 125, 225, ' + intensidade.toFixed(2) + ');">' +
        '<span class="heatmap-uf">' + cidade + '</span>' +
        '<span class="heatmap-count">' + count + ' pedido(s)</span>' +
      '</div>';
    }).join('');
  }
}

/* ===================== PRODUTOS MAIS VENDIDOS ===================== */

async function carregarProdutosRanking(vendedorId) {
  var topEl = document.getElementById('top-produtos');

  var [geraisRes, vacuoRes] = await Promise.all([
    supabaseClient.from('pedido_itens_gerais').select('nome_produto, quantidade, pedidos!inner(tipo, vendedor_id, clientes(eh_fornecedor))').eq('pedidos.tipo', 'pedido'),
    supabaseClient.from('pedido_itens_vacuo').select('material, tipo, quantidade, largura_m, comprimento_m, espessura_micras, pedidos!inner(tipo, vendedor_id, clientes(eh_fornecedor))').eq('pedidos.tipo', 'pedido')
  ]);

  if (geraisRes.error && vacuoRes.error) {
    topEl.innerHTML = '<p class="dashboard-empty">Erro ao carregar produtos.</p>';
    return;
  }

  // Filtra fora itens de pedidos feitos a cadastros marcados como fornecedor
  // (ex: Altisvac) — são compras nossas, não vendas. Vendedor só enxerga as vendas dele.
  function naoEhFornecedor(i) {
    if (!i.pedidos || (i.pedidos.clientes && i.pedidos.clientes.eh_fornecedor)) return false;
    if (vendedorId && i.pedidos.vendedor_id !== vendedorId) return false;
    return true;
  }

  var porProduto = {};
  (geraisRes.data || []).filter(naoEhFornecedor).forEach(function (i) {
    var nome = i.nome_produto || 'Produto sem nome';
    porProduto[nome] = (porProduto[nome] || 0) + (parseFloat(i.quantidade) || 0);
  });
  (vacuoRes.data || []).filter(naoEhFornecedor).forEach(function (i) {
    var medidas = formatCmDash(i.largura_m) + 'X' + formatCmDash(i.comprimento_m) + 'X' + Math.round(parseFloat(i.espessura_micras) || 0);
    // Medidas logo no início do nome — é o que mais importa pra saber qual modelo vendeu,
    // então tem que aparecer mesmo se o card cortar o texto com "...".
    var nome = 'Saco a Vácuo ' + medidas + (i.material ? ' — ' + i.material : '') + (i.tipo ? ' / ' + i.tipo : '');
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

  // Vendedor só enxerga os próprios números — admin vê tudo, de todo mundo.
  var vendedorId = auth.profile.role === 'vendedor' ? auth.session.user.id : null;
  if (vendedorId) {
    var aviso = document.createElement('p');
    aviso.style.cssText = 'margin-top:-16px; margin-bottom:20px; color:var(--gray-400); font-size:0.9rem;';
    aviso.textContent = 'Mostrando apenas as suas vendas.';
    document.querySelector('.admin-title').insertAdjacentElement('afterend', aviso);
  }

  var resultado = await buscarPedidosDashboard(vendedorId);
  if (resultado.error) {
    document.getElementById('top-clientes').innerHTML = '<p class="dashboard-empty">Erro ao carregar: ' + resultado.error.message + '</p>';
  } else {
    renderClientesRanking(resultado.pedidos);
    carregarKpisEGraficos(resultado.pedidos);
  }

  carregarProdutosRanking(vendedorId);
})();
