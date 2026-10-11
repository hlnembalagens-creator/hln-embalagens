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

/* ===================== ESTADO + FILTRO DE PERÍODO ===================== */

var MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var todosPedidos = [];       // todos os pedidos confirmados (já sem fornecedor / só do vendedor)
var itensGeraisBrutos = [];  // itens de etiquetas/equipamentos, com a data do pedido
var itensVacuoBrutos = [];   // itens de embalagem a vácuo, com a data do pedido
var filtroMes = '';          // '' = todos, 0..11
var filtroAno = '';          // '' = todos
var graficoMes = null;
var graficoPago = null;
var erroProdutos = false;

function noPeriodo(dataIso) {
  var d = new Date(dataIso);
  if (filtroAno !== '' && d.getFullYear() !== Number(filtroAno)) return false;
  if (filtroMes !== '' && d.getMonth() !== Number(filtroMes)) return false;
  return true;
}

function descricaoPeriodo() {
  if (filtroMes === '' && filtroAno === '') return 'todo o período';
  if (filtroMes === '') return 'ano de ' + filtroAno;
  return MESES_NOME[Number(filtroMes)].toLowerCase() + (filtroAno !== '' ? ' de ' + filtroAno : ' (todos os anos)');
}

/* ===================== BUSCA COMPARTILHADA ===================== */

// Uma única busca de pedidos confirmados, reaproveitada pelos KPIs, gráficos
// e rankings — o filtro de mês/ano trabalha em cima desses dados já carregados.
async function buscarPedidosDashboard(vendedorId) {
  var { data, error } = await supabaseClient
    .from('pedidos')
    .select('numero, cliente_id, vendedor_id, valor_total_a_pagar, created_at, pago, clientes(razao_social, nome_fantasia, municipio, uf, eh_fornecedor)')
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

function somaValor(lista) {
  return lista.reduce(function (acc, p) { return acc + (parseFloat(p.valor_total_a_pagar) || 0); }, 0);
}

function renderKpisEGraficos() {
  var pedidos = todosPedidos.filter(function (p) { return noPeriodo(p.created_at); });
  var faturamento = somaValor(pedidos);
  var ticketMedio = pedidos.length ? faturamento / pedidos.length : 0;
  var rotulo = (filtroMes === '' && filtroAno === '') ? 'total' : 'do período';

  document.getElementById('kpi-faturamento-label').textContent = 'Faturamento ' + rotulo;
  document.getElementById('kpi-pedidos-label').textContent = 'Pedidos ' + (rotulo === 'total' ? 'no total' : 'no período');
  document.getElementById('kpi-ticket-label').textContent = 'Ticket médio (' + (rotulo === 'total' ? 'total' : 'período') + ')';
  document.getElementById('kpi-faturamento').textContent = formatBRLDash(faturamento);
  document.getElementById('kpi-faturamento-sub').textContent = pedidos.length + ' pedido(s) em ' + descricaoPeriodo();
  document.getElementById('kpi-pedidos').textContent = pedidos.length.toLocaleString('pt-BR');
  document.getElementById('kpi-ticket').textContent = formatBRLDash(ticketMedio);

  // Clientes ativos = distintos com pelo menos 1 compra nos últimos 30 dias (sempre "hoje", não segue o filtro)
  var clientesRecentes = {};
  todosPedidos.forEach(function (p) {
    if (diasDesde(p.created_at) <= 30) clientesRecentes[p.cliente_id] = true;
  });
  document.getElementById('kpi-clientes-ativos').textContent = Object.keys(clientesRecentes).length.toLocaleString('pt-BR');

  if (typeof Chart === 'undefined') return; // CDN bloqueado/offline — KPIs continuam funcionando sem os gráficos.

  // Barras: 12 meses do ano escolhido; sem ano escolhido, os últimos 12 meses.
  var agora = new Date();
  var meses = [];
  for (var i = 0; i < 12; i++) {
    var ref = filtroAno !== ''
      ? new Date(Number(filtroAno), i, 1)
      : new Date(agora.getFullYear(), agora.getMonth() - (11 - i), 1);
    meses.push({ ref: ref, label: ref.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), total: 0 });
  }
  todosPedidos.forEach(function (p) {
    var d = new Date(p.created_at);
    var mesObj = meses.find(function (m) { return m.ref.getFullYear() === d.getFullYear() && m.ref.getMonth() === d.getMonth(); });
    if (mesObj) mesObj.total += parseFloat(p.valor_total_a_pagar) || 0;
  });

  var cores = meses.map(function (m) {
    var selecionado = filtroMes !== '' && m.ref.getMonth() === Number(filtroMes);
    return (filtroMes === '' || selecionado) ? '#2f7de1' : '#b9d3f5';
  });

  if (graficoMes) graficoMes.destroy();
  var ctxMes = document.getElementById('chart-vendas-mes');
  if (ctxMes) {
    graficoMes = new Chart(ctxMes, {
      type: 'bar',
      data: { labels: meses.map(function (m) { return m.label; }), datasets: [{ data: meses.map(function (m) { return m.total; }), backgroundColor: cores, borderRadius: 6, maxBarThickness: 46 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return formatBRLDash(ctx.parsed.y); } } } },
        scales: { y: { ticks: { callback: function (v) { return 'R$ ' + v.toLocaleString('pt-BR'); } }, grid: { color: '#eef1f5' } }, x: { grid: { display: false } } }
      }
    });
  }

  // Donut — recebido (pago) x pendente dentro do período
  var totalPago = 0, totalPendente = 0;
  pedidos.forEach(function (p) {
    var v = parseFloat(p.valor_total_a_pagar) || 0;
    if (p.pago) totalPago += v; else totalPendente += v;
  });

  if (graficoPago) graficoPago.destroy();
  var ctxPago = document.getElementById('chart-pago-pendente');
  if (ctxPago) {
    graficoPago = new Chart(ctxPago, {
      type: 'doughnut',
      data: { labels: ['Recebido', 'Pendente'], datasets: [{ data: [totalPago, totalPendente], backgroundColor: ['#1fa855', '#e0a800'], borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'Open Sans' } } }, tooltip: { callbacks: { label: function (ctx) { return ctx.label + ': ' + formatBRLDash(ctx.parsed); } } } }
      }
    });
  }
}

