var isAdminEstoque = false;
var ROLES_VENDEDOR_ESTOQUE = ['vendedor', 'vendedor_ext', 'vendedor_int'];
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

// Margem sobre o custo: quanto o preço de venda está acima do que pagamos.
function calcularMargemPercentualEstoque(custo, venda) {
  if (!custo || custo <= 0 || venda == null) return null;
  return ((venda - custo) / custo) * 100;
}
function formatarMargemEstoque(margem) {
  if (margem == null) return '—';
  return margem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

// Etiquetas em rolo vêm em caixas fechadas — a quantidade de rolos por caixa
// muda com a largura (primeiro número do "WWxLLL" no nome, ex: "ETQ TERMICA
// 60X110 30M"). Só sabemos converter as larguras abaixo; outras larguras (ou
// produtos que não são etiqueta) não mostram caixa, só a unidade.
var ROLOS_POR_CAIXA_ETIQUETA = { 40: 60, 60: 33 };

function larguraEtiquetaEstoque(produto) {
  var nome = (produto.nome_produto || '').toUpperCase();
  if (nome.indexOf('ETQ') === -1 && nome.indexOf('ETIQUETA') === -1) return null;
  var m = nome.match(/(\d{2,3})\s*X\s*\d/);
  return m ? parseInt(m[1], 10) : null;
}

function formatarCaixasEstoque(produto) {
  var largura = larguraEtiquetaEstoque(produto);
  var rolosPorCaixa = largura != null ? ROLOS_POR_CAIXA_ETIQUETA[largura] : null;
  if (!rolosPorCaixa) return '—';

  var qtd = produto.quantidade_estoque || 0;
  var caixas = Math.floor(qtd / rolosPorCaixa);
  var resto = qtd % rolosPorCaixa;
  return caixas + ' cx' + (resto ? ' + ' + resto : '');
}

function renderHeadEstoque() {
  var thead = document.getElementById('estoque-thead');
  thead.innerHTML = isAdminEstoque
    ? '<tr><th>Nome</th><th>Código</th><th>NCM</th><th>Custo Unit.</th><th>Venda Unit.</th><th>Margem</th><th>Estoque</th><th>Caixas</th><th></th></tr>'
    : '<tr><th>Nome</th><th>Estoque</th><th>Caixas</th></tr>';
}

function renderEstoqueTable(list) {
  var tbody = document.getElementById('estoque-tbody');
  var colspan = isAdminEstoque ? 9 : 3;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="' + colspan + '">Nenhum produto cadastrado ainda.</td></tr>';
    return;
  }

  if (!isAdminEstoque) {
    tbody.innerHTML = list.map(function (p) {
      return '<tr><td>' + p.nome_produto + '</td><td>' + (p.quantidade_estoque || 0).toLocaleString('pt-BR') + '</td><td>' + formatarCaixasEstoque(p) + '</td></tr>';
    }).join('');
    return;
  }

  tbody.innerHTML = list.map(function (p) {
    var codigoCell = p.codigo_produto ? p.codigo_produto : '<span class="badge badge-warning">Pendente</span>';
    var ncmCell = p.ncm ? p.ncm : '<span class="badge badge-warning">Pendente</span>';
    var custo = p.preco_custo != null ? 'R$ ' + Number(p.preco_custo).toFixed(2).replace('.', ',') : '—';
    var preco = p.preco_unitario != null ? 'R$ ' + Number(p.preco_unitario).toFixed(2).replace('.', ',') : '—';
    var margem = formatarMargemEstoque(calcularMargemPercentualEstoque(p.preco_custo, p.preco_unitario));
    var estoqueBaixo = (p.quantidade_estoque || 0) <= 0 ? ' <span class="badge badge-warning">Sem estoque</span>' : '';

    return '<tr>' +
      '<td>' + p.nome_produto + '</td>' +
      '<td>' + codigoCell + '</td>' +
      '<td>' + ncmCell + '</td>' +
      '<td>' + custo + '</td>' +
      '<td>' + preco + '</td>' +
      '<td>' + margem + '</td>' +
      '<td>' + (p.quantidade_estoque || 0).toLocaleString('pt-BR') + estoqueBaixo + '</td>' +
      '<td>' + formatarCaixasEstoque(p) + '</td>' +
      '<td class="row-actions"><button data-ajustar="' + p.id + '">Editar</button> <button data-excluir-produto="' + p.id + '" style="color:#a92323;">Excluir</button></td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-ajustar]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var produto = allProdutosEstoque.find(function (p) { return p.id === btn.dataset.ajustar; });
      if (!produto) return;
      abrirModalAjustar(produto);
    });
  });

  tbody.querySelectorAll('[data-excluir-produto]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var produto = allProdutosEstoque.find(function (p) { return p.id === btn.dataset.excluirProduto; });
      if (!produto) return;
      if (!confirm('Excluir "' + produto.nome_produto + '" do estoque? Essa ação não pode ser desfeita.')) return;

      btn.disabled = true;
      var { error } = await supabaseClient.from('produtos_catalogo').delete().eq('id', produto.id);
      if (error) {
        showToast('Erro ao excluir: ' + error.message, 'error');
        btn.disabled = false;
        return;
      }
      showToast('Produto excluído.', 'ok');
      loadProdutosEstoque();
    });
  });
}

