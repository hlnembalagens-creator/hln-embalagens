var currentUserId = null;
var currentUserRole = null;
var ROLES_VENDEDOR = ['vendedor', 'vendedor_ext', 'vendedor_int'];
var clientesCacheVendas = [];
var buscaDebounceTimer = null;
var buscaSequencia = 0; // descarta respostas de buscas antigas quando o usuário continua digitando

async function carregarClientesParaBusca() {
  var { data, error } = await supabaseClient.from('clientes').select('id, razao_social, nome_fantasia, cnpj_cpf, municipio, uf').order('razao_social');
  if (error) return;
  clientesCacheVendas = data || [];
}

function semAcento(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function soDigitos(texto) {
  return String(texto || '').replace(/\D/g, '');
}

function escapeHtmlVendas(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// "53", "#53", "pedido 53", "orçamento 12", "nº 7" -> 53 / 12 / 7. Qualquer outra coisa -> null.
function numeroDePedidoDigitado(termo) {
  var m = semAcento(termo).trim().match(/^(?:pedido|orcamento)?\s*(?:n[o°º.]*|#)?\s*[:.]?\s*(\d{1,6})$/);
  return m ? parseInt(m[1], 10) : null;
}

// Todas as palavras digitadas precisam aparecer (nome, fantasia, cidade ou CNPJ), em qualquer ordem e sem acento.
function clientesQueCombinam(termo) {
  var palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  var digitosTermo = soDigitos(termo);
  var termoEhSoCnpj = digitosTermo.length >= 4 && /^[\d.\-\/\s]+$/.test(termo);
  return clientesCacheVendas.filter(function (c) {
    if (termoEhSoCnpj) return soDigitos(c.cnpj_cpf).indexOf(digitosTermo) !== -1;
    var alvo = semAcento(c.razao_social + ' ' + (c.nome_fantasia || '') + ' ' + (c.municipio || '') + ' ' + (c.uf || ''));
    return palavras.every(function (p) { return alvo.indexOf(p) !== -1; });
  });
}

function tituloCliente(c) {
  return escapeHtmlVendas(c.razao_social) + (c.nome_fantasia ? ' (' + escapeHtmlVendas(c.nome_fantasia) + ')' : '');
}

async function renderResultadosVendas(termo) {
  var container = document.getElementById('vendas-resultados');
  var minhaBusca = ++buscaSequencia;

  if (!termo) {
    container.innerHTML = '<p style="color:var(--gray-400); text-align:center; padding:30px 0;">Digite um nº de pedido, nome de cliente, CNPJ ou cidade acima.</p>';
    return;
  }

  // 1) Número de pedido/orçamento (os dois dividem a mesma numeração)
  var cartoes = []; // { cliente, destacar }
  var numero = numeroDePedidoDigitado(termo);
  if (numero != null) {
    var { data: pedidos } = await supabaseClient.from('pedidos').select('numero, cliente_id').eq('numero', numero);
    if (minhaBusca !== buscaSequencia) return;
    (pedidos || []).forEach(function (p) {
      var cliente = clientesCacheVendas.find(function (c) { return c.id === p.cliente_id; });
      if (cliente) cartoes.push({ cliente: cliente, destacar: p.numero });
    });
  }

  // 2) Cliente por nome/fantasia/cidade/CNPJ (sem repetir quem já apareceu pelo número)
  clientesQueCombinam(termo).forEach(function (c) {
    if (!cartoes.some(function (x) { return x.cliente.id === c.id; })) cartoes.push({ cliente: c, destacar: null });
  });

  if (!cartoes.length) {
    container.innerHTML = '<p style="color:var(--gray-400); text-align:center; padding:30px 0;">' +
      (numero != null ? 'Nenhum pedido ou orçamento nº ' + numero + ' encontrado, nem cliente com esse termo.' : 'Nenhum cliente encontrado com esse termo.') + '</p>';
    return;
  }

  container.innerHTML = cartoes.map(function (x) {
    return '<div class="admin-card">' +
      '<h2>' + tituloCliente(x.cliente) + (x.destacar != null ? ' <span class="badge badge-warning" style="font-size:0.7rem; vertical-align:middle;">achado pelo nº ' + x.destacar + '</span>' : '') + '</h2>' +
      '<div id="vendas-hist-' + x.cliente.id + '">Carregando...</div>' +
    '</div>';
  }).join('');

  cartoes.forEach(function (x) {
    loadHistoricoCliente(x.cliente.id, 'vendas-hist-' + x.cliente.id, undefined, x.destacar);
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
