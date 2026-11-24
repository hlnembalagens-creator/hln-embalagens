// Tela de importação de extrato (Financeiro): revisão e aplicação. A leitura e as sugestões ficam em
// extrato-core.js (carregado antes deste arquivo).

/* ===================== TELA ===================== */

function fmtBRLExtrato(n) {
  return (n < 0 ? '−' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function opcoesAcao(linha) {
  var ops = [['', '— decidir —']];
  if (linha.mov.valor > 0) {
    if (linha.candidatos.ja.length) ops.push(['ja_lancado', 'Já lançado (nada a fazer)']);
    if (linha.candidatos.baixa.length) ops.push(['baixa', 'Dar baixa numa entrada pendente']);
    ops.push(['criar_entrada', 'Criar entrada paga']);
  } else {
    if (linha.candidatos.saida.length) ops.push(['vincular_saida', 'Vincular a saída já lançada']);
    ops.push(['criar_saida', 'Criar saída']);
  }
  ops.push(['ignorar', 'Ignorar (não é venda/despesa)']);
  return ops;
}

function rotuloEntrada(e) { return formatDataFin(e.data) + ' • ' + (e.cliente_nome || '—') + ' • ' + (e.produto || '') + ' • ' + formatBRLFin(e.valor); }
function rotuloSaida(s) { return formatDataFin(s.data) + ' • ' + s.descricao + ' • ' + formatBRLFin(s.valor); }
function rotuloPedido(p) { return 'Pedido nº ' + p.numero + ' • ' + (p.cliente_nome || '—') + ' • ' + formatBRLFin(p.valor_total_a_pagar); }

function celulaDetalhe(linha, idx) {
  var a = linha.acao;
  function sel(lista, rotulo, comVazio) {
    return '<select data-alvo="' + idx + '">' + (comVazio ? '<option value="">— nenhuma —</option>' : '') + lista.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === linha.alvoId ? ' selected' : '') + '>' + escHtml(rotulo(x)) + '</option>';
    }).join('') + '</select>';
  }
  if (a === 'ja_lancado') return sel(linha.candidatos.ja, rotuloEntrada);
  if (a === 'baixa') return sel(linha.candidatos.baixa, rotuloEntrada);
  if (a === 'criar_entrada') {
    return '<input type="text" data-descricao="' + idx + '" value="' + escHtml(linha.descricao) + '" placeholder="Cliente">' +
      (linha.candidatos.pedido.length ? '<br>' + sel(linha.candidatos.pedido, rotuloPedido, true) : '');
  }
  if (a === 'vincular_saida') return sel(linha.candidatos.saida, rotuloSaida) + '<div class="hint">A data da saída passa a ser a do pagamento no banco.</div>';
  if (a === 'criar_saida') {
    return '<input type="text" data-descricao="' + idx + '" value="' + escHtml(linha.descricao) + '" placeholder="Descrição">' +
      '<input type="text" data-categoria="' + idx + '" value="' + escHtml(linha.categoria) + '" placeholder="Categoria" style="margin-top:4px;">';
  }
  return '';
}