function ordenarPorCodigoEstoque(list) {
  return list.slice().sort(function (a, b) {
    var codA = a.codigo_produto, codB = b.codigo_produto;
    if (!codA && !codB) return 0;
    if (!codA) return 1;
    if (!codB) return -1;
    return codA.localeCompare(codB, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}

async function loadProdutosEstoque() {
  var { data, error } = await supabaseClient
    .from('produtos_catalogo')
    .select('*');

  if (error) {
    showToast('Erro ao carregar estoque: ' + error.message, 'error');
    return;
  }

  allProdutosEstoque = ordenarPorCodigoEstoque(data || []);
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

function atualizarMargemPreviewAjuste() {
  var custo = toNumberEstoque(document.getElementById('ajustar-custo').value);
  var preco = toNumberEstoque(document.getElementById('ajustar-preco').value);
  var margem = calcularMargemPercentualEstoque(custo, preco);
  document.getElementById('ajustar-margem').textContent = formatarMargemEstoque(margem);
}

function abrirModalAjustar(produto) {
  produtoEmAjuste = produto;
  document.getElementById('ajustar-nome').value = produto.nome_produto || '';
  document.getElementById('ajustar-quantidade').value = produto.quantidade_estoque || 0;
  document.getElementById('ajustar-custo').value = produto.preco_custo != null ? produto.preco_custo : '';
  document.getElementById('ajustar-preco').value = produto.preco_unitario != null ? produto.preco_unitario : '';
  atualizarMargemPreviewAjuste();
  document.getElementById('ajustar-error').style.display = 'none';
  document.getElementById('modal-ajustar-estoque').classList.add('open');
}

document.getElementById('ajustar-custo').addEventListener('input', atualizarMargemPreviewAjuste);
document.getElementById('ajustar-preco').addEventListener('input', atualizarMargemPreviewAjuste);

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

  var novoNome = document.getElementById('ajustar-nome').value.trim();
  if (!novoNome) {
    errorEl.textContent = 'A descrição não pode ficar vazia.';
    errorEl.style.display = 'block';
    return;
  }

  var novaQuantidade = toNumberEstoque(document.getElementById('ajustar-quantidade').value);
  if (novaQuantidade < 0) {
    errorEl.textContent = 'A quantidade não pode ser negativa.';
    errorEl.style.display = 'block';
    return;
  }

  var custoStr = document.getElementById('ajustar-custo').value.trim();
  var precoStr = document.getElementById('ajustar-preco').value.trim();
  var novoCusto = custoStr ? toNumberEstoque(custoStr) : null;
  var novoPreco = precoStr ? toNumberEstoque(precoStr) : null;

  if (novoCusto != null && novoCusto < 0) {
    errorEl.textContent = 'O custo não pode ser negativo.';
    errorEl.style.display = 'block';
    return;
  }
  if (novoPreco != null && novoPreco < 0) {
    errorEl.textContent = 'O preço de venda não pode ser negativo.';
    errorEl.style.display = 'block';
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  var { error } = await supabaseClient
    .from('produtos_catalogo')
    .update({ nome_produto: novoNome, quantidade_estoque: novaQuantidade, preco_custo: novoCusto, preco_unitario: novoPreco })
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

/* ===================== IMPORTAÇÕES PENDENTES (automáticas, pasta Nfe) ===================== */

var pendentesCache = [];
var pendenteEmRevisaoId = null;

async function loadPendentes() {
  var { data, error } = await supabaseClient
    .from('estoque_importacoes_pendentes')
    .select('*')
    .in('status', ['pendente', 'erro'])
    .order('created_at', { ascending: true });

  if (error) return;
  pendentesCache = data || [];
  renderPendentes();
}

function renderPendentes() {
  var card = document.getElementById('card-pendentes');
  var lista = document.getElementById('pendentes-lista');

  if (!pendentesCache.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  lista.innerHTML = pendentesCache.map(function (p) {
    if (p.status === 'erro') {
      return '<div class="form-actions" style="justify-content:space-between; border-bottom:1px solid var(--off-white); padding:10px 0;">' +
        '<div><strong>' + p.nome_arquivo + '</strong><br><span style="color:var(--gray-400); font-size:0.85rem;">Falha na leitura: ' + (p.erro || 'erro desconhecido') + '</span></div>' +
        '<button type="button" class="btn btn-outline" data-descartar-pendente="' + p.id + '">Descartar</button>' +
      '</div>';
    }
    var forn = (p.dados && p.dados.fornecedor) || {};
    var valor = (p.dados && p.dados.valor_total_documento) || 0;
    return '<div class="form-actions" style="justify-content:space-between; border-bottom:1px solid var(--off-white); padding:10px 0;">' +
      '<div><strong>' + p.nome_arquivo + '</strong><br><span style="color:var(--gray-400); font-size:0.85rem;">' +
        (forn.razao_social || forn.nome_fantasia || 'Fornecedor não identificado') + ' — R$ ' + Number(valor).toFixed(2).replace('.', ',') +
      '</span></div>' +
      '<div>' +
        '<button type="button" class="btn btn-outline" data-descartar-pendente="' + p.id + '">Descartar</button> ' +
        '<button type="button" class="btn btn-primary" data-revisar-pendente="' + p.id + '">Revisar</button>' +
      '</div>' +
    '</div>';
  }).join('');

  lista.querySelectorAll('[data-revisar-pendente]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pendente = pendentesCache.find(function (p) { return p.id === btn.dataset.revisarPendente; });
      if (!pendente) return;
      pendenteEmRevisaoId = pendente.id;
      document.getElementById('import-status').style.display = 'none';
      mostrarRevisao(pendente.dados);
      document.getElementById('import-revisao').scrollIntoView({ behavior: 'smooth' });
    });
  });

  lista.querySelectorAll('[data-descartar-pendente]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      await supabaseClient.from('estoque_importacoes_pendentes')
        .update({ status: 'descartado', processado_em: new Date().toISOString(), processado_por: currentUserIdEstoque })
        .eq('id', btn.dataset.descartarPendente);
      if (pendenteEmRevisaoId === btn.dataset.descartarPendente) {
        pendenteEmRevisaoId = null;
        document.getElementById('import-revisao').style.display = 'none';
      }
      loadPendentes();
    });
  });
}

