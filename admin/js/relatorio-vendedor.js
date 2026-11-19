/* Relatório de vendas por vendedor — só sócios veem esta página (Relatórios é data-role-admin).
   Consolidado (todos, com o nome do vendedor em cada linha) ou filtrado por vendedor. */
var relVend = { pedidos: [], nomes: {}, vendedor: '', ano: '' };

function escVend(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function pedidosVendFiltrados() {
  return relVend.pedidos.filter(function (p) {
    if (relVend.vendedor && p.vendedor_id !== relVend.vendedor) return false;
    if (relVend.ano && String(new Date(p.created_at).getFullYear()) !== relVend.ano) return false;
    return true;
  });
}

function nomeVend(id) { return relVend.nomes[id] || 'Sem vendedor'; }

function renderRelVendedor() {
  var lista = pedidosVendFiltrados();
  var resumo = {};
  lista.forEach(function (p) {
    var n = nomeVend(p.vendedor_id);
    resumo[n] = resumo[n] || { pedidos: 0, total: 0, clientes: {}, cidades: {} };
    resumo[n].pedidos++;
    resumo[n].total += parseFloat(p.valor_total_a_pagar) || 0;
    resumo[n].clientes[p.cliente_id] = true;
    var cid = (p.clientes.municipio || '—') + (p.clientes.uf ? '/' + p.clientes.uf : '');
    resumo[n].cidades[cid] = (resumo[n].cidades[cid] || 0) + 1;
  });
  var nomes = Object.keys(resumo).sort(function (a, b) { return resumo[b].total - resumo[a].total; });
  var totalGeral = nomes.reduce(function (s, n) { return s + resumo[n].total; }, 0);
  var tbody = document.getElementById('vend-resumo-tbody');
  if (!nomes.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhuma venda para este filtro.</td></tr>';
  } else {
    tbody.innerHTML = nomes.map(function (n) {
      var r = resumo[n];
      var topCid = Object.keys(r.cidades).sort(function (a, b) { return r.cidades[b] - r.cidades[a]; }).slice(0, 3).map(function (c) { return c + ' (' + r.cidades[c] + ')'; }).join(', ');
      return '<tr><td>' + escVend(n) + '</td><td>' + r.pedidos + '</td><td>' + Object.keys(r.clientes).length + '</td><td>' + brlRel(r.total) + '</td><td>' + brlRel(r.total / r.pedidos) + '</td><td>' + escVend(topCid) + '</td></tr>';
    }).join('') + '<tr><td><strong>CONSOLIDADO</strong></td><td><strong>' + lista.length + '</strong></td><td></td><td><strong>' + brlRel(totalGeral) + '</strong></td><td></td><td></td></tr>';
  }
  var det = document.getElementById('vend-detalhe-tbody');
  var ordenada = lista.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  det.innerHTML = ordenada.length ? ordenada.map(function (p) {
    return '<tr><td>' + escVend(nomeVend(p.vendedor_id)) + '</td><td>' + p.numero + '</td><td>' + new Date(p.created_at).toLocaleDateString('pt-BR') + '</td><td>' +
      escVend(p.clientes.razao_social) + '</td><td>' + escVend((p.clientes.municipio || '—') + (p.clientes.uf ? '/' + p.clientes.uf : '')) + '</td><td>' + brlRel(p.valor_total_a_pagar) + '</td></tr>';
  }).join('') : '<tr><td colspan="6">Nenhuma venda para este filtro.</td></tr>';
}

function exportarRelVendedor() {
  var lista = pedidosVendFiltrados().slice().sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
  var linhas = lista.map(function (p) {
    return { 'Vendedor': nomeVend(p.vendedor_id), 'Pedido': p.numero, 'Data': new Date(p.created_at).toLocaleDateString('pt-BR'),
      'Cliente': p.clientes.razao_social, 'Cidade': p.clientes.municipio || '', 'UF': p.clientes.uf || '', 'Valor (R$)': Math.round((parseFloat(p.valor_total_a_pagar) || 0) * 100) / 100 };
  });
  var nome = relVend.vendedor ? nomeVend(relVend.vendedor) : 'Consolidado';
  baixarExcel('Vendas por vendedor - ' + nome + (relVend.ano ? ' - ' + relVend.ano : '') + '.xlsx', linhas, ['Vendedor', 'Pedido', 'Data', 'Cliente', 'Cidade', 'UF', 'Valor (R$)']);
}

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth || !document.getElementById('vend-resumo-tbody')) return;
  var rp = await supabaseClient.from('profiles').select('id, nome_exibicao');
  (rp.data || []).forEach(function (u) { relVend.nomes[u.id] = u.nome_exibicao; });
  var r = await buscarTudoRel(function () {
    return supabaseClient.from('pedidos').select('id, numero, cliente_id, vendedor_id, valor_total_a_pagar, created_at, clientes(razao_social, municipio, uf, eh_fornecedor, nao_contabilizar)').eq('tipo', 'pedido').order('created_at');
  });
  if (r.error) { document.getElementById('vend-resumo-tbody').innerHTML = '<tr><td colspan="6">Erro: ' + escVend(r.error.message) + '</td></tr>'; return; }
  relVend.pedidos = (r.data || []).filter(ehVendaValida);

  var selV = document.getElementById('vend-filtro-vendedor');
  var ids = {}; relVend.pedidos.forEach(function (p) { if (p.vendedor_id) ids[p.vendedor_id] = true; });
  selV.innerHTML = '<option value="">Consolidado (todos)</option>' + Object.keys(ids).sort(function (a, b) { return nomeVend(a).localeCompare(nomeVend(b)); })
    .map(function (id) { return '<option value="' + id + '">' + escVend(nomeVend(id)) + '</option>'; }).join('');
  var anos = {}; relVend.pedidos.forEach(function (p) { anos[new Date(p.created_at).getFullYear()] = true; });
  var selA = document.getElementById('vend-filtro-ano');
  selA.innerHTML = '<option value="">Todos os anos</option>' + Object.keys(anos).sort().reverse().map(function (a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
  selV.addEventListener('change', function () { relVend.vendedor = selV.value; renderRelVendedor(); });
  selA.addEventListener('change', function () { relVend.ano = selA.value; renderRelVendedor(); });
  document.getElementById('btn-exportar-vendedor').addEventListener('click', exportarRelVendedor);
  renderRelVendedor();
})();
