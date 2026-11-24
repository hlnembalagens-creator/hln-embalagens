// Conciliação automática do extrato em PDF da Cora (roda no servidor, com a service_role key).
//  - Lê o PDF (texto), confere os totais do próprio extrato e separa só os lançamentos novos.
//  - O que casa com segurança (valor exato + nome/CNPJ do cliente, ou saída de fornecedor conhecido) é aplicado
//    na hora: baixa de entrada, vínculo/criação de saída, registro de "já lançado".
//  - O resto (crédito sem pedido, valor diferente, outro CNPJ, cartão, "Outros") vai para revisão na tela do
//    Financeiro. Cada lançamento fica registrado em extrato_movimentos, então nada é aplicado duas vezes.

var core = require('../../admin/js/extrato-core.js');

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var CATEGORIAS_AUTOMATICAS = ['Fornecedor', 'Imposto', 'Contabilidade', 'Telefone'];
var JANELA_CORTE_DIAS = 10; // só processa lançamentos a partir de (último já importado - 10 dias)
// Antes desta data a conciliação foi feita à mão (sem registro em extrato_movimentos): nunca reprocessar.
var DATA_INICIO_AUTOMACAO = process.env.EXTRATO_INICIO || '2026-11-01';

function cabecalhos(extra) {
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {});
}

async function rest(caminho, opcoes) {
  opcoes = opcoes || {};
  var resp = await fetch(SUPABASE_URL + '/rest/v1/' + caminho, {
    method: opcoes.method || 'GET',
    headers: cabecalhos(opcoes.prefer ? { Prefer: opcoes.prefer } : null),
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });
  var texto = await resp.text();
  if (!resp.ok) throw new Error('Banco (' + caminho.split('?')[0] + '): ' + texto.slice(0, 300));
  return texto ? JSON.parse(texto) : null;
}

async function restTudo(caminho) {
  var todas = [];
  for (var inicio = 0; ; inicio += 1000) {
    var lote = await rest(caminho + (caminho.indexOf('?') === -1 ? '?' : '&') + 'limit=1000&offset=' + inicio);
    todas = todas.concat(lote || []);
    if (!lote || lote.length < 1000) break;
  }
  return todas;
}

function somenteDigitos(t) { return String(t || '').replace(/\D/g, ''); }

