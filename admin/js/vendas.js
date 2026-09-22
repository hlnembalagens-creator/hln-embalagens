var currentUserId = null;
var currentUserRole = null;
var ROLES_VENDEDOR = ['vendedor', 'vendedor_ext', 'vendedor_int'];
var vendasCache = [];

var FORMA_PAGAMENTO_LABELS_VENDAS = {
  boleto: 'Boleto', a_vista: 'À Vista', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', pix: 'Pix', link_pagamento: 'Link de Pagamento'
};

function formatBRLVendas(n) {
  return 'R$ ' + (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDataVendas(d) {
  return new Date(d).toLocaleDateString('pt-BR');
}

async function carregarVendedoresFiltro() {
  var select = document.getElementById('filtro-vendedor');
  if (!select) return;
  var { data } = await supabaseClient.from('profiles').select('id, nome_exibicao').order('nome_exibicao');
  select.innerHTML = '<option value="">Todos</option>' + (data || []).map(function (p) {
    return '<option value="' + p.id + '">' + p.nome_exibicao + '</option>';
  }).join('');
}

async function carregarVendas() {
  var tbody = document.getElementById('vendas-tbody');
  tbody.innerHTML = '<tr><td colspan="8">Carregando...</td></tr>';

  var query = supabaseClient.from('pedidos')
    .select('*, clientes(razao_social, nome_fantasia), profiles(nome_exibicao)')
    .order('created_at', { ascending: false })
    .limit(300);

  // Vendedor só enxerga as próprias vendas — quem vê tudo é admin/ADM1.
  if (ROLES_VENDEDOR.indexOf(currentUserRole) !== -1) {
    query = query.eq('vendedor_id', currentUserId);
  }

  var { data, error } = await query;
  if (error) {
    tbody.innerHTML = '<tr><td colspan="8">Erro ao carregar: ' + error.message + '</td></tr>';
    return;
  }

  vendasCache = data || [];
  aplicarFiltrosERenderizar();
}

function aplicarFiltrosERenderizar() {
  var busca = (document.getElementById('filtro-busca').value || '').trim().toLowerCase();
  var vendedorEl = document.getElementById('filtro-vendedor');
  var vendedorFiltro = vendedorEl ? vendedorEl.value : '';
  var statusFiltro = document.getElementById('filtro-status').value;
  var tipoFiltro = document.getElementById('filtro-tipo').value;

  var lista = vendasCache.filter(function (p) {
    if (tipoFiltro && p.tipo !== tipoFiltro) return false;
    if (vendedorFiltro && p.vendedor_id !== vendedorFiltro) return false;
    if (statusFiltro === 'pago' && !p.pago) return false;
    if (statusFiltro === 'pendente' && p.pago) return false;
    if (busca) {
      var nomeCliente = p.clientes ? (p.clientes.razao_social + ' ' + (p.clientes.nome_fantasia || '')) : '';
      var alvo = (String(p.numero) + ' ' + nomeCliente).toLowerCase();
      if (alvo.indexOf(busca) === -1) return false;
    }
    return true;
  });

  renderTabelaVendas(lista);
}

function renderTabelaVendas(lista) {
  var tbody = document.getElementById('vendas-tbody');
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8">Nenhum registro encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(function (p) {
    var clienteNome = p.clientes ? (p.clientes.razao_social + (p.clientes.nome_fantasia ? ' (' + p.clientes.nome_fantasia + ')' : '')) : '—';
    var tipoLabel = (p.tipo === 'orcamento' ? 'Orç.' : 'Ped.') + ' nº ' + p.numero;

    var statusBadge;
    if (p.tipo === 'orcamento') {
      statusBadge = p.status_orcamento === 'convertido' ? '<span class="badge badge-ok">Convertido</span>'
        : p.status_orcamento === 'nao_convertido' ? '<span class="badge badge-warning">Não convertido</span>'
        : '<span class="badge badge-warning">Orçamento pendente</span>';
    } else {
      statusBadge = p.pago
        ? '<span class="badge badge-ok">Pago' + (p.data_pagamento ? ' em ' + formatDataVendas(p.data_pagamento) : '') + '</span>'
        : '<span class="badge badge-warning">Pendente</span>';
    }

    var vendedorNome = p.profiles ? p.profiles.nome_exibicao : '—';

    var acaoPago = '';
    if (p.tipo === 'pedido') {
      acaoPago = p.pago
        ? '<button type="button" class="btn btn-outline" style="padding:4px 10px; font-size:0.78rem;" data-marcar-pendente="' + p.id + '">Marcar pendente</button>'
        : '<button type="button" class="btn btn-primary" style="padding:4px 10px; font-size:0.78rem;" data-marcar-pago="' + p.id + '">Pago</button>';
    }

    return '<tr>' +
      '<td>' + tipoLabel + '</td>' +
      '<td>' + clienteNome + '</td>' +
      '<td>' + formatDataVendas(p.created_at) + '</td>' +
      '<td>' + (FORMA_PAGAMENTO_LABELS_VENDAS[p.forma_pagamento] || '—') + '</td>' +
      '<td>' + formatBRLVendas(p.valor_total_a_pagar) + '</td>' +
      '<td data-role-admin>' + vendedorNome + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td class="row-actions"><a href="pedido.html?editar=' + p.id + '">Editar</a>' + (acaoPago ? ' ' + acaoPago : '') + '</td>' +
    '</tr>';
  }).join('');

  // data-role-admin nas células novas não passa pelo auth-guard (que já rodou no
  // load da página) — remove manualmente se o usuário atual não é admin/ADM1.
  if (ROLES_VENDEDOR.indexOf(currentUserRole) !== -1) {
    tbody.querySelectorAll('[data-role-admin]').forEach(function (el) { el.remove(); });
  }

  tbody.querySelectorAll('[data-marcar-pago]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      var result = await marcarPedidoPago(btn.dataset.marcarPago, true);
      if (result.error) { showToast('Erro ao marcar como pago: ' + result.error.message, 'error'); btn.disabled = false; return; }
      showToast('Pedido marcado como pago.', 'ok');
      carregarVendas();
    });
  });

  tbody.querySelectorAll('[data-marcar-pendente]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Marcar este pedido como pendente de pagamento de novo?')) return;
      btn.disabled = true;
      var result = await marcarPedidoPago(btn.dataset.marcarPendente, false);
      if (result.error) { showToast('Erro: ' + result.error.message, 'error'); btn.disabled = false; return; }
      showToast('Pedido marcado como pendente.', 'ok');
      carregarVendas();
    });
  });
}

document.getElementById('filtro-busca').addEventListener('input', aplicarFiltrosERenderizar);
document.getElementById('filtro-status').addEventListener('change', aplicarFiltrosERenderizar);
document.getElementById('filtro-tipo').addEventListener('change', aplicarFiltrosERenderizar);
var filtroVendedorEl = document.getElementById('filtro-vendedor');
if (filtroVendedorEl) filtroVendedorEl.addEventListener('change', aplicarFiltrosERenderizar);

document.getElementById('btn-ver-todos').addEventListener('click', function () {
  document.getElementById('filtro-busca').value = '';
  document.getElementById('filtro-tipo').value = '';
  document.getElementById('filtro-status').value = '';
  if (filtroVendedorEl) filtroVendedorEl.value = '';
  aplicarFiltrosERenderizar();
});

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  currentUserId = auth.session.user.id;
  currentUserRole = auth.profile.role;

  if (ROLES_VENDEDOR.indexOf(currentUserRole) === -1) await carregarVendedoresFiltro();
  await carregarVendas();
})();