function renderExtrato() {
  var tbody = document.getElementById('extrato-tbody');
  tbody.innerHTML = extratoLinhas.map(function (l, idx) {
    var m = l.mov;
    var corValor = m.valor > 0 ? '#0f7a3d' : '#a92323';
    if (l.jaImportado) {
      return '<tr style="opacity:.55;"><td>' + formatDataFin(m.data) + '</td><td>' + escHtml(m.memo) + '</td><td style="color:' + corValor + ';">' + fmtBRLExtrato(m.valor) + '</td>' +
        '<td colspan="2">Já importado antes</td></tr>';
    }
    var opcoes = opcoesAcao(l).map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === l.acao ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    return '<tr' + (l.acao ? '' : ' style="background:#fff7e0;"') + '><td>' + formatDataFin(m.data) + '</td><td>' + escHtml(m.memo) + '</td>' +
      '<td style="color:' + corValor + '; white-space:nowrap;">' + fmtBRLExtrato(m.valor) + '</td>' +
      '<td><select data-acao="' + idx + '">' + opcoes + '</select></td><td>' + celulaDetalhe(l, idx) + '</td></tr>';
  }).join('');

  tbody.querySelectorAll('[data-acao]').forEach(function (el) {
    el.addEventListener('change', function () {
      var l = extratoLinhas[el.dataset.acao];
      l.acao = el.value;
      var lista = l.acao === 'ja_lancado' ? l.candidatos.ja : l.acao === 'baixa' ? l.candidatos.baixa : l.acao === 'vincular_saida' ? l.candidatos.saida : [];
      l.alvoId = lista[0] ? lista[0].id : '';
      renderExtrato();
    });
  });
  tbody.querySelectorAll('[data-alvo]').forEach(function (el) { el.addEventListener('change', function () { extratoLinhas[el.dataset.alvo].alvoId = el.value; }); });
  tbody.querySelectorAll('[data-descricao]').forEach(function (el) { el.addEventListener('input', function () { extratoLinhas[el.dataset.descricao].descricao = el.value; }); });
  tbody.querySelectorAll('[data-categoria]').forEach(function (el) { el.addEventListener('input', function () { extratoLinhas[el.dataset.categoria].categoria = el.value; }); });

  atualizarResumoExtrato();
}

function atualizarResumoExtrato() {
  var novos = extratoLinhas.filter(function (l) { return !l.jaImportado; });
  var decididos = novos.filter(function (l) { return l.acao; });
  var creditos = novos.filter(function (l) { return l.mov.valor > 0; }).reduce(function (a, l) { return a + l.mov.valor; }, 0);
  var debitos = novos.filter(function (l) { return l.mov.valor < 0; }).reduce(function (a, l) { return a + l.mov.valor; }, 0);
  document.getElementById('extrato-resumo').innerHTML =
    '<strong>' + extratoLinhas.length + '</strong> lançamentos no arquivo • <strong>' + (extratoLinhas.length - novos.length) + '</strong> já importados antes • ' +
    '<strong>' + novos.length + '</strong> novos (créditos ' + fmtBRLExtrato(creditos) + ', débitos ' + fmtBRLExtrato(debitos) + ')' +
    (extratoContexto && extratoContexto.saldo != null ? ' • saldo informado no extrato: ' + fmtBRLExtrato(extratoContexto.saldo) : '') +
    '<br><span class="hint">' + decididos.length + ' de ' + novos.length + ' com ação escolhida. Linhas em amarelo precisam de decisão — se você não escolher, elas ficam de fora e voltam na próxima importação.</span>';
  var btn = document.getElementById('extrato-aplicar');
  btn.style.display = novos.length ? '' : 'none';
  btn.disabled = !decididos.length;
  btn.textContent = 'Aplicar ' + decididos.length + ' lançamento(s)';
}

/* ===================== LEITURA DO ARQUIVO + CONTEXTO DO BANCO ===================== */

