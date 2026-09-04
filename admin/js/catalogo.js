var currentUserId = null;
var currentUserRole = null;
var allProdutos = [];

// Aceita números no formato brasileiro (vírgula decimal, ponto de milhar).
function toNumber(v) {
  if (v == null) return 0;
  var s = String(v).trim();
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function resetProdutoForm() {
  document.getElementById('produto-form').reset();
  document.getElementById('produto-id').value = '';
  document.getElementById('form-title').textContent = 'Novo produto';
  document.getElementById('produto-error').style.display = 'none';
}

async function loadProdutos() {
  var { data, error } = await supabaseClient
    .from('produtos_catalogo')
    .select('*')
    .order('nome_produto', { ascending: true });

  if (error) {
    showToast('Erro ao carregar catálogo: ' + error.message, 'error');
    return;
  }

  allProdutos = data || [];
  renderProdutosTable(allProdutos);
}

function renderProdutosTable(list) {
  var tbody = document.getElementById('produtos-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum produto cadastrado ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function (p) {
    var codigoCell = p.codigo_produto
      ? p.codigo_produto
      : '<span class="badge badge-warning">Pendente</span>';
    var ncmCell = p.ncm
      ? p.ncm
      : '<span class="badge badge-warning">Pendente</span>';
    var preco = p.preco_unitario != null
      ? 'R$ ' + Number(p.preco_unitario).toFixed(2).replace('.', ',')
      : '—';

    return '<tr>' +
      '<td>' + p.nome_produto + '</td>' +
      '<td>' + codigoCell + '</td>' +
      '<td>' + ncmCell + '</td>' +
      '<td>' + preco + '</td>' +
      '<td class="row-actions">' +
        '<button data-edit="' + p.id + '">Editar</button>' +
        (currentUserRole !== 'admin1' ? '<button data-delete="' + p.id + '" class="danger">Excluir</button>' : '') +
      '</td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var produto = allProdutos.find(function (p) { return p.id === btn.dataset.edit; });
      if (!produto) return;
      document.getElementById('produto-id').value = produto.id;
      document.getElementById('nome_produto').value = produto.nome_produto || '';
      document.getElementById('codigo_produto').value = produto.codigo_produto || '';
      document.getElementById('ncm').value = produto.ncm || '';
      document.getElementById('preco_unitario').value = produto.preco_unitario != null ? produto.preco_unitario : '';
      document.getElementById('form-title').textContent = 'Editar produto';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  tbody.querySelectorAll('[data-delete]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Excluir este produto do catálogo?')) return;
      var { error } = await supabaseClient.from('produtos_catalogo').delete().eq('id', btn.dataset.delete);
      if (error) {
        if (error.code === '23503') {
          showToast('Não foi possível excluir: esse produto ainda está vinculado a um pedido antigo.', 'error');
        } else {
          showToast('Erro ao excluir: ' + error.message, 'error');
        }
        return;
      }
      showToast('Produto excluído.', 'ok');
      loadProdutos();
    });
  });
}

/* ===================== EXPORTAR / IMPORTAR EXCEL ===================== */

var PRODUTO_COLUNAS_EXCEL = ['nome_produto', 'codigo_produto', 'ncm', 'preco_unitario'];

document.getElementById('btn-exportar-produtos').addEventListener('click', function () {
  var linhas = allProdutos.map(function (p) {
    return {
      nome_produto: p.nome_produto || '',
      codigo_produto: p.codigo_produto || '',
      ncm: p.ncm || '',
      preco_unitario: p.preco_unitario != null ? p.preco_unitario : ''
    };
  });
  baixarExcel('catalogo.xlsx', linhas, PRODUTO_COLUNAS_EXCEL);
});

document.getElementById('btn-importar-produtos').addEventListener('click', function () {
  document.getElementById('input-importar-produtos').click();
});

