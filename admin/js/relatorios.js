// Relatório de vendas por linha de produto (Etiquetas x Embalagens x Bobinas PDV), total e mensal.
// Fonte: itens dos pedidos confirmados (tipo 'pedido'), sem compras de fornecedor.

var LINHAS = [
  { chave: 'etiquetas', nome: 'Etiquetas', unidade: 'rolos', cor: '#2f7de1' },
  { chave: 'embalagens', nome: 'Embalagens', unidade: 'milheiros', cor: '#1fa855' },
  { chave: 'bobinas', nome: 'Bobinas PDV', unidade: 'rolos', cor: '#e0a800' },
  { chave: 'outros', nome: 'Outros', unidade: 'un.', cor: '#8a95a5' }
];

var MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

var relPedidos = [];   // { id, valor, mes: 'YYYY-MM' }
var relItens = [];     // { linha, mes, valor, qtd }
var relAno = '';
var graficoLinhas = null;
var relUltimoResumo = null;

function brlRel(n) {
  return 'R$ ' + (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numRel(n) {
  return (parseFloat(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function chaveMes(iso) {
  var d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function rotuloMes(chave) {
  var partes = chave.split('-');
  return MESES_CURTOS[Number(partes[1]) - 1] + '/' + partes[0];
}

// Etiquetas = nome com "etiqueta"; Bobinas PDV = nome com "bobina"; Embalagens = vácuo (Nylon Poli, MRP,
// Termoencolhível) ou produto do catálogo nessas categorias. O que não encaixar vai para "Outros".
function linhaDoItemGeral(nome) {
  var n = String(nome || '').toLowerCase();
  if (n.indexOf('etiqueta') !== -1) return 'etiquetas';
  if (n.indexOf('bobina') !== -1) return 'bobinas';
  if (typeof categoriaEmbalagemDoProduto === 'function' && categoriaEmbalagemDoProduto(nome)) return 'embalagens';
  return 'outros';
}

// O PostgREST devolve no máximo 1000 linhas por consulta — lê em páginas pra não cortar o relatório.
async function buscarTudoRel(montarConsulta) {
  var todas = [];
  var passo = 1000;
  for (var inicio = 0; ; inicio += passo) {
    var { data, error } = await montarConsulta().range(inicio, inicio + passo - 1);
    if (error) return { error: error };
    todas = todas.concat(data || []);
    if (!data || data.length < passo) break;
  }
  return { data: todas };
}

function ehVendaValida(pedido) {
  // Fornecedor = compra nossa; "nao_contabilizar" = cadastro genérico (ex: Orçamento) fora da contabilidade.
  return pedido && pedido.clientes && !pedido.clientes.eh_fornecedor && !pedido.clientes.nao_contabilizar;
}

async function carregarRelatorio() {
  var base = 'pedidos!inner(id, tipo, created_at, clientes(eh_fornecedor, nao_contabilizar))';
  var res = await Promise.all([
    buscarTudoRel(function () {
      return supabaseClient.from('pedidos').select('id, valor_total_a_pagar, created_at, clientes(eh_fornecedor, nao_contabilizar)').eq('tipo', 'pedido').order('created_at');
    }),
    buscarTudoRel(function () {
      return supabaseClient.from('pedido_itens_gerais').select('id, nome_produto, quantidade, preco_total, produtos_catalogo(nome_produto), ' + base).eq('pedidos.tipo', 'pedido').order('id');
    }),
    buscarTudoRel(function () {
      return supabaseClient.from('pedido_itens_vacuo').select('id, quantidade, vl_total, ' + base).eq('pedidos.tipo', 'pedido').order('id');
    })
  ]);

  if (res[0].error) return res[0].error;
  if (res[1].error) return res[1].error;
  if (res[2].error) return res[2].error;

  relPedidos = res[0].data.filter(ehVendaValida).map(function (p) {
    return { id: p.id, valor: parseFloat(p.valor_total_a_pagar) || 0, mes: chaveMes(p.created_at) };
  });

  relItens = [];
  res[1].data.filter(function (i) { return ehVendaValida(i.pedidos); }).forEach(function (i) {
    var nome = (i.produtos_catalogo && i.produtos_catalogo.nome_produto) || i.nome_produto;
    relItens.push({ linha: linhaDoItemGeral(nome), mes: chaveMes(i.pedidos.created_at), valor: parseFloat(i.preco_total) || 0, qtd: parseFloat(i.quantidade) || 0 });
  });
  res[2].data.filter(function (i) { return ehVendaValida(i.pedidos); }).forEach(function (i) {
    relItens.push({ linha: 'embalagens', mes: chaveMes(i.pedidos.created_at), valor: parseFloat(i.vl_total) || 0, qtd: parseFloat(i.quantidade) || 0 });
  });
  return null;
}

function noAnoRel(chave) {
  return relAno === '' || chave.slice(0, 4) === String(relAno);
}

function montarResumo() {
  var meses = {};
  function mes(chave) {
    if (!meses[chave]) {
      meses[chave] = { chave: chave, pedidos: 0, valorPedidos: 0, total: 0, linhas: {} };
      LINHAS.forEach(function (l) { meses[chave].linhas[l.chave] = { valor: 0, qtd: 0 }; });
    }
    return meses[chave];
  }

  relPedidos.filter(function (p) { return noAnoRel(p.mes); }).forEach(function (p) {
    var m = mes(p.mes);
    m.pedidos += 1;
    m.valorPedidos += p.valor;
  });
  relItens.filter(function (i) { return noAnoRel(i.mes); }).forEach(function (i) {
    var m = mes(i.mes);
    m.linhas[i.linha].valor += i.valor;
    m.linhas[i.linha].qtd += i.qtd;
    m.total += i.valor;
  });

  var lista = Object.keys(meses).sort().map(function (k) { return meses[k]; });

  var totais = { pedidos: 0, valorPedidos: 0, total: 0, linhas: {} };
  LINHAS.forEach(function (l) { totais.linhas[l.chave] = { valor: 0, qtd: 0 }; });
  lista.forEach(function (m) {
    totais.pedidos += m.pedidos;
    totais.valorPedidos += m.valorPedidos;
    totais.total += m.total;
    LINHAS.forEach(function (l) {
      totais.linhas[l.chave].valor += m.linhas[l.chave].valor;
      totais.linhas[l.chave].qtd += m.linhas[l.chave].qtd;
    });
  });

  return { meses: lista, totais: totais };
}

function linhasVisiveis(resumo) {
  // "Outros" só aparece se existir alguma venda nele.
  return LINHAS.filter(function (l) { return l.chave !== 'outros' || resumo.totais.linhas.outros.valor > 0; });
}

function renderKpisRel(resumo) {
  var t = resumo.totais;
  var rotuloPeriodo = relAno === '' ? 'todo o período' : 'ano de ' + relAno;
  var html = '<div class="kpi-card kpi-accent-navy"><div class="kpi-label">Total vendido</div><div class="kpi-value">' + brlRel(t.total) + '</div>' +
    '<div class="kpi-sub">' + t.pedidos + ' pedido(s) em ' + rotuloPeriodo + '</div></div>';
  linhasVisiveis(resumo).forEach(function (l) {
    var v = t.linhas[l.chave];
    var pct = t.total ? (v.valor / t.total) * 100 : 0;
    html += '<div class="kpi-card" style="border-top-color:' + l.cor + ';"><div class="kpi-label">' + l.nome + '</div><div class="kpi-value">' + brlRel(v.valor) + '</div>' +
      '<div class="kpi-sub">' + pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% do total • ' + numRel(v.qtd) + ' ' + l.unidade + '</div></div>';
  });
  document.getElementById('rel-kpis').innerHTML = html;
}

function renderTabelaRel(resumo) {
  var linhas = linhasVisiveis(resumo);
  var thead = '<tr><th>Mês</th><th>Pedidos</th>';
  linhas.forEach(function (l) { thead += '<th>' + l.nome + ' (' + l.unidade + ')</th><th>' + l.nome + ' (R$)</th>'; });
  thead += '<th>Total (R$)</th></tr>';
  document.querySelector('#rel-tabela thead').innerHTML = thead;

  function linhaTabela(rotulo, pedidos, dados, total, negrito) {
    var tag = negrito ? 'strong' : 'span';
    var tr = '<tr><td><' + tag + '>' + rotulo + '</' + tag + '></td><td><' + tag + '>' + pedidos + '</' + tag + '></td>';
    linhas.forEach(function (l) {
      tr += '<td><' + tag + '>' + numRel(dados[l.chave].qtd) + '</' + tag + '></td><td><' + tag + '>' + brlRel(dados[l.chave].valor) + '</' + tag + '></td>';
    });
    return tr + '<td><' + tag + '>' + brlRel(total) + '</' + tag + '></td></tr>';
  }

  var corpo = '';
  if (!resumo.meses.length) {
    corpo = '<tr><td colspan="' + (3 + linhas.length * 2) + '">Nenhuma venda no período.</td></tr>';
  } else {
    resumo.meses.forEach(function (m) { corpo += linhaTabela(rotuloMes(m.chave), m.pedidos, m.linhas, m.total, false); });
    corpo += linhaTabela('TOTAL', resumo.totais.pedidos, resumo.totais.linhas, resumo.totais.total, true);
  }
  document.querySelector('#rel-tabela tbody').innerHTML = corpo;

  var diff = resumo.totais.valorPedidos - resumo.totais.total;
  var nota = 'Quantidades: etiquetas e bobinas em rolos; embalagens a vácuo em milheiros.';
  if (Math.abs(diff) > 0.01) {
    nota += ' Faturamento dos pedidos (com descontos/ajustes): ' + brlRel(resumo.totais.valorPedidos) + ' — diferença de ' + brlRel(diff) + ' em relação à soma dos itens.';
  }
  document.getElementById('rel-nota').textContent = nota;
}

function renderGraficoRel(resumo) {
  if (typeof Chart === 'undefined') return; // CDN bloqueado/offline — tabela e KPIs continuam funcionando.
  var linhas = linhasVisiveis(resumo);
  if (graficoLinhas) graficoLinhas.destroy();
  graficoLinhas = new Chart(document.getElementById('chart-linhas-mes'), {
    type: 'bar',
    data: {
      labels: resumo.meses.map(function (m) { return rotuloMes(m.chave); }),
      datasets: linhas.map(function (l) {
        return { label: l.nome, backgroundColor: l.cor, borderRadius: 4, maxBarThickness: 54, data: resumo.meses.map(function (m) { return m.linhas[l.chave].valor; }) };
      })
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Open Sans' } } },
        tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + brlRel(ctx.parsed.y); } } }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, ticks: { callback: function (v) { return 'R$ ' + v.toLocaleString('pt-BR'); } }, grid: { color: '#eef1f5' } }
      }
    }
  });
}

function renderRelatorio() {
  relUltimoResumo = montarResumo();
  renderKpisRel(relUltimoResumo);
  renderTabelaRel(relUltimoResumo);
  renderGraficoRel(relUltimoResumo);
}

function iniciarFiltroAno() {
  var anos = {};
  relPedidos.forEach(function (p) { anos[p.mes.slice(0, 4)] = true; });
  relItens.forEach(function (i) { anos[i.mes.slice(0, 4)] = true; });
  var lista = Object.keys(anos).sort().reverse();
  var select = document.getElementById('filtro-ano');
  select.innerHTML = '<option value="">Todos os anos</option>' + lista.map(function (a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
  select.addEventListener('change', function () { relAno = select.value; renderRelatorio(); });
}

function exportarRelatorioExcel() {
  if (!relUltimoResumo) return;
  var resumo = relUltimoResumo;
  var colunas = ['Mês', 'Pedidos'];
  linhasVisiveis(resumo).forEach(function (l) { colunas.push(l.nome + ' (' + l.unidade + ')', l.nome + ' (R$)'); });
  colunas.push('Total (R$)');

  function linha(rotulo, pedidos, dados, total) {
    var obj = { 'Mês': rotulo, 'Pedidos': pedidos };
    linhasVisiveis(resumo).forEach(function (l) {
      obj[l.nome + ' (' + l.unidade + ')'] = Math.round(dados[l.chave].qtd * 100) / 100;
      obj[l.nome + ' (R$)'] = Math.round(dados[l.chave].valor * 100) / 100;
    });
    obj['Total (R$)'] = Math.round(total * 100) / 100;
    return obj;
  }

  var linhasExcel = resumo.meses.map(function (m) { return linha(rotuloMes(m.chave), m.pedidos, m.linhas, m.total); });
  linhasExcel.push(linha('TOTAL', resumo.totais.pedidos, resumo.totais.linhas, resumo.totais.total));
  baixarExcel('Relatorio de vendas por linha' + (relAno ? ' - ' + relAno : '') + '.xlsx', linhasExcel, colunas);
}

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;

  var erro = await carregarRelatorio();
  if (erro) {
    document.getElementById('rel-kpis').innerHTML = '<div class="kpi-card"><div class="kpi-label">Erro ao carregar</div><div class="kpi-sub">' + erro.message + '</div></div>';
    return;
  }

  iniciarFiltroAno();
  document.getElementById('btn-exportar-relatorio').addEventListener('click', exportarRelatorioExcel);
  renderRelatorio();
})();