async function carregarContextoExtrato(movs) {
  var fitids = movs.map(function (m) { return m.fitid; });
  var res = await Promise.all([
    supabaseClient.from('extrato_movimentos').select('fitid, acao, created_at').in('fitid', fitids),
    supabaseClient.from('financeiro_entradas').select('id, data, cliente_nome, produto, valor, pago, data_pagamento, pedido_id'),
    supabaseClient.from('financeiro_saidas').select('id, data, descricao, categoria, valor'),
    supabaseClient.from('pedidos').select('id, numero, valor_total_a_pagar, valor_total_a_pagar_vista, created_at, clientes(razao_social, nome_fantasia, eh_fornecedor)').eq('tipo', 'pedido'),
    supabaseClient.from('clientes').select('razao_social, nome_fantasia, cnpj_cpf'),
    supabaseClient.from('extrato_movimentos').select('entrada_id, saida_id').or('entrada_id.not.is.null,saida_id.not.is.null')
  ]);
  for (var i = 0; i < res.length; i++) if (res[i].error) throw res[i].error;

  var jaImportados = {};
  (res[0].data || []).forEach(function (m) { jaImportados[m.fitid] = m; });

  // Lançamentos do sistema que um extrato anterior já consumiu não voltam como candidatos.
  var consumidos = {};
  (res[5].data || []).forEach(function (m) { if (m.entrada_id) consumidos[m.entrada_id] = true; if (m.saida_id) consumidos[m.saida_id] = true; });

  var entradas = res[1].data || [];
  var pedidosComEntrada = {};
  entradas.forEach(function (e) { if (e.pedido_id) pedidosComEntrada[e.pedido_id] = true; });

  var dataPedido = {};
  (res[3].data || []).forEach(function (p) { dataPedido[p.id] = p.created_at.slice(0, 10); });

  var clientesPorDoc = {};
  (res[4].data || []).forEach(function (c) { var d = String(c.cnpj_cpf || '').replace(/\D/g, ''); if (d) clientesPorDoc[d] = c; });

  return {
    jaImportados: jaImportados,
    entradas: entradas.filter(function (e) { return !consumidos[e.id]; }),
    saidas: (res[2].data || []).filter(function (s) { return !consumidos[s.id]; }),
    pedidos: (res[3].data || []).filter(function (p) { return p.clientes && !p.clientes.eh_fornecedor; }).map(function (p) {
      return {
        id: p.id, numero: p.numero, data: p.created_at.slice(0, 10),
        cliente_nome: p.clientes.razao_social + (p.clientes.nome_fantasia ? ' (' + p.clientes.nome_fantasia + ')' : ''),
        valor_total_a_pagar: parseFloat(p.valor_total_a_pagar) || 0,
        valor_total_a_pagar_vista: parseFloat(p.valor_total_a_pagar_vista) || -1,
        temEntrada: !!pedidosComEntrada[p.id]
      };
    }),
    clientesPorDoc: clientesPorDoc,
    dataPedido: dataPedido
  };
}

async function lerArquivoExtrato(arquivo) {
  var erroEl = document.getElementById('extrato-error');
  erroEl.style.display = 'none';
  try {
    var texto = await arquivo.text();
    var lido = parseOfx(texto);
    if (!lido.movimentos.length) throw new Error('Não encontrei lançamentos nesse arquivo. Use o extrato em formato OFX.');
    var ctx = await carregarContextoExtrato(lido.movimentos);
    ctx.saldo = lido.saldo;
    extratoContexto = ctx;
    extratoLinhas = montarSugestoes(lido.movimentos, ctx);
    document.getElementById('extrato-tabela').style.display = '';
    renderExtrato();
  } catch (err) {
    erroEl.textContent = 'Não foi possível ler o extrato: ' + (err.message || err);
    erroEl.style.display = 'block';
  }
}

/* ===================== APLICAR ===================== */

async function registrarMovimento(linha, acao, extras) {
  var payload = Object.assign({ fitid: linha.mov.fitid, data: linha.mov.data, valor: linha.mov.valor, memo: linha.mov.memo, acao: acao, created_by: currentUserId }, extras || {});
  return supabaseClient.from('extrato_movimentos').insert(payload);
}

async function marcarPedidoPagoSeQuitado(pedidoId, data) {
  var { data: restantes } = await supabaseClient.from('financeiro_entradas').select('id').eq('pedido_id', pedidoId).eq('pago', false);
  if (restantes && restantes.length) return; // ainda tem parcela em aberto
  await supabaseClient.from('pedidos').update({ pago: true, data_pagamento: data }).eq('id', pedidoId);
}