document.getElementById('input-importar-produtos').addEventListener('change', async function (e) {
  var file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  var statusEl = document.getElementById('importar-produtos-status');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Lendo arquivo...';

  var linhas;
  try {
    linhas = await lerArquivoExcel(file);
  } catch (err) {
    statusEl.textContent = 'Erro ao ler o arquivo: ' + err.message;
    return;
  }

  var criados = 0, atualizados = 0, semNome = 0, comErro = 0;
  // Cópia local que também recebe os registros criados/atualizados durante este
  // mesmo import, pra linhas repetidas no arquivo se reconhecerem entre si
  // (allProdutos só é recarregado no final, não a cada linha).
  var produtosConhecidos = allProdutos.slice();

  for (var i = 0; i < linhas.length; i++) {
    var linha = linhas[i];
    var nome = campoExcel(linha, ['nome_produto', 'Nome do Produto', 'Nome']);
    if (!nome) { semNome++; continue; }

    var codigo = campoExcel(linha, ['codigo_produto', 'Código do Produto', 'Código']);
    var ncm = campoExcel(linha, ['ncm', 'NCM']);
    var precoTexto = campoExcel(linha, ['preco_unitario', 'Preço Unitário', 'Preço']);
    var preco = precoTexto ? toNumber(precoTexto) : null;

    var existente = produtosConhecidos.find(function (p) {
      return (p.nome_produto || '').trim().toLowerCase() === nome.toLowerCase();
    });

    var values = {
      nome_produto: nome, codigo_produto: codigo || null, ncm: ncm || null, preco_unitario: preco
    };

    var resultado;
    if (existente) {
      resultado = await supabaseClient.from('produtos_catalogo').update(values).eq('id', existente.id).select().single();
    } else {
      values.created_by = currentUserId;
      resultado = await supabaseClient.from('produtos_catalogo').insert(values).select().single();
    }

    if (resultado.error) { comErro++; continue; }
    if (existente) {
      atualizados++;
      Object.assign(existente, resultado.data);
    } else {
      criados++;
      produtosConhecidos.push(resultado.data);
    }
  }

  var resumoPartes = [];
  if (criados) resumoPartes.push(criados + ' criado(s)');
  if (atualizados) resumoPartes.push(atualizados + ' atualizado(s) por nome já existente');
  if (semNome) resumoPartes.push(semNome + ' linha(s) ignorada(s) por falta de nome');
  if (comErro) resumoPartes.push(comErro + ' com erro');

  statusEl.textContent = 'Importação concluída: ' + (resumoPartes.join(', ') || 'nenhuma linha processada') + '.';
  showToast('Importação de produtos concluída.', comErro ? 'warning' : 'ok');
  await loadProdutos();
});

document.getElementById('produto-search').addEventListener('input', function (e) {
  var term = e.target.value.toLowerCase();
  var filtered = allProdutos.filter(function (p) {
    return (p.nome_produto || '').toLowerCase().includes(term) ||
      (p.codigo_produto || '').toLowerCase().includes(term);
  });
  renderProdutosTable(filtered);
});

document.getElementById('produto-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var errorEl = document.getElementById('produto-error');
  var saveBtn = document.getElementById('produto-save-btn');
  errorEl.style.display = 'none';

  var nome = document.getElementById('nome_produto').value.trim();
  if (!nome) {
    errorEl.textContent = 'Nome do Produto é obrigatório.';
    errorEl.style.display = 'block';
    return;
  }

  var codigo = document.getElementById('codigo_produto').value.trim();
  var ncm = document.getElementById('ncm').value.trim();

  if (!codigo || !ncm) {
    var faltando = [];
    if (!codigo) faltando.push('Código do Produto');
    if (!ncm) faltando.push('NCM');
    showToast('Lembre de preencher depois: ' + faltando.join(' e ') + '.', 'warning');
  }

  var values = {
    nome_produto: nome,
    codigo_produto: codigo || null,
    ncm: ncm || null,
    preco_unitario: document.getElementById('preco_unitario').value ? toNumber(document.getElementById('preco_unitario').value) : null
  };

  var produtoId = document.getElementById('produto-id').value;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';

  var result;
  if (produtoId) {
    result = await supabaseClient.from('produtos_catalogo').update(values).eq('id', produtoId);
  } else {
    values.created_by = currentUserId;
    result = await supabaseClient.from('produtos_catalogo').insert(values);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Salvar produto';

  if (result.error) {
    errorEl.textContent = 'Erro ao salvar: ' + result.error.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Produto salvo com sucesso.', 'ok');
  resetProdutoForm();
  loadProdutos();
});

document.getElementById('produto-cancel-btn').addEventListener('click', resetProdutoForm);

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  currentUserId = auth.session.user.id;
  currentUserRole = auth.profile.role;
  loadProdutos();
})();
