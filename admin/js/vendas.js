var currentUserId = null;
var currentUserRole = null;
var ROLES_VENDEDOR = ['vendedor', 'vendedor_ext', 'vendedor_int'];
var clientesCacheVendas = [];
var buscaDebounceTimer = null;

async function carregarClientesParaBusca() {
  var { data, error } = await supabaseClient.from('clientes').select('id, razao_social, nome_fantasia').order('razao_social');
  if (error) return;
  clientesCacheVendas = data || [];
}

function renderResultadosVendas(termo) {
  var container = document.getElementById('vendas-resultados');

  if (!termo) {
    container.innerHTML = '<p style="color:var(--gray-400); text-align:center; padding:30px 0;">Digite o nome de um cliente acima pra ver as vendas dele.</p>';
    return;
  }

  var termoBusca = termo.toLowerCase();
  var encontrados = clientesCacheVendas.filter(function (c) {
    var alvo = (c.razao_social + ' ' + (c.nome_fantasia || '')).toLowerCase();
    return alvo.indexOf(termoBusca) !== -1;
  });

  if (!encontrados.length) {
    container.innerHTML = '<p style="color:var(--gray-400); text-align:center; padding:30px 0;">Nenhum cliente encontrado com esse nome.</p>';
    return;
  }

  container.innerHTML = encontrados.map(function (c) {
    return '<div class="admin-card">' +
      '<h2>' + c.razao_social + (c.nome_fantasia ? ' (' + c.nome_fantasia + ')' : '') + '</h2>' +
      '<div id="vendas-hist-' + c.id + '">Carregando...</div>' +
    '</div>';
  }).join('');

  encontrados.forEach(function (c) {
    loadHistoricoCliente(c.id, 'vendas-hist-' + c.id);
  });
}

document.getElementById('vendas-busca-cliente').addEventListener('input', function (e) {
  var termo = e.target.value.trim();
  clearTimeout(buscaDebounceTimer);
  buscaDebounceTimer = setTimeout(function () { renderResultadosVendas(termo); }, 250);
});

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  currentUserId = auth.session.user.id;
  currentUserRole = auth.profile.role;

  await carregarClientesParaBusca();
})();