async function aplicarLinha(l) {
  var m = l.mov;
  var r;
  if (l.acao === 'ignorar') {
    return registrarMovimento(l, 'ignorado');
  }
  if (l.acao === 'ja_lancado') {
    return registrarMovimento(l, 'ja_lancado', { entrada_id: l.alvoId || null });
  }
  if (l.acao === 'baixa') {
    if (!l.alvoId) return { error: { message: 'escolha a entrada para dar baixa' } };
    var entrada = extratoContexto.entradas.find(function (e) { return e.id === l.alvoId; });
    r = await supabaseClient.from('financeiro_entradas').update({ pago: true, data_pagamento: m.data }).eq('id', l.alvoId);
    if (r.error) return r;
    if (entrada && entrada.pedido_id) await marcarPedidoPagoSeQuitado(entrada.pedido_id, m.data);
    return registrarMovimento(l, 'baixa_entrada', { entrada_id: l.alvoId });
  }
  if (l.acao === 'criar_entrada') {
    var pedido = l.alvoId ? extratoContexto.pedidos.find(function (p) { return p.id === l.alvoId; }) : null;
    var nova = await supabaseClient.from('financeiro_entradas').insert({
      data: m.data, cliente_nome: (pedido ? pedido.cliente_nome : l.descricao) || null,
      produto: pedido ? 'Pedido nº ' + pedido.numero : 'Pagamento recebido (extrato)', valor: m.valor,
      observacao: 'Importado do extrato bancário.', pago: true, data_pagamento: m.data,
      pedido_id: pedido ? pedido.id : null, created_by: currentUserId
    }).select('id').single();
    if (nova.error) return nova;
    if (pedido) await supabaseClient.from('pedidos').update({ pago: true, data_pagamento: m.data }).eq('id', pedido.id);
    return registrarMovimento(l, 'entrada_criada', { entrada_id: nova.data.id });
  }
  if (l.acao === 'vincular_saida') {
    if (!l.alvoId) return { error: { message: 'escolha a saída para vincular' } };
    r = await supabaseClient.from('financeiro_saidas').update({ data: m.data }).eq('id', l.alvoId);
    if (r.error) return r;
    return registrarMovimento(l, 'saida_vinculada', { saida_id: l.alvoId });
  }
  if (l.acao === 'criar_saida') {
    var nova2 = await supabaseClient.from('financeiro_saidas').insert({
      data: m.data, descricao: (l.descricao || m.memo).trim(), categoria: (l.categoria || '').trim() || null, valor: Math.abs(m.valor),
      observacao: 'Importado do extrato bancário.', created_by: currentUserId
    }).select('id').single();
    if (nova2.error) return nova2;
    return registrarMovimento(l, 'saida_criada', { saida_id: nova2.data.id });
  }
  return { error: { message: 'ação desconhecida' } };
}

async function aplicarExtrato() {
  var btn = document.getElementById('extrato-aplicar');
  var erroEl = document.getElementById('extrato-error');
  erroEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Aplicando...';

  var feitos = 0, falhas = [];
  for (var i = 0; i < extratoLinhas.length; i++) {
    var l = extratoLinhas[i];
    if (l.jaImportado || !l.acao) continue;
    var r = await aplicarLinha(l);
    if (r && r.error) { falhas.push(formatDataFin(l.mov.data) + ' ' + fmtBRLExtrato(l.mov.valor) + ': ' + r.error.message); continue; }
    l.jaImportado = { fitid: l.mov.fitid, acao: l.acao };
    feitos++;
  }

  if (falhas.length) {
    erroEl.innerHTML = feitos + ' aplicado(s); ' + falhas.length + ' com erro:<br>' + falhas.map(escHtml).join('<br>');
    erroEl.style.display = 'block';
  }
  if (typeof showToast === 'function') showToast(feitos + ' lançamento(s) do extrato aplicado(s).', falhas.length ? 'warning' : 'ok');

  // recarrega o contexto (as entradas/saídas mudaram) e as listas da página
  try {
    var movs = extratoLinhas.map(function (l) { return l.mov; });
    var anteriores = extratoLinhas;
    var ctx = await carregarContextoExtrato(movs);
    ctx.saldo = extratoContexto.saldo;
    extratoContexto = ctx;
    extratoLinhas = montarSugestoes(movs, ctx);
    // mantém a escolha das linhas que ficaram pendentes de decisão
    extratoLinhas.forEach(function (l, idx) { if (!l.jaImportado && anteriores[idx] && !anteriores[idx].acao) { l.acao = ''; l.alvoId = ''; } });
  } catch (e) { /* a tela continua válida mesmo sem recarregar */ }
  renderExtrato();
  if (typeof loadEntradasRecentes === 'function') loadEntradasRecentes();
  if (typeof loadSaidasRecentes === 'function') loadSaidasRecentes();
  if (typeof gerarRelatorio === 'function') gerarRelatorio();
}

