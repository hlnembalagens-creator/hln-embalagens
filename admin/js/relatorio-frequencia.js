// Relatório de frequência de compra por cliente + consumo/estoque sugerido por produto.
// Usa só pedidos de venda (tipo 'pedido') de clientes reais: fornecedores e cadastros "fora da contabilidade"
// (ex: Orçamento) ficam de fora. Depende de relatorios.js (buscarTudoRel, ehVendaValida, brlRel, numRel),
// calc-vacuo.js (categoria/medidas do vácuo), caixas-etiqueta.js (rolos por caixa) e excel-utils.js.

var freqVendas = [];   // { id, numero, clienteId, cliente, data: Date, valor }
var freqItens = [];    // { pedidoId, clienteId, produto, chave, qtd, unidade, linha, estoque }
var freqCatalogo = []; // produtos_catalogo (id, nome_produto, quantidade_estoque)
var freqUltimoClientes = [];
var freqUltimoProdutos = [];

function escFreq(texto) {
  return String(texto == null ? '' : texto).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function diasEntre(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function dataBr(d) {
  return d.toLocaleDateString('pt-BR');
}

function somaDias(d, dias) {
  var n = new Date(d.getTime());
  n.setDate(n.getDate() + Math.round(dias));
  return n;
}

// Chave que junta o item vendido no pedido com o produto do catálogo (para achar o estoque).
function chaveVacuo(categoriaLabel, larguraCm, comprimentoCm, espessuraMicras) {
  return 'VACUO|' + categoriaLabel + '|' + Math.round(larguraCm) + 'x' + Math.round(comprimentoCm) + 'x' + Math.round(espessuraMicras);
}

function chaveDoProdutoCatalogo(p) {
  var cat = categoriaEmbalagemDoProduto(p.nome_produto);
  if (!cat) return 'NOME|' + String(p.nome_produto || '').toUpperCase().trim();
  var m = extrairMedidasVacuoDoNome(p.nome_produto);
  return chaveVacuo(cat.label, m.largura, m.comprimento, m.espessura);
}

async function carregarDadosFrequencia() {
  var base = 'pedidos!inner(id, numero, tipo, created_at, cliente_id, clientes(razao_social, nome_fantasia, eh_fornecedor, nao_contabilizar))';
  var res = await Promise.all([
    buscarTudoRel(function () {
      return supabaseClient.from('pedidos').select('id, numero, cliente_id, valor_total_a_pagar, created_at, clientes(razao_social, nome_fantasia, eh_fornecedor, nao_contabilizar)').eq('tipo', 'pedido').order('created_at');
    }),
    buscarTudoRel(function () {
      return supabaseClient.from('pedido_itens_gerais').select('id, nome_produto, quantidade, produtos_catalogo(nome_produto), ' + base).eq('pedidos.tipo', 'pedido').order('id');
    }),
    buscarTudoRel(function () {
      return supabaseClient.from('pedido_itens_vacuo').select('id, material, largura_m, comprimento_m, espessura_micras, quantidade, ' + base).eq('pedidos.tipo', 'pedido').order('id');
    }),
    buscarTudoRel(function () {
      return supabaseClient.from('produtos_catalogo').select('id, nome_produto, quantidade_estoque').order('nome_produto');
    })
  ]);
  for (var i = 0; i < res.length; i++) if (res[i].error) return res[i].error;

  freqCatalogo = res[3].data;
  var estoquePorChave = {};
  freqCatalogo.forEach(function (p) { estoquePorChave[chaveDoProdutoCatalogo(p)] = (estoquePorChave[chaveDoProdutoCatalogo(p)] || 0) + (parseFloat(p.quantidade_estoque) || 0); });

  freqVendas = res[0].data.filter(ehVendaValida).map(function (p) {
    var c = p.clientes || {};
    return {
      id: p.id, numero: p.numero, clienteId: p.cliente_id,
      cliente: c.razao_social + (c.nome_fantasia ? ' (' + c.nome_fantasia + ')' : ''),
      data: new Date(p.created_at), valor: parseFloat(p.valor_total_a_pagar) || 0
    };
  });

  freqItens = [];
  res[1].data.filter(function (i) { return ehVendaValida(i.pedidos); }).forEach(function (i) {
    var nome = (i.produtos_catalogo && i.produtos_catalogo.nome_produto) || i.nome_produto;
    var linha = linhaDoItemGeral(nome);
    var chave = 'NOME|' + String(nome || '').toUpperCase().trim();
    freqItens.push({
      pedidoId: i.pedidos.id, clienteId: i.pedidos.cliente_id, produto: nome, chave: chave,
      qtd: parseFloat(i.quantidade) || 0, unidade: 'rolos', linha: linha,
      estoque: estoquePorChave[chave], rolosPorCaixa: typeof rolosPorCaixaDoProduto === 'function' ? rolosPorCaixaDoProduto(nome) : null
    });
  });
  res[2].data.filter(function (i) { return ehVendaValida(i.pedidos); }).forEach(function (i) {
    var cat = categoriaEmbalagemDoProduto(i.material);
    var label = cat ? cat.label : String(i.material || 'Embalagem');
    var larg = (parseFloat(i.largura_m) || 0) * 100, comp = (parseFloat(i.comprimento_m) || 0) * 100, esp = parseFloat(i.espessura_micras) || 0;
    var chave = chaveVacuo(label, larg, comp, esp);
    var estoqueUn = estoquePorChave[chave];
    freqItens.push({
      pedidoId: i.pedidos.id, clienteId: i.pedidos.cliente_id,
      produto: label + ' ' + Math.round(larg) + 'x' + Math.round(comp) + 'x' + Math.round(esp), chave: chave,
      qtd: parseFloat(i.quantidade) || 0, unidade: 'milheiros', linha: 'embalagens',
      // Estoque do catálogo fica em unidades; a venda é em milheiros.
      estoque: estoqueUn == null ? undefined : estoqueUn / 1000, rolosPorCaixa: null
    });
  });
  return null;
}

function janelaFrequencia() {
  var hoje = new Date();
  var valor = document.getElementById('freq-periodo').value;
  var inicioDados = freqVendas.length ? freqVendas[0].data : hoje;
  var dias = valor === 'tudo' ? Math.max(diasEntre(inicioDados, hoje), 1) : Math.min(parseInt(valor, 10), Math.max(diasEntre(inicioDados, hoje), 1));
  var inicio = valor === 'tudo' ? inicioDados : somaDias(hoje, -parseInt(valor, 10));
  return { hoje: hoje, inicio: inicio, dias: Math.max(dias, 1), tudo: valor === 'tudo' };
}

// Frequência de compra de cada cliente — usa TODO o histórico do cliente (o período escolhido só
// afeta o consumo por produto).
function calcularClientes() {
  var hoje = new Date();
  var porCliente = {};
  freqVendas.forEach(function (v) {
    (porCliente[v.clienteId] = porCliente[v.clienteId] || { nome: v.cliente, vendas: [] }).vendas.push(v);
  });

  var itensPorPedido = {};
  freqItens.forEach(function (i) { (itensPorPedido[i.pedidoId] = itensPorPedido[i.pedidoId] || []).push(i); });

  return Object.keys(porCliente).map(function (id) {
    var c = porCliente[id];
    var vendas = c.vendas.slice().sort(function (a, b) { return a.data - b.data; });
    var n = vendas.length;
    var total = vendas.reduce(function (s, v) { return s + v.valor; }, 0);
    var ultima = vendas[n - 1].data;
    var intervalos = [];
    for (var k = 1; k < n; k++) intervalos.push(diasEntre(vendas[k - 1].data, vendas[k].data));
    var intervaloMedio = intervalos.length ? intervalos.reduce(function (s, d) { return s + d; }, 0) / intervalos.length : null;
    var diasDesde = diasEntre(ultima, hoje);

    var proxima = intervaloMedio != null ? somaDias(ultima, intervaloMedio) : null;
    var status, atraso = 0;
    if (intervaloMedio == null) status = 'poucos';
    else {
      atraso = diasEntre(proxima, hoje);
      status = atraso > 7 ? 'atrasado' : (atraso >= -7 ? 'proximo' : 'prazo');
    }

    // O que costuma comprar: soma por produto e média por pedido.
    var porProduto = {};
    vendas.forEach(function (v) {
      (itensPorPedido[v.id] || []).forEach(function (i) {
        var p = porProduto[i.produto] = porProduto[i.produto] || { qtd: 0, unidade: i.unidade, pedidos: {} };
        p.qtd += i.qtd; p.pedidos[v.id] = true;
      });
    });
    var principais = Object.keys(porProduto).map(function (nome) {
      var p = porProduto[nome]; var np = Object.keys(p.pedidos).length;
      return { nome: nome, qtd: p.qtd, unidade: p.unidade, mediaPorPedido: p.qtd / np };
    }).sort(function (a, b) { return b.qtd - a.qtd; }).slice(0, 3);

    return {
      clienteId: id, nome: c.nome, compras: n, primeira: vendas[0].data, ultima: ultima, diasDesde: diasDesde,
      intervaloMedio: intervaloMedio, ticketMedio: total / n, total: total, proxima: proxima,
      status: status, atraso: atraso, principais: principais
    };
  });
}

function ordenarClientes(lista) {
  var peso = { atrasado: 0, proximo: 1, prazo: 2, poucos: 3 };
  return lista.sort(function (a, b) {
    if (peso[a.status] !== peso[b.status]) return peso[a.status] - peso[b.status];
    if (a.status === 'atrasado') return b.atraso - a.atraso;
    if (a.status === 'poucos') return b.ultima - a.ultima;
    return a.proxima - b.proxima;
  });
}

function badgeStatusFreq(c) {
  if (c.status === 'atrasado') return '<span class="badge badge-warning">Atrasado ' + c.atraso + ' dia(s)</span>';
  if (c.status === 'proximo') return '<span class="badge badge-ok">Compra prevista agora</span>';
  if (c.status === 'prazo') return '<span class="badge badge-ok">No prazo</span>';
  return '<span class="badge" style="background:#e9edf5; color:#4a5875;">Poucos dados</span>';
}

function renderClientesFrequencia() {
  var lista = ordenarClientes(calcularClientes());
  freqUltimoClientes = lista;
  var tbody = document.getElementById('freq-clientes-tbody');
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="9">Nenhuma venda encontrada.</td></tr>'; return; }

  tbody.innerHTML = lista.map(function (c) {
    var principais = c.principais.map(function (p) {
      return escFreq(p.nome) + ': ~' + numRel(p.mediaPorPedido) + ' ' + p.unidade + '/pedido';
    }).join('<br>') || '—';
    return '<tr>' +
      '<td>' + escFreq(c.nome) + '</td>' +
      '<td>' + c.compras + '</td>' +
      '<td>' + dataBr(c.ultima) + ' <small style="color:var(--gray-400);">(há ' + c.diasDesde + ' dias)</small></td>' +
      '<td>' + (c.intervaloMedio != null ? 'a cada ~' + Math.round(c.intervaloMedio) + ' dias' : '—') + '</td>' +
      '<td>' + (c.proxima ? dataBr(c.proxima) : '—') + '</td>' +
      '<td>' + badgeStatusFreq(c) + '</td>' +
      '<td>' + brlRel(c.ticketMedio) + '</td>' +
      '<td>' + brlRel(c.total) + '</td>' +
      '<td style="font-size:0.82rem;">' + principais + '</td></tr>';
  }).join('');
}

function calcularProdutosFrequencia() {
  var j = janelaFrequencia();
  var cobertura = Math.max(parseFloat(document.getElementById('freq-cobertura').value) || 45, 1);
  var porPedidoData = {};
  freqVendas.forEach(function (v) { porPedidoData[v.id] = v.data; });

  var produtos = {};
  freqItens.forEach(function (i) {
    var data = porPedidoData[i.pedidoId];
    if (!data || data < j.inicio) return;
    var p = produtos[i.chave] = produtos[i.chave] || { produto: i.produto, unidade: i.unidade, linha: i.linha, qtd: 0, pedidos: {}, clientes: {}, estoque: i.estoque, rolosPorCaixa: i.rolosPorCaixa };
    p.qtd += i.qtd; p.pedidos[i.pedidoId] = true; p.clientes[i.clienteId] = true;
  });

  return Object.keys(produtos).map(function (k) {
    var p = produtos[k];
    var diario = p.qtd / j.dias;
    var temEstoque = p.estoque != null;
    var estoque = temEstoque ? p.estoque : null;
    var alvo = diario * cobertura;
    return {
      produto: p.produto, unidade: p.unidade, total: p.qtd, pedidos: Object.keys(p.pedidos).length, clientes: Object.keys(p.clientes).length,
      mensal: diario * 30, diario: diario, estoque: estoque, rolosPorCaixa: p.rolosPorCaixa,
      coberturaDias: temEstoque && diario > 0 ? estoque / diario : null,
      alvo: alvo, repor: temEstoque ? Math.max(alvo - estoque, 0) : null, janelaDias: j.dias
    };
  }).sort(function (a, b) { return b.mensal - a.mensal; });
}

function textoCaixas(p, rolos) {
  if (!p.rolosPorCaixa || p.unidade !== 'rolos' || rolos == null) return '';
  return ' <small style="color:var(--gray-400);">(' + numRel(rolos / p.rolosPorCaixa) + ' cx)</small>';
}

function renderProdutosFrequencia() {
  var lista = calcularProdutosFrequencia();
  freqUltimoProdutos = lista;
  var tbody = document.getElementById('freq-produtos-tbody');
  var cobertura = Math.max(parseFloat(document.getElementById('freq-cobertura').value) || 45, 1);
  document.getElementById('freq-produtos-hint').textContent =
    'Consumo calculado sobre ' + (lista.length ? lista[0].janelaDias : 0) + ' dia(s). "Estoque sugerido" = consumo diário × ' + cobertura + ' dias. ' +
    'Estoque de embalagens a vácuo convertido de unidades para milheiros. Produto sem estoque cadastrado aparece com "—". ' +
    'Com pouco histórico (poucos meses ou uma venda grande isolada) a média é só uma referência.';
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="8">Nenhuma venda no período.</td></tr>'; return; }

  tbody.innerHTML = lista.map(function (p) {
    var cobTxt = p.coberturaDias == null ? '—' : (p.coberturaDias > 999 ? '999+ dias' : Math.round(p.coberturaDias) + ' dias');
    var alerta = p.coberturaDias != null && p.coberturaDias < 15 ? ' <span class="badge badge-warning">baixo</span>' : '';
    return '<tr>' +
      '<td>' + escFreq(p.produto) + '</td>' +
      '<td>' + numRel(p.total) + ' ' + p.unidade + textoCaixas(p, p.total) + '</td>' +
      '<td>' + p.pedidos + ' pedido(s), ' + p.clientes + ' cliente(s)</td>' +
      '<td>' + numRel(p.mensal) + ' ' + p.unidade + '/mês' + textoCaixas(p, p.mensal) + '</td>' +
      '<td>' + (p.estoque == null ? '—' : numRel(p.estoque) + ' ' + p.unidade + textoCaixas(p, p.estoque)) + '</td>' +
      '<td>' + cobTxt + alerta + '</td>' +
      '<td>' + numRel(p.alvo) + ' ' + p.unidade + textoCaixas(p, p.alvo) + '</td>' +
      '<td>' + (p.repor == null ? '—' : (p.repor > 0 ? '<strong>' + numRel(p.repor) + ' ' + p.unidade + '</strong>' + textoCaixas(p, p.repor) : 'ok')) + '</td></tr>';
  }).join('');
}

function exportarClientesFrequencia() {
  var linhas = freqUltimoClientes.map(function (c) {
    return {
      'Cliente': c.nome, 'Compras': c.compras, 'Primeira compra': dataBr(c.primeira), 'Última compra': dataBr(c.ultima),
      'Dias desde a última': c.diasDesde, 'Intervalo médio (dias)': c.intervaloMedio == null ? '' : Math.round(c.intervaloMedio),
      'Próxima compra estimada': c.proxima ? dataBr(c.proxima) : '', 'Situação': { atrasado: 'Atrasado', proximo: 'Compra prevista', prazo: 'No prazo', poucos: 'Poucos dados' }[c.status],
      'Ticket médio (R$)': Math.round(c.ticketMedio * 100) / 100, 'Total comprado (R$)': Math.round(c.total * 100) / 100,
      'Costuma comprar': c.principais.map(function (p) { return p.nome + ' ~' + Math.round(p.mediaPorPedido) + ' ' + p.unidade + '/pedido'; }).join('; ')
    };
  });
  baixarExcel('Frequencia de compra por cliente.xlsx', linhas, ['Cliente', 'Compras', 'Primeira compra', 'Última compra', 'Dias desde a última', 'Intervalo médio (dias)', 'Próxima compra estimada', 'Situação', 'Ticket médio (R$)', 'Total comprado (R$)', 'Costuma comprar']);
}

function exportarProdutosFrequencia() {
  var linhas = freqUltimoProdutos.map(function (p) {
    return {
      'Produto': p.produto, 'Unidade': p.unidade, 'Vendido no período': Math.round(p.total * 100) / 100, 'Pedidos': p.pedidos, 'Clientes': p.clientes,
      'Consumo mensal': Math.round(p.mensal * 100) / 100, 'Estoque atual': p.estoque == null ? '' : Math.round(p.estoque * 100) / 100,
      'Cobertura (dias)': p.coberturaDias == null ? '' : Math.round(p.coberturaDias), 'Estoque sugerido': Math.round(p.alvo * 100) / 100,
      'Repor': p.repor == null ? '' : Math.round(p.repor * 100) / 100
    };
  });
  baixarExcel('Consumo e estoque sugerido.xlsx', linhas, ['Produto', 'Unidade', 'Vendido no período', 'Pedidos', 'Clientes', 'Consumo mensal', 'Estoque atual', 'Cobertura (dias)', 'Estoque sugerido', 'Repor']);
}

function renderFrequencia() {
  renderClientesFrequencia();
  renderProdutosFrequencia();
}

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  var erro = await carregarDadosFrequencia();
  if (erro) {
    document.getElementById('freq-clientes-tbody').innerHTML = '<tr><td colspan="9">Erro ao carregar: ' + escFreq(erro.message) + '</td></tr>';
    return;
  }
  renderFrequencia();
  document.getElementById('freq-periodo').addEventListener('change', renderProdutosFrequencia);
  document.getElementById('freq-cobertura').addEventListener('input', renderProdutosFrequencia);
  document.getElementById('btn-exportar-freq-clientes').addEventListener('click', exportarClientesFrequencia);
  document.getElementById('btn-exportar-freq-produtos').addEventListener('click', exportarProdutosFrequencia);
})();
