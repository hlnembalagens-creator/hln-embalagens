var isAdminEstoque = false;
var allProdutosEstoque = [];

function toNumberEstoque(v) {
  if (v == null) return 0;
  var s = String(v).trim();
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function renderHeadEstoque() {
  var thead = document.getElementById('estoque-thead');
  thead.innerHTML = isAdminEstoque
    ? '<tr><th>Nome</th><th>Código</th><th>NCM</th><th>Preço Unit.</th><th>Estoque</th><th></th></tr>'
    : '<tr><th>Nome</th><th>Estoque</th></tr>';
}

function renderEstoqueTable(list) {
  var tbody = document.getElementById('estoque-tbody');
  var colspan = isAdminEstoque ? 6 : 2;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="' + colspan + '">Nenhum produto cadastrado ainda.</td></tr>';
    return;
  }

  if (!isAdminEstoque) {
    tbody.innerHTML = list.map(function (p) {
      return '<tr><td>' + p.nome_produto + '</td><td>' + (p.quantidade_estoque || 0).toLocaleString('pt-BR') + '</td></tr>';
    }).join('');
    return;
  }

  tbody.innerHTML = list.map(function (p) {
    var codigoCell = p.codigo_produto ? p.codigo_produto : '<span class="badge badge-warning">Pendente</span>';
    var ncmCell = p.ncm ? p.ncm : '<span class="badge badge-warning">Pendente</span>';
    var preco = p.preco_unitario != null ? 'R$ ' + Number(p.preco_unitario).toFixed(2).replace('.', ',') : '—';
    var estoqueBaixo = (p.quantidade_estoque || 0) <= 0 ? ' <span class="badge badge-warning">Sem estoque</span>' : '';

    return '<tr>' +
      '<td>' + p.nome_produto + '</td>' +
      '<td>' + codigoCell + '</td>' +
      '<td>' + ncmCell + '</td>' +
      '<td>' + preco + '</td>' +
      '<td>' + (p.quantidade_estoque || 0).toLocaleString('pt-BR') + estoqueBaixo + '</td>' +
      '<td class="row-actions"><button data-ajustar="' + p.id + '">Ajustar</button></td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-ajustar]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var produto = allProdutosEstoque.find(function (p) { return p.id === btn.dataset.ajustar; });
      if (!produto) return;
      abrirModalAjustar(produto);
    });
  });
}

async function loadProdutosEstoque() {
  var { data, error } = await supabaseClient
    .from('produtos_catalogo')
    .select('*')
    .order('nome_produto', { ascending: true });

  if (error) {
    showToast('Erro ao carregar estoque: ' + error.message, 'error');
    return;
  }

  allProdutosEstoque = data || [];
  renderEstoqueTable(allProdutosEstoque);
}

document.getElementById('estoque-search').addEventListener('input', function (e) {
  var term = e.target.value.toLowerCase();
  var filtered = allProdutosEstoque.filter(function (p) {
    return (p.nome_produto || '').toLowerCase().includes(term) ||
      (p.codigo_produto || '').toLowerCase().includes(term);
  });
  renderEstoqueTable(filtered);
});

/* ===================== AJUSTAR QUANTIDADE (admin) ===================== */

var produtoEmAjuste = null;

function abrirModalAjustar(produto) {
  produtoEmAjuste = produto;
  document.getElementById('ajustar-produto-nome').textContent = produto.nome_produto;
  document.getElementById('ajustar-quantidade').value = produto.quantidade_estoque || 0;
  document.getElementById('ajustar-error').style.display = 'none';
  document.getElementById('modal-ajustar-estoque').classList.add('open');
}

function fecharModalAjustar() {
  document.getElementById('modal-ajustar-estoque').classList.remove('open');
  produtoEmAjuste = null;
}

var ajustarCancelarBtn = document.getElementById('ajustar-cancelar');
if (ajustarCancelarBtn) ajustarCancelarBtn.addEventListener('click', fecharModalAjustar);

var ajustarConfirmarBtn = document.getElementById('ajustar-confirmar');
if (ajustarConfirmarBtn) ajustarConfirmarBtn.addEventListener('click', async function () {
  if (!produtoEmAjuste) return;
  var errorEl = document.getElementById('ajustar-error');
  errorEl.style.display = 'none';

  var novaQuantidade = toNumberEstoque(document.getElementById('ajustar-quantidade').value);
  if (novaQuantidade < 0) {
    errorEl.textContent = 'A quantidade não pode ser negativa.';
    errorEl.style.display = 'block';
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  var { error } = await supabaseClient
    .from('produtos_catalogo')
    .update({ quantidade_estoque: novaQuantidade })
    .eq('id', produtoEmAjuste.id);

  btn.disabled = false;
  btn.textContent = 'Salvar';

  if (error) {
    errorEl.textContent = 'Erro ao salvar: ' + error.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Estoque atualizado.', 'ok');
  fecharModalAjustar();
  loadProdutosEstoque();
});

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  isAdminEstoque = auth.profile.role !== 'vendedor';
  renderHeadEstoque();
  loadProdutosEstoque();
})();