/* ===================== IMPORTAR NF/ROMANEIO ===================== */

var dadosExtraidos = null;
var currentUserIdEstoque = null;

function normalizarCnpjEstoque(v) {
  return (v || '').replace(/\D/g, '');
}

function arquivoParaBase64(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      // reader.result vem como "data:application/pdf;base64,XXXXX" — só a parte depois da vírgula.
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
    reader.readAsDataURL(file);
  });
}

// Normaliza pra comparar descrições vindas de PDF/foto com o que já está
// cadastrado, ignorando acento, caixa e pontuação (varia bastante entre
// romaneios do mesmo fornecedor).
function normalizarNomeProdutoEstoque(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Acha o produto já cadastrado mais parecido com a descrição lida — igual
// exata primeiro, senão por sobreposição de palavras (score >= 0.6).
function encontrarProdutoParecidoEstoque(descricao, produtos) {
  var alvo = normalizarNomeProdutoEstoque(descricao);
  if (!alvo) return null;

  var exato = produtos.find(function (p) { return normalizarNomeProdutoEstoque(p.nome_produto) === alvo; });
  if (exato) return exato;

  var alvoTokens = alvo.split(' ').filter(Boolean);
  if (!alvoTokens.length) return null;

  var melhor = null, melhorScore = 0;
  produtos.forEach(function (p) {
    var tokensP = normalizarNomeProdutoEstoque(p.nome_produto).split(' ').filter(Boolean);
    if (!tokensP.length) return;
    var comuns = alvoTokens.filter(function (t) { return tokensP.indexOf(t) !== -1; }).length;
    var score = comuns / Math.max(alvoTokens.length, tokensP.length);
    if (score > melhorScore) { melhorScore = score; melhor = p; }
  });
  return melhorScore >= 0.6 ? melhor : null;
}

function renderRevItemRow(item) {
  var tbody = document.getElementById('rev-itens-tbody');
  var row = document.createElement('tr');

  var sugestao = encontrarProdutoParecidoEstoque(item.descricao, allProdutosEstoque);
  var selectHtml = '<select data-f="produto_id" style="width:180px;"><option value="">— Novo produto —</option>' +
    allProdutosEstoque.map(function (p) {
      var selecionado = sugestao && sugestao.id === p.id ? ' selected' : '';
      return '<option value="' + p.id + '"' + selecionado + '>' + p.nome_produto + '</option>';
    }).join('') +
    '</select>';

  row.innerHTML =
    '<td>' + selectHtml + '</td>' +
    '<td><input type="text" data-f="descricao" value="' + (item.descricao || '').replace(/"/g, '&quot;') + '" style="width:100%;"></td>' +
    '<td><input type="text" data-f="codigo" value="' + (item.codigo || '') + '" style="width:90px;"></td>' +
    '<td><input type="text" data-f="ncm" value="' + (item.ncm || '') + '" style="width:90px;"></td>' +
    '<td><input type="text" inputmode="decimal" data-f="quantidade" value="' + (item.quantidade || 0) + '" style="width:70px;"></td>' +
    '<td><input type="text" inputmode="decimal" data-f="valor_unitario" value="' + (item.valor_unitario || 0) + '" style="width:90px;"></td>' +
    '<td><button type="button" class="item-remove" title="Remover">✕</button></td>';
  row.querySelector('.item-remove').addEventListener('click', function () { row.remove(); });
  tbody.appendChild(row);
}

function renderRevParcelaRow(parcela) {
  var tbody = document.getElementById('rev-parcelas-tbody');
  var row = document.createElement('tr');
  row.innerHTML =
    '<td><input type="date" data-f="vencimento" value="' + (parcela.vencimento || '') + '"></td>' +
    '<td><input type="text" inputmode="decimal" data-f="valor" value="' + (parcela.valor || 0) + '" style="width:110px;"></td>' +
    '<td><button type="button" class="item-remove" title="Remover">✕</button></td>';
  row.querySelector('.item-remove').addEventListener('click', function () { row.remove(); });
  tbody.appendChild(row);
}

var fornecedoresConhecidos = [];

function preencherCamposFornecedor(f) {
  document.getElementById('rev-cnpj').value = (f && f.cnpj_cpf) || '';
  document.getElementById('rev-razao-social').value = (f && f.razao_social) || '';
  document.getElementById('rev-nome-fantasia').value = (f && f.nome_fantasia) || '';
  document.getElementById('rev-logradouro').value = (f && f.logradouro) || '';
  document.getElementById('rev-numero').value = (f && f.numero) || '';
  document.getElementById('rev-bairro').value = (f && f.bairro) || '';
  document.getElementById('rev-cep').value = (f && f.cep) || '';
  document.getElementById('rev-municipio').value = (f && f.municipio) || '';
  document.getElementById('rev-uf').value = (f && f.uf) || '';
}

document.getElementById('rev-fornecedor-existente').addEventListener('change', function () {
  var selecionado = fornecedoresConhecidos.find(function (f) { return f.id === this.value; }, this);
  if (selecionado) preencherCamposFornecedor(selecionado);
});

async function mostrarRevisao(dados) {
  dadosExtraidos = dados;
  var forn = dados.fornecedor || {};

  preencherCamposFornecedor({
    cnpj_cpf: forn.cnpj, razao_social: forn.razao_social, nome_fantasia: forn.nome_fantasia,
    logradouro: forn.logradouro, numero: forn.numero, bairro: forn.bairro,
    cep: forn.cep, municipio: forn.municipio, uf: forn.uf
  });

  var { data: fornecedores } = await supabaseClient.from('clientes').select('*').eq('eh_fornecedor', true).order('razao_social');
  fornecedoresConhecidos = fornecedores || [];

  var selectEl = document.getElementById('rev-fornecedor-existente');
  selectEl.innerHTML = '<option value="">— Novo fornecedor —</option>' + fornecedoresConhecidos.map(function (f) {
    return '<option value="' + f.id + '">' + f.razao_social + (f.nome_fantasia ? ' (' + f.nome_fantasia + ')' : '') + '</option>';
  }).join('');

  var badgeEl = document.getElementById('import-fornecedor-badge');
  var cnpjNormalizado = normalizarCnpjEstoque(forn.cnpj);
  var match = null;

  if (cnpjNormalizado) {
    match = fornecedoresConhecidos.find(function (f) { return normalizarCnpjEstoque(f.cnpj_cpf) === cnpjNormalizado; });
  }
  if (!match && (forn.razao_social || forn.nome_fantasia)) {
    // Documento sem CNPJ (comum em romaneio) — tenta casar pelo nome com quem já está cadastrado.
    var nomeBusca = (forn.nome_fantasia || forn.razao_social || '').toLowerCase();
    match = fornecedoresConhecidos.find(function (f) {
      return (f.razao_social || '').toLowerCase().indexOf(nomeBusca) !== -1 ||
        (f.nome_fantasia || '').toLowerCase().indexOf(nomeBusca) !== -1 ||
        nomeBusca.indexOf((f.nome_fantasia || '___').toLowerCase()) !== -1;
    });
  }

  if (match) {
    selectEl.value = match.id;
    preencherCamposFornecedor(match);
    badgeEl.innerHTML = '<span class="badge badge-ok">Já cadastrado: ' + match.razao_social + '</span>';
  } else if (cnpjNormalizado) {
    badgeEl.innerHTML = '<span class="badge badge-warning">Novo fornecedor — vai ser criado</span>';
  } else {
    badgeEl.innerHTML = '<span class="badge badge-warning">Sem CNPJ no documento — selecione o fornecedor acima ou confira os dados antes de salvar</span>';
  }

  document.getElementById('rev-itens-tbody').innerHTML = '';
  (dados.itens || []).forEach(renderRevItemRow);

  document.getElementById('rev-forma-pagamento').value = (dados.pagamento && dados.pagamento.forma) || 'boleto';
  document.getElementById('rev-parcelas-tbody').innerHTML = '';
  var parcelas = (dados.pagamento && dados.pagamento.parcelas) || [];
  if (!parcelas.length) parcelas = [{ vencimento: '', valor: dados.valor_total_documento || 0 }];
  parcelas.forEach(renderRevParcelaRow);

  document.getElementById('import-erro').style.display = 'none';
  document.getElementById('import-revisao').style.display = 'block';
}

document.getElementById('import-ler-btn').addEventListener('click', async function () {
  var fileInput = document.getElementById('import-arquivo');
  var statusEl = document.getElementById('import-status');
  var file = fileInput.files[0];

  if (!file) {
    showToast('Selecione um arquivo PDF antes.', 'warning');
    return;
  }

  if (file.size > 4 * 1024 * 1024) {
    showToast('Esse PDF tem ' + (file.size / (1024 * 1024)).toFixed(1) + 'MB — o limite é 4MB. Tenta escanear com menos qualidade ou só as páginas que importam.', 'error');
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Lendo...';
  statusEl.style.display = 'block';
  statusEl.textContent = 'Lendo o documento (pode levar alguns segundos)...';
  document.getElementById('import-revisao').style.display = 'none';

  try {
    var base64 = await arquivoParaBase64(file);
    var { data: { session } } = await supabaseClient.auth.getSession();

    var resp = await fetch('/api/ler-documento-estoque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: session ? session.access_token : null, pdfBase64: base64 })
    });
    var respData = await resp.json().catch(function () { return {}; });

    if (!resp.ok) {
      statusEl.textContent = 'Erro: ' + (respData.error || 'falha ao ler o documento.') +
        (respData.debug ? ' [debug: ' + respData.debug + ']' : '');
      showToast('Não foi possível ler o documento.', 'error');
      return;
    }

    statusEl.textContent = 'Documento lido. Confira os dados abaixo antes de salvar.';
    await mostrarRevisao(respData.dados);
  } catch (err) {
    statusEl.textContent = 'Erro ao processar: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ler documento';
  }
});

document.getElementById('rev-add-item').addEventListener('click', function () {
  renderRevItemRow({ descricao: '', codigo: '', ncm: '', quantidade: 0, valor_unitario: 0 });
});
document.getElementById('rev-add-parcela').addEventListener('click', function () {
  renderRevParcelaRow({ vencimento: '', valor: 0 });
});

document.getElementById('import-cancelar-btn').addEventListener('click', function () {
  document.getElementById('import-revisao').style.display = 'none';
  document.getElementById('import-arquivo').value = '';
  document.getElementById('import-status').style.display = 'none';
  dadosExtraidos = null;
  pendenteEmRevisaoId = null;
});

function lerLinhasItens() {
  return Array.from(document.querySelectorAll('#rev-itens-tbody tr')).map(function (row) {
    var get = function (f) { return row.querySelector('[data-f="' + f + '"]').value; };
    return {
      produtoId: get('produto_id') || null,
      descricao: get('descricao').trim(),
      codigo: get('codigo').trim() || null,
      ncm: get('ncm').trim() || null,
      quantidade: toNumberEstoque(get('quantidade')),
      valor_unitario: toNumberEstoque(get('valor_unitario'))
    };
  }).filter(function (i) { return i.descricao; });
}

function lerLinhasParcelas() {
  return Array.from(document.querySelectorAll('#rev-parcelas-tbody tr')).map(function (row) {
    return {
      vencimento: row.querySelector('[data-f="vencimento"]').value || null,
      valor: toNumberEstoque(row.querySelector('[data-f="valor"]').value)
    };
  }).filter(function (p) { return p.valor > 0; });
}

document.getElementById('import-confirmar-btn').addEventListener('click', async function () {
  var erroEl = document.getElementById('import-erro');
  erroEl.style.display = 'none';

  var itens = lerLinhasItens();
  var parcelas = lerLinhasParcelas();

  if (!itens.length) {
    erroEl.textContent = 'Adicione ao menos um item.';
    erroEl.style.display = 'block';
    return;
  }
  if (!parcelas.length) {
    erroEl.textContent = 'Informe ao menos uma parcela de pagamento.';
    erroEl.style.display = 'block';
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    // 1) Fornecedor — usa o selecionado na tela se houver; senão casa por CNPJ;
    //    senão cria novo (mesmo sem CNPJ, comum em romaneio — dá pra completar depois em Clientes).
    var cnpj = document.getElementById('rev-cnpj').value.trim();
    var razaoSocial = document.getElementById('rev-razao-social').value.trim();
    var idSelecionado = document.getElementById('rev-fornecedor-existente').value;
    var fornecedorId = null;
    var fornecedorNome = razaoSocial || 'Fornecedor';

    if (razaoSocial || cnpj) {
      var existente = null;
      if (idSelecionado) {
        existente = fornecedoresConhecidos.find(function (f) { return f.id === idSelecionado; });
      } else if (cnpj) {
        var { data: porCnpj } = await supabaseClient.from('clientes').select('id, razao_social, nome_fantasia').eq('cnpj_cpf', cnpj).maybeSingle();
        existente = porCnpj;
      }

      var valoresFornecedor = {
        cnpj_cpf: cnpj || (existente ? existente.cnpj_cpf : null),
        razao_social: razaoSocial || (existente ? existente.razao_social : null),
        nome_fantasia: document.getElementById('rev-nome-fantasia').value.trim() || null,
        logradouro: document.getElementById('rev-logradouro').value.trim() || null,
        numero: document.getElementById('rev-numero').value.trim() || null,
        bairro: document.getElementById('rev-bairro').value.trim() || null,
        cep: document.getElementById('rev-cep').value.trim() || null,
        municipio: document.getElementById('rev-municipio').value.trim() || null,
        uf: document.getElementById('rev-uf').value.trim().toUpperCase() || null,
        eh_fornecedor: true
      };

      if (existente) {
        fornecedorId = existente.id;
        fornecedorNome = valoresFornecedor.razao_social + (existente.nome_fantasia ? ' (' + existente.nome_fantasia + ')' : '');
        await supabaseClient.from('clientes').update(valoresFornecedor).eq('id', existente.id);
      } else {
        // Nome/telefone/e-mail do contato ficam em branco de propósito — mudam a cada compra, preenchimento manual.
        valoresFornecedor.created_by = currentUserIdEstoque;
        var { data: novoFornecedor, error: erroFornecedor } = await supabaseClient.from('clientes').insert(valoresFornecedor).select().single();
        if (erroFornecedor) throw new Error('Erro ao criar fornecedor: ' + erroFornecedor.message);
        fornecedorId = novoFornecedor.id;
        fornecedorNome = valoresFornecedor.razao_social;
      }
    }

    // 2) Itens — usa o produto selecionado na tela (ou casado por nome/similaridade
    //    automaticamente); se não achar, cria novo (preço de venda fica em branco
    //    de propósito — só o custo vem da NF).
    var produtosAtuais = allProdutosEstoque.slice();
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      var existenteProduto = item.produtoId
        ? produtosAtuais.find(function (p) { return p.id === item.produtoId; })
        : encontrarProdutoParecidoEstoque(item.descricao, produtosAtuais);

      if (existenteProduto) {
        var novaQuantidade = (existenteProduto.quantidade_estoque || 0) + item.quantidade;
        await supabaseClient.from('produtos_catalogo').update({
          quantidade_estoque: novaQuantidade,
          preco_custo: item.valor_unitario || existenteProduto.preco_custo,
          codigo_produto: existenteProduto.codigo_produto || item.codigo,
          ncm: existenteProduto.ncm || item.ncm
        }).eq('id', existenteProduto.id);
        existenteProduto.quantidade_estoque = novaQuantidade;
      } else {
        var { data: novoProduto } = await supabaseClient.from('produtos_catalogo').insert({
          nome_produto: item.descricao, codigo_produto: item.codigo, ncm: item.ncm,
          quantidade_estoque: item.quantidade, preco_custo: item.valor_unitario || null,
          created_by: currentUserIdEstoque
        }).select().single();
        if (novoProduto) produtosAtuais.push(novoProduto);
      }
    }

    // 3) Financeiro — uma saída por parcela, categoria Fornecedor.
    var saidas = parcelas.map(function (p) {
      return {
        data: p.vencimento || new Date().toISOString().slice(0, 10),
        descricao: fornecedorNome + ' — compra de estoque',
        categoria: 'Fornecedor',
        valor: p.valor,
        observacao: 'Gerado a partir da leitura de NF/romaneio.',
        created_by: currentUserIdEstoque
      };
    });
    await supabaseClient.from('financeiro_saidas').insert(saidas);

    if (pendenteEmRevisaoId) {
      await supabaseClient.from('estoque_importacoes_pendentes')
        .update({ status: 'processado', processado_em: new Date().toISOString(), processado_por: currentUserIdEstoque })
        .eq('id', pendenteEmRevisaoId);
      pendenteEmRevisaoId = null;
      loadPendentes();
    }

    showToast('Importação concluída: fornecedor, estoque e financeiro atualizados.', 'ok');
    document.getElementById('import-revisao').style.display = 'none';
    document.getElementById('import-arquivo').value = '';
    document.getElementById('import-status').style.display = 'none';
    dadosExtraidos = null;
    loadProdutosEstoque();
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar e Salvar';
  }
});

/* ===================== EXPORTAR LISTA DE PREÇO ===================== */

var BRAND_MARK_HTML_ESTOQUE =
  '<div class="brand-mark" role="img" aria-label="HLN Embalagens e Equipamentos">' +
    '<span class="bm-label" aria-hidden="true">Embalagens</span>' +
    '<svg class="bm-arc" viewBox="0 0 200 40" aria-hidden="true">' +
      '<path d="M6 38 Q100 2 194 38"/><path d="M30 38 Q100 14 170 38"/><path d="M54 38 Q100 24 146 38"/>' +
    '</svg>' +
    '<span class="bm-hln" aria-hidden="true">HLN</span>' +
    '<svg class="bm-arc" viewBox="0 0 200 40" aria-hidden="true">' +
      '<path d="M6 2 Q100 38 194 2"/><path d="M30 2 Q100 26 170 2"/><path d="M54 2 Q100 16 146 2"/>' +
    '</svg>' +
    '<span class="bm-label" aria-hidden="true">e Equipamentos</span>' +
  '</div>';

function formatBRLEstoque(n) {
  return 'R$ ' + toNumberEstoque(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildListaPrecoHtml(produtos) {
  var dataStr = new Date().toLocaleDateString('pt-BR');
  var linhasHtml = produtos.map(function (p) {
    return '<tr>' +
      '<td>' + p.nome_produto + '</td>' +
      '<td>' + (p.codigo_produto || '—') + '</td>' +
      '<td>' + formatBRLEstoque(p.preco_unitario) + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="orcamento-via">' +
    '<div class="orcamento-header">' +
      '<div>' + BRAND_MARK_HTML_ESTOQUE +
        '<div class="orcamento-empresa-dados">' +
          'HLN Embalagens e Equipamentos<br>' +
          'CNPJ: 66.878.650/0001-42<br>' +
          'Jardim Nossa Senhora de Fátima, Americana - SP, CEP 13478-570' +
        '</div>' +
      '</div>' +
      '<div class="orcamento-titulo"><h1>LISTA DE PREÇOS</h1>Data: ' + dataStr + '</div>' +
    '</div>' +
    '<table><thead><tr><th>Produto</th><th>Código</th><th>Preço</th></tr></thead><tbody>' + linhasHtml + '</tbody></table>' +
  '</div>';
}

document.getElementById('btn-exportar-lista-preco').addEventListener('click', function () {
  var produtosComPreco = allProdutosEstoque
    .filter(function (p) { return p.preco_unitario != null; })
    .slice()
    .sort(function (a, b) { return (a.nome_produto || '').localeCompare(b.nome_produto || ''); });

  if (!produtosComPreco.length) {
    showToast('Nenhum produto com preço de venda cadastrado ainda.', 'warning');
    return;
  }

  document.getElementById('lista-preco-sheet').innerHTML = buildListaPrecoHtml(produtosComPreco);
  var tituloOriginal = document.title;
  document.title = 'Lista de Preços - Portal HLN';
  window.print();
  document.title = tituloOriginal;
});

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  isAdminEstoque = ROLES_VENDEDOR_ESTOQUE.indexOf(auth.profile.role) === -1;
  currentUserIdEstoque = auth.session.user.id;
  renderHeadEstoque();
  loadProdutosEstoque();
  if (isAdminEstoque) loadPendentes();
})();