/* ===================== PDF (servidor) + EXTRATOS RECEBIDOS ===================== */

var importacaoEmRevisao = null;

function arquivoParaBase64(arquivo) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
    r.onerror = function () { reject(new Error('Não consegui ler o arquivo.')); };
    r.readAsDataURL(arquivo);
  });
}

function rotuloAcaoPlano(a) {
  return { ja_lancado: 'Já lançado', baixa: 'Dar baixa', vincular_saida: 'Vincular saída', criar_saida: 'Criar saída', criar_entrada: 'Criar entrada', revisar: 'Revisar' }[a] || a;
}

async function enviarPdfExtrato(arquivo) {
  var erroEl = document.getElementById('extrato-error');
  var saida = document.getElementById('extrato-pdf-resultado');
  erroEl.style.display = 'none';
  saida.innerHTML = 'Processando o PDF...';
  try {
    var simular = document.getElementById('extrato-simular').checked;
    var sess = (await supabaseClient.auth.getSession()).data.session;
    var resp = await fetch('/api/extrato-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: sess ? sess.access_token : null, pdfBase64: await arquivoParaBase64(arquivo), nomeArquivo: arquivo.name, dryRun: simular })
    });
    var dados = await resp.json().catch(function () { return {}; });
    if (!resp.ok) throw new Error(dados.error || 'Erro ao processar o PDF.');
    var r = dados.resumo;
    saida.innerHTML = '<div style="padding:12px 14px; background:' + (dados.dryRun ? '#fff7e0' : '#e8f7ee') + '; border-radius:10px;">' +
      '<strong>' + (dados.dryRun ? 'Simulação (nada foi gravado)' : 'Extrato processado') + '</strong><br>' +
      r.lancamentos_no_pdf + ' lançamentos no PDF • ' + r.ja_importados + ' já importados • ' + r.anteriores_ignorados + ' anteriores ignorados • <strong>' + r.novos + ' novos</strong><br>' +
      '<strong>' + r.aplicados_automaticamente + '</strong> ' + (dados.dryRun ? 'seriam aplicados automaticamente' : 'aplicados automaticamente') + ' • <strong>' + r.para_revisar + '</strong> para revisar' +
      (r.falhas && r.falhas.length ? '<br><span style="color:#a92323;">Falhas: ' + r.falhas.map(escHtml).join('; ') + '</span>' : '') +
      '<div class="table-scroll" style="margin-top:10px;"><table class="admin-table"><thead><tr><th>Data</th><th>Lançamento</th><th>Valor</th><th>Ação</th><th>Vai para</th></tr></thead><tbody>' +
      dados.plano.map(function (p) {
        return '<tr' + (p.automatico ? '' : ' style="background:#fff7e0;"') + '><td>' + formatDataFin(p.data) + '</td><td>' + escHtml(p.memo) + '</td><td>' + fmtBRLExtrato(p.valor) + '</td>' +
          '<td>' + rotuloAcaoPlano(p.acao) + (p.automatico ? ' <span class="badge badge-ok">automático</span>' : ' <span class="badge badge-warning">revisar</span>') + '</td><td>' + escHtml(p.alvo || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (dados.dryRun ? '<div class="hint" style="margin-top:8px;">Para valer, desmarque "Só simular" e envie o PDF de novo.</div>' : '') + '</div>';
    if (!dados.dryRun) { carregarImportacoes(); if (typeof loadEntradasRecentes === 'function') loadEntradasRecentes(); if (typeof loadSaidasRecentes === 'function') loadSaidasRecentes(); }
  } catch (err) {
    saida.innerHTML = '';
    erroEl.textContent = 'Não foi possível processar o extrato: ' + (err.message || err);
    erroEl.style.display = 'block';
  }
}

function resumoImportacao(i) {
  if (i.status === 'erro') return '<span class="badge badge-warning">Erro</span> ' + escHtml(i.erro || '');
  var r = i.resumo || {};
  return '<strong>' + (r.aplicados_automaticamente || 0) + '</strong> automáticos • <strong>' + (r.para_revisar || 0) + '</strong> para revisar' + (i.status === 'revisado' ? ' <span class="badge badge-ok">Revisado</span>' : '');
}

async function carregarImportacoes() {
  var tbody = document.getElementById('importacoes-tbody');
  if (!tbody) return;
  var { data, error } = await supabaseClient.from('extrato_importacoes').select('*').order('created_at', { ascending: false }).limit(10);
  if (error) { tbody.innerHTML = '<tr><td colspan="4">Erro: ' + escHtml(error.message) + '</td></tr>'; return; }
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="4">Nenhum extrato recebido ainda. Quando a Cora enviar o PDF para o nfe@, ele aparece aqui.</td></tr>'; return; }
  tbody.innerHTML = data.map(function (i) {
    var quando = new Date(i.created_at).toLocaleString('pt-BR');
    var periodo = i.periodo_de ? formatDataFin(i.periodo_de) + ' a ' + formatDataFin(i.periodo_ate) : '—';
    var botao = (i.status === 'revisar' && (i.movimentos_revisar || []).length) ? '<button type="button" data-revisar="' + i.id + '">Revisar (' + i.movimentos_revisar.length + ')</button>' : '';
    return '<tr><td data-label="Recebido em">' + quando + '</td><td data-label="Período">' + periodo + '</td><td data-label="Resultado">' + resumoImportacao(i) + '</td><td class="row-actions">' + botao + '</td></tr>';
  }).join('');
  tbody.querySelectorAll('[data-revisar]').forEach(function (b) {
    b.addEventListener('click', function () {
      var imp = data.find(function (x) { return x.id === b.dataset.revisar; });
      if (imp) abrirRevisaoImportacao(imp);
    });
  });
}

async function abrirRevisaoImportacao(imp) {
  var erroEl = document.getElementById('extrato-error');
  erroEl.style.display = 'none';
  try {
    var movs = imp.movimentos_revisar || [];
    var ctx = await carregarContextoExtrato(movs);
    ctx.saldo = imp.saldo;
    extratoContexto = ctx;
    importacaoEmRevisao = imp;
    extratoLinhas = montarSugestoes(movs, ctx);
    document.getElementById('extrato-tabela').style.display = '';
    renderExtrato();
    document.getElementById('extrato-tabela').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    erroEl.textContent = 'Não foi possível abrir a revisão: ' + (err.message || err);
    erroEl.style.display = 'block';
  }
}

async function fecharRevisaoSeConcluida() {
  if (!importacaoEmRevisao) return;
  var restantes = extratoLinhas.filter(function (l) { return !l.jaImportado; });
  if (restantes.length) return;
  await supabaseClient.from('extrato_importacoes').update({ status: 'revisado', revisado_em: new Date().toISOString() }).eq('id', importacaoEmRevisao.id);
  importacaoEmRevisao = null;
  carregarImportacoes();
}

(function () {
  var input = document.getElementById('extrato-arquivo');
  if (!input) return;
  input.addEventListener('change', function () {
    var f = input.files[0];
    if (!f) return;
    if (/\.pdf$/i.test(f.name)) enviarPdfExtrato(f); else lerArquivoExtrato(f);
  });
  document.getElementById('extrato-aplicar').addEventListener('click', async function () { await aplicarExtrato(); await fecharRevisaoSeConcluida(); });
  (window.ADMIN_AUTH_READY || Promise.resolve()).then(carregarImportacoes);
})();