/* ===================== CONFERÊNCIA: PEDIDOS DO PERÍODO ===================== */

function renderConferencia() {
  var tbody = document.getElementById('conferencia-tbody');
  var pedidos = todosPedidos.filter(function (p) { return noPeriodo(p.created_at); })
    .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

  document.getElementById('conferencia-resumo').textContent = pedidos.length + ' pedido(s) em ' + descricaoPeriodo() + ' — total ' + formatBRLDash(somaValor(pedidos));

  if (!pedidos.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum pedido confirmado nesse período.</td></tr>';
    return;
  }
  tbody.innerHTML = pedidos.map(function (p) {
    var nome = p.clientes.razao_social + (p.clientes.nome_fantasia ? ' (' + p.clientes.nome_fantasia + ')' : '');
    return '<tr><td>' + p.numero + '</td><td>' + formatDataDash(p.created_at) + '</td><td>' + nome + '</td>' +
      '<td>' + formatBRLDash(p.valor_total_a_pagar) + '</td>' +
      '<td>' + (p.pago ? '<span class="badge badge-ok">Pago</span>' : '<span class="badge badge-warning">Pendente</span>') + '</td></tr>';
  }).join('');
}

/* ===================== TOP CLIENTES + SEMÁFORO ===================== */

function renderClientesRanking() {
  var topEl = document.getElementById('top-clientes');
  var semaforoTbody = document.getElementById('semaforo-tbody');
  var heatmapEl = document.getElementById('heatmap-uf');

  // Semáforo é sobre recência de compra (hoje) — usa todos os pedidos, não segue o filtro.
  if (!todosPedidos.length) {
    semaforoTbody.innerHTML = '<tr><td colspan="5">Nenhum pedido confirmado ainda.</td></tr>';
  } else {
    var ultimaPorCliente = {};
    todosPedidos.forEach(function (p) {
      if (!ultimaPorCliente[p.cliente_id]) ultimaPorCliente[p.cliente_id] = { cliente: p.clientes, ultimaCompra: p.created_at };
    });
    semaforoTbody.innerHTML = Object.keys(ultimaPorCliente).map(function (id) { return ultimaPorCliente[id]; })
      .sort(function (a, b) { return new Date(b.ultimaCompra) - new Date(a.ultimaCompra); })
      .map(function (c) {
        var dias = diasDesde(c.ultimaCompra);
        var nome = c.cliente.razao_social + (c.cliente.nome_fantasia ? ' (' + c.cliente.nome_fantasia + ')' : '');
        var localidade = [c.cliente.municipio, c.cliente.uf].filter(Boolean).join('/') || '—';
        return '<tr><td><span class="semaforo-dot ' + semaforoClasse(dias) + '"></span></td><td>' + nome + '</td><td>' + localidade + '</td>' +
          '<td>' + formatDataDash(c.ultimaCompra) + '</td><td>' + dias + ' dia(s)</td></tr>';
      }).join('');
  }

  var pedidos = todosPedidos.filter(function (p) { return noPeriodo(p.created_at); });
  if (!pedidos.length) {
    topEl.innerHTML = '<p class="dashboard-empty">Nenhum pedido confirmado em ' + descricaoPeriodo() + '.</p>';
    heatmapEl.innerHTML = '<p class="dashboard-empty">Nenhum pedido confirmado em ' + descricaoPeriodo() + '.</p>';
    return;
  }

  // Agrupa por cliente (pedidos vem ordenado por created_at desc: o primeiro de cada cliente é a compra mais recente dele).
  var porCliente = {};
  pedidos.forEach(function (p) {
    var id = p.cliente_id;
    if (!porCliente[id]) porCliente[id] = { cliente: p.clientes, total: 0, qtdPedidos: 0, ultimaCompra: p.created_at };
    porCliente[id].total += parseFloat(p.valor_total_a_pagar) || 0;
    porCliente[id].qtdPedidos += 1;
  });
  var lista = Object.keys(porCliente).map(function (id) { return porCliente[id]; });

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

function materialVacuoCanonico(material) {
  var m = (material || '').toLowerCase();
  if (m.indexOf('mrp') !== -1) return 'MRP';
  if (m.indexOf('term') !== -1) return 'Termoencolhível';
  return 'Nylon Poli'; // inclui variações de digitação e pedidos antigos sem material
}

async function carregarItensProdutos(vendedorId) {
  var [geraisRes, vacuoRes] = await Promise.all([
    supabaseClient.from('pedido_itens_gerais').select('nome_produto, quantidade, produtos_catalogo(nome_produto), pedidos!inner(tipo, vendedor_id, created_at, clientes(eh_fornecedor))').eq('pedidos.tipo', 'pedido'),
    supabaseClient.from('pedido_itens_vacuo').select('material, tipo, quantidade, largura_m, comprimento_m, espessura_micras, pedidos!inner(tipo, vendedor_id, created_at, clientes(eh_fornecedor))').eq('pedidos.tipo', 'pedido')
  ]);

  if (geraisRes.error && vacuoRes.error) return false;

  // Filtra fora itens de pedidos feitos a cadastros marcados como fornecedor
  // (ex: Altisvac) — são compras nossas, não vendas. Vendedor só enxerga as vendas dele.
  function naoEhFornecedor(i) {
    if (!i.pedidos || (i.pedidos.clientes && i.pedidos.clientes.eh_fornecedor)) return false;
    if (vendedorId && i.pedidos.vendedor_id !== vendedorId) return false;
    return true;
  }
  itensGeraisBrutos = (geraisRes.data || []).filter(naoEhFornecedor);
  itensVacuoBrutos = (vacuoRes.data || []).filter(naoEhFornecedor);
  return true;
}

function renderProdutosRanking() {
  var topEl = document.getElementById('top-produtos');
  if (erroProdutos) { topEl.innerHTML = '<p class="dashboard-empty">Erro ao carregar produtos.</p>'; return; }
  var porProduto = {};

  itensGeraisBrutos.filter(function (i) { return noPeriodo(i.pedidos.created_at); }).forEach(function (i) {
    // Usa o nome ATUAL do produto no catálogo — pedidos antigos guardam o nome que o
    // produto tinha na época ("Etiqueta Térmica 40x40" virou "... - 21M") e dividiam a
    // mesma etiqueta em linhas separadas, diminuindo a quantidade de cada uma.
    var nome = (i.produtos_catalogo && i.produtos_catalogo.nome_produto) || i.nome_produto || 'Produto sem nome';
    porProduto[nome] = (porProduto[nome] || 0) + (parseFloat(i.quantidade) || 0);
  });
  itensVacuoBrutos.filter(function (i) { return noPeriodo(i.pedidos.created_at); }).forEach(function (i) {
    var esp = Math.round(parseFloat(i.espessura_micras) || 0);
    if (esp > 0 && esp < 50) esp = esp * 10; // escala do catálogo (12 = 120 µ)
    var medidas = formatCmDash(i.largura_m) + 'X' + formatCmDash(i.comprimento_m) + 'X' + esp;
    // Medidas logo no início do nome — é o que mais importa pra saber qual modelo vendeu.
    // Material normalizado (digitação livre gerava "Nyon Poli"...) e tipo fora do agrupamento.
    var nome = 'Saco a Vácuo ' + medidas + ' — ' + materialVacuoCanonico(i.material);
    porProduto[nome] = (porProduto[nome] || 0) + (parseFloat(i.quantidade) || 0);
  });

  var ranking = Object.keys(porProduto)
    .map(function (nome) { return { nome: nome, quantidade: porProduto[nome] }; })
    .sort(function (a, b) { return b.quantidade - a.quantidade; })
    .slice(0, 5);

  if (!ranking.length) {
    topEl.innerHTML = '<p class="dashboard-empty">Nenhum item vendido em ' + descricaoPeriodo() + '.</p>';
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

/* ===================== FILTRO (mês/ano) ===================== */

function renderTudo() {
  renderKpisEGraficos();
  renderClientesRanking();
  renderProdutosRanking();
  renderConferencia();
}

function iniciarFiltros() {
  var selMes = document.getElementById('filtro-mes');
  var selAno = document.getElementById('filtro-ano');

  selMes.innerHTML = '<option value="">Todos os meses</option>' + MESES_NOME.map(function (nome, i) {
    return '<option value="' + i + '">' + nome + '</option>';
  }).join('');

  var anos = {};
  anos[new Date().getFullYear()] = true;
  todosPedidos.forEach(function (p) { anos[new Date(p.created_at).getFullYear()] = true; });
  selAno.innerHTML = '<option value="">Todos os anos</option>' + Object.keys(anos).sort().reverse().map(function (a) {
    return '<option value="' + a + '">' + a + '</option>';
  }).join('');

  // Começa no mês e ano atuais (mesma leitura que o Dashboard sempre teve nos KPIs).
  selMes.value = String(new Date().getMonth());
  selAno.value = String(new Date().getFullYear());
  filtroMes = selMes.value;
  filtroAno = selAno.value;

  selMes.addEventListener('change', function () { filtroMes = selMes.value; renderTudo(); });
  selAno.addEventListener('change', function () { filtroAno = selAno.value; renderTudo(); });
}

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;

  // Vendedor só enxerga os próprios números — admin vê tudo, de todo mundo.
  var vendedorId = ['vendedor', 'vendedor_ext', 'vendedor_int'].indexOf(auth.profile.role) !== -1 ? auth.session.user.id : null;
  if (vendedorId) {
    var aviso = document.createElement('p');
    aviso.style.cssText = 'margin-top:-16px; margin-bottom:20px; color:var(--gray-400); font-size:0.9rem;';
    aviso.textContent = 'Mostrando apenas as suas vendas.';
    document.querySelector('.admin-title').insertAdjacentElement('afterend', aviso);
  }

  var resultado = await buscarPedidosDashboard(vendedorId);
  if (resultado.error) {
    document.getElementById('top-clientes').innerHTML = '<p class="dashboard-empty">Erro ao carregar: ' + resultado.error.message + '</p>';
    return;
  }
  todosPedidos = resultado.pedidos;

  var itensOk = await carregarItensProdutos(vendedorId);
  erroProdutos = !itensOk;

  iniciarFiltros();
  renderTudo();
})();