async function carregarContexto() {
  var r = await Promise.all([
    restTudo('extrato_movimentos?select=fitid,data,valor,memo,entrada_id,saida_id&order=data.desc'),
    restTudo('financeiro_entradas?select=id,data,cliente_nome,produto,valor,pago,data_pagamento,pedido_id'),
    restTudo('financeiro_saidas?select=id,data,descricao,categoria,valor'),
    restTudo('pedidos?select=id,numero,valor_total_a_pagar,valor_total_a_pagar_vista,created_at,clientes(razao_social,nome_fantasia,eh_fornecedor)&tipo=eq.pedido'),
    restTudo('clientes?select=razao_social,nome_fantasia,cnpj_cpf')
  ]);
  var existentes = r[0];
  var consumidos = {};
  existentes.forEach(function (m) { if (m.entrada_id) consumidos[m.entrada_id] = true; if (m.saida_id) consumidos[m.saida_id] = true; });

  var entradas = r[1];
  var pedidosComEntrada = {};
  entradas.forEach(function (e) { if (e.pedido_id) pedidosComEntrada[e.pedido_id] = true; });
  var dataPedido = {};
  r[3].forEach(function (p) { dataPedido[p.id] = String(p.created_at).slice(0, 10); });
  var clientesPorDoc = {};
  r[4].forEach(function (c) { var d = somenteDigitos(c.cnpj_cpf); if (d) clientesPorDoc[d] = c; });

  return {
    existentes: existentes,
    jaImportados: {},
    entradas: entradas.filter(function (e) { return !consumidos[e.id]; }),
    saidas: r[2].filter(function (s) { return !consumidos[s.id]; }),
    pedidos: r[3].filter(function (p) { return p.clientes && !p.clientes.eh_fornecedor; }).map(function (p) {
      return {
        id: p.id, numero: p.numero, data: String(p.created_at).slice(0, 10),
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

// O mesmo lançamento pode já ter entrado por OFX (id diferente do PDF): compara data + valor + documento/nome.
function filtrarNovos(movs, existentes) {
  var usados = {};
  var maxData = existentes.reduce(function (a, m) { return m.data > a ? m.data : a; }, '');
  var corte = DATA_INICIO_AUTOMACAO;
  if (maxData) { var d = new Date(maxData + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - JANELA_CORTE_DIAS); var c2 = d.toISOString().slice(0, 10); if (c2 > corte) corte = c2; }

  var porFitid = {};
  existentes.forEach(function (m) { porFitid[m.fitid] = true; });

  var novos = [], jaTinha = 0, anteriores = 0;
  movs.forEach(function (mov) {
    if (porFitid[mov.fitid]) { jaTinha++; return; }
    var partes = core.separarMemo(mov.memo);
    var doc = somenteDigitos(partes.doc);
    var tokens = core.tokensNome(partes.nome);
    var achou = null;
    for (var i = 0; i < existentes.length && !achou; i++) {
      var ex = existentes[i];
      if (usados[ex.fitid] || ex.data !== mov.data || Math.abs(Math.abs(parseFloat(ex.valor)) - Math.abs(mov.valor)) > 0.005) continue;
      if ((parseFloat(ex.valor) > 0) !== (mov.valor > 0)) continue;
      var pe = core.separarMemo(ex.memo);
      var docEx = somenteDigitos(pe.doc);
      var mesmoDoc = doc && docEx && doc === docEx;
      var nomeParecido = core.tokensNome(pe.nome).filter(function (t) { return tokens.indexOf(t) !== -1; }).length > 0;
      if (mesmoDoc || (!(doc && docEx) && nomeParecido)) achou = ex;
    }
    if (achou) { usados[achou.fitid] = true; jaTinha++; return; }
    if (corte && mov.data < corte) { anteriores++; return; }
    novos.push(mov);
  });
  return { novos: novos, jaTinha: jaTinha, anteriores: anteriores };
}

function decidirAutomatico(l) {
  if (l.acao === 'ja_lancado') return true;
  if (l.acao === 'baixa') return l.motivo === 'nome';
  if (l.acao === 'vincular_saida') return l.candidatos.saida.length === 1 && CATEGORIAS_AUTOMATICAS.indexOf(l.categoria) !== -1;
  if (l.acao === 'criar_saida') return CATEGORIAS_AUTOMATICAS.indexOf(l.categoria) !== -1;
  return false;
}

async function registrarMovimento(mov, acao, extras) {
  await rest('extrato_movimentos', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: Object.assign({ fitid: mov.fitid, data: mov.data, valor: mov.valor, memo: mov.memo, acao: acao }, extras || {})
  });
}

async function aplicarLinha(l, ctx) {
  var m = l.mov;
  if (l.acao === 'ja_lancado') return registrarMovimento(m, 'ja_lancado', { entrada_id: l.alvoId || null });
  if (l.acao === 'baixa') {
    var entrada = ctx.entradas.find(function (e) { return e.id === l.alvoId; });
    await rest('financeiro_entradas?id=eq.' + l.alvoId, { method: 'PATCH', prefer: 'return=minimal', body: { pago: true, data_pagamento: m.data } });
    if (entrada && entrada.pedido_id) {
      var abertas = await rest('financeiro_entradas?select=id&pedido_id=eq.' + entrada.pedido_id + '&pago=eq.false');
      if (!abertas.length) await rest('pedidos?id=eq.' + entrada.pedido_id, { method: 'PATCH', prefer: 'return=minimal', body: { pago: true, data_pagamento: m.data } });
    }
    return registrarMovimento(m, 'baixa_entrada', { entrada_id: l.alvoId });
  }
  if (l.acao === 'vincular_saida') {
    await rest('financeiro_saidas?id=eq.' + l.alvoId, { method: 'PATCH', prefer: 'return=minimal', body: { data: m.data } });
    return registrarMovimento(m, 'saida_vinculada', { saida_id: l.alvoId });
  }
  if (l.acao === 'criar_saida') {
    var nova = await rest('financeiro_saidas', {
      method: 'POST', prefer: 'return=representation',
      body: { data: m.data, descricao: m.memo, categoria: l.categoria || null, valor: Math.abs(m.valor), observacao: 'Importado do extrato bancário (PDF, automático).' }
    });
    return registrarMovimento(m, 'saida_criada', { saida_id: nova[0].id });
  }
  throw new Error('ação não automática: ' + l.acao);
}

function descreverLinha(l, ctx) {
  var alvo = '';
  if (l.alvoId) {
    var e = ctx.entradas.find(function (x) { return x.id === l.alvoId; });
    var s = ctx.saidas.find(function (x) { return x.id === l.alvoId; });
    alvo = e ? (e.produto || '') + ' — ' + (e.cliente_nome || '') : (s ? s.descricao : '');
  }
  return { data: l.mov.data, valor: l.mov.valor, memo: l.mov.memo, acao: l.acao || 'revisar', automatico: !!l.automatico, alvo: alvo };
}

// opcoes: { dryRun }. Devolve { ok, gravou, resumo, plano } ou { ok:false, error, gravou }.
async function processarExtratoPdf(texto, nomeArquivo, opcoes) {
  opcoes = opcoes || {};
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, gravou: false, error: 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor.' };
  if (!core.ehExtratoCora(texto)) return { ok: false, gravou: false, error: 'O PDF não parece ser um extrato da Cora.' };

  var lido = core.parsePdfExtrato(texto);
  var ent = lido.movimentos.filter(function (m) { return m.valor > 0; }).reduce(function (a, m) { return a + m.valor; }, 0);
  var sai = lido.movimentos.filter(function (m) { return m.valor < 0; }).reduce(function (a, m) { return a - m.valor; }, 0);
  var confere = lido.totais.entradas != null && lido.totais.saidas != null &&
    Math.abs(ent - lido.totais.entradas) < 0.015 && Math.abs(sai - lido.totais.saidas) < 0.015;
  var base = { nome_arquivo: nomeArquivo, periodo_de: lido.periodo && lido.periodo.de, periodo_ate: lido.periodo && lido.periodo.ate, saldo: lido.saldo };

  if (!lido.movimentos.length || !confere) {
    var erro = !lido.movimentos.length ? 'Nenhum lançamento encontrado no PDF.'
      : 'Os lançamentos lidos não fecham com os totais do extrato (lido: entradas ' + ent.toFixed(2) + ' / saídas ' + sai.toFixed(2) +
        '; extrato: ' + lido.totais.entradas + ' / ' + lido.totais.saidas + '). Nada foi aplicado.';
    if (!opcoes.dryRun) await rest('extrato_importacoes', { method: 'POST', prefer: 'return=minimal', body: Object.assign({ status: 'erro', erro: erro }, base) });
    return { ok: false, gravou: !opcoes.dryRun, error: erro };
  }

  var ctx = await carregarContexto();
  var filtro = filtrarNovos(lido.movimentos, ctx.existentes);
  var linhas = core.montarSugestoes(filtro.novos, ctx);
  linhas.forEach(function (l) { l.automatico = decidirAutomatico(l); });

  var plano = linhas.map(function (l) { return descreverLinha(l, ctx); });
  var aplicadas = 0, falhas = [];
  if (!opcoes.dryRun) {
    for (var i = 0; i < linhas.length; i++) {
      if (!linhas[i].automatico) continue;
      try { await aplicarLinha(linhas[i], ctx); aplicadas++; }
      catch (e) { linhas[i].automatico = false; plano[i].automatico = false; falhas.push(linhas[i].mov.data + ' ' + linhas[i].mov.valor + ': ' + (e.message || e)); }
    }
  }
  var revisar = linhas.filter(function (l) { return !l.automatico; }).map(function (l) { return l.mov; });
  var resumo = {
    lancamentos_no_pdf: lido.movimentos.length, ja_importados: filtro.jaTinha, anteriores_ignorados: filtro.anteriores,
    novos: filtro.novos.length, aplicados_automaticamente: opcoes.dryRun ? linhas.filter(function (l) { return l.automatico; }).length : aplicadas,
    para_revisar: revisar.length, falhas: falhas
  };

  if (!opcoes.dryRun) {
    await rest('extrato_importacoes', {
      method: 'POST', prefer: 'return=minimal',
      body: Object.assign({ status: revisar.length ? 'revisar' : 'aplicado', resumo: resumo, movimentos_revisar: revisar }, base)
    });
  }
  return { ok: true, gravou: !opcoes.dryRun, resumo: resumo, plano: plano };
}

async function textoDoPdf(buffer) {
  var pdfParse = require('pdf-parse/lib/pdf-parse.js');
  var r = await pdfParse(buffer);
  return r.text || '';
}

module.exports = { processarExtratoPdf: processarExtratoPdf, textoDoPdf: textoDoPdf, ehExtratoCora: core.ehExtratoCora, decidirAutomatico: decidirAutomatico, filtrarNovos: filtrarNovos };
