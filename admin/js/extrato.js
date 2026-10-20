// Importação de extrato bancário (OFX) no Financeiro, com revisão antes de gravar.
//  - Crédito  -> dá baixa numa entrada pendente, confirma que já estava baixada, ou cria uma entrada paga.
//  - Débito   -> vincula a uma saída já lançada (acertando a data) ou cria uma saída nova.
// Nada é gravado sem o "Aplicar". O FITID de cada lançamento fica guardado (extrato_movimentos), então
// reimportar o mesmo extrato (ou um que se sobreponha) nunca duplica.

var TOLERANCIA_VALOR = 0.05;       // centavos de diferença aceitos entre extrato e lançamento
var TOLERANCIA_PEDIDO_COM_NOME = 2.00; // pedido sem lançamento: aceita pequena diferença (juros/arredondamento) se o nome bate
var JANELA_JA_LANCADO_DIAS = 7;    // entrada já paga com mesmo valor perto da data do crédito
var JANELA_VINCULO_SAIDA_DIAS = 20; // saída prevista (vencimento) x pagamento real

var extratoLinhas = [];            // uma por lançamento do arquivo
var extratoContexto = null;        // dados do banco usados nas sugestões

/* ===================== LEITURA DO OFX ===================== */

function parseOfx(texto) {
  var movs = [];
  texto.split(/<STMTTRN>/i).slice(1).forEach(function (bloco) {
    bloco = bloco.split(/<\/STMTTRN>/i)[0];
    function tag(nome) {
      var m = bloco.match(new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i'));
      return m ? m[1].trim() : '';
    }
    var d = tag('DTPOSTED');
    var valor = parseFloat(tag('TRNAMT').replace(',', '.'));
    if (!tag('FITID') || d.length < 8 || isNaN(valor)) return;
    movs.push({
      fitid: tag('FITID'),
      data: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), // sem conversão de fuso: vale o dia do banco
      valor: Math.round(valor * 100) / 100,
      memo: tag('MEMO').replace(/&amp;/gi, '&')
    });
  });
  movs.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });

  var saldo = texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i);
  return { movimentos: movs, saldo: saldo ? parseFloat(saldo[1]) : null };
}

/* ===================== SUGESTÕES ===================== */

var STOPWORDS_NOME = ['LTDA', 'EPP', 'EIRELI', 'EIRELLI', 'DAS', 'DOS', 'COMERCIO', 'COM', 'PRODUTOS', 'DE', 'DA', 'DO', 'EM', 'SERVICOS', 'ALIMENTICIOS', 'ALIMENTOS'];

function tokensNome(texto) {
  var limpo = String(texto || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ');
  return limpo.split(/\s+/).filter(function (t) {
    return t.length >= 3 && !/^\d+$/.test(t) && STOPWORDS_NOME.indexOf(t) === -1;
  });
}

// "Pagamento recebido - Ra-chu Restaurante & Churrascaria - 18.713.582/0001-19" -> nome + documento (só dígitos)
function separarMemo(memo) {
  var m = String(memo || '').match(/^(.*?)\s+-\s+(.*?)\s*(?:-\s*([\d./-]+))?\s*$/);
  if (!m) return { tipo: memo, nome: '', doc: '' };
  return { tipo: m[1], nome: m[2], doc: (m[3] || '').replace(/\D/g, '') };
}

function pontuacaoNome(tokensA, tokensB) {
  return tokensA.filter(function (t) { return tokensB.indexOf(t) !== -1; }).length;
}

function difDias(a, b) { // a - b em dias, com sinal
  return Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
}

function diasEntre(a, b) {
  return Math.abs(Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000));
}

function categoriaDaSaida(memo) {
  var m = String(memo || '').toUpperCase();
  if (/CAPITAL|ALTISVAC|THERMO|PAGCERTO/.test(m)) return 'Fornecedor';
  if (/DAS - SIMPLES|MINISTERIO DA FAZENDA|SIMPLES NACIONAL/.test(m)) return 'Imposto';
  if (/CONTABIL/.test(m)) return 'Contabilidade';
  if (/TIM S A|VIVO|CLARO/.test(m)) return 'Telefone';
  if (/RESERVA DE LIMITE|CART[ÃA]O DE CR/.test(m)) return 'Cartão de crédito';
  if (/GRAFICA/.test(m)) return 'Gráfica';
  return 'Outros';
}

// ctx: { entradas, saidas, pedidos, clientesPorDoc, jaImportados:{fitid:mov} }
function montarSugestoes(movs, ctx) {
  var usados = {}; // um lançamento do banco consome no máximo um lançamento do sistema
  var linhas = [];

  movs.forEach(function (mov) {
    var linha = { mov: mov, jaImportado: ctx.jaImportados[mov.fitid] || null, acao: '', alvoId: '', categoria: '', descricao: '', candidatos: {} };
    var partes = separarMemo(mov.memo);
    linha.partes = partes;

    if (linha.jaImportado) { linhas.push(linha); return; }

    var valor = Math.abs(mov.valor);
    var cliente = ctx.clientesPorDoc[partes.doc] || null;
    var tokensPagador = tokensNome(partes.nome).concat(cliente ? tokensNome(cliente.razao_social + ' ' + (cliente.nome_fantasia || '')) : []);

    function parecido(lanc, campoNome) { return pontuacaoNome(tokensPagador, tokensNome(lanc[campoNome])); }
    function porValor(lista) { return lista.filter(function (x) { return Math.abs(parseFloat(x.valor) - valor) <= TOLERANCIA_VALOR; }); }
    function livres(lista) { return lista.filter(function (x) { return !usados[x.id]; }); }

    if (mov.valor > 0) {
      var pagas = livres(porValor(ctx.entradas.filter(function (e) { return e.pago; }))).filter(function (e) {
        return diasEntre(e.data_pagamento || e.data, mov.data) <= JANELA_JA_LANCADO_DIAS;
      });
      // Um pagamento não pode ser anterior ao pedido que ele quita (2 dias de folga).
      function depoisDoPedido(dataPedido) { return !dataPedido || difDias(mov.data, dataPedido) >= -2; }
      var pendentes = livres(porValor(ctx.entradas.filter(function (e) { return !e.pago; }))).filter(function (e) {
        return !e.pedido_id || depoisDoPedido(ctx.dataPedido[e.pedido_id]);
      });
      var pedidosSemEntrada = livres(ctx.pedidos.filter(function (p) {
        if (p.temEntrada || !depoisDoPedido(p.data)) return false;
        var dif = Math.min(Math.abs(p.valor_total_a_pagar - valor), Math.abs(p.valor_total_a_pagar_vista - valor));
        return dif <= TOLERANCIA_VALOR || (dif <= TOLERANCIA_PEDIDO_COM_NOME && parecido(p, 'cliente_nome') > 0);
      }));

      function ordenar(lista, campoNome, campoData) {
        return lista.slice().sort(function (a, b) {
          return (parecido(b, campoNome) - parecido(a, campoNome)) || (diasEntre(a[campoData] || a.data, mov.data) - diasEntre(b[campoData] || b.data, mov.data));
        });
      }
      linha.candidatos.ja = ordenar(pagas, 'cliente_nome', 'data_pagamento');
      linha.candidatos.baixa = ordenar(pendentes, 'cliente_nome', 'data');
      linha.candidatos.pedido = ordenar(pedidosSemEntrada, 'cliente_nome', 'data');

      var jaMelhor = linha.candidatos.ja[0];
      var baixaMelhor = linha.candidatos.baixa[0];
      var pedidoMelhor = linha.candidatos.pedido[0];
      // Nome do cliente pesa mais que a data; só sem nome parecido vale a coincidência de data.
      var jaNome = jaMelhor && parecido(jaMelhor, 'cliente_nome') > 0;
      var baixaNome = baixaMelhor && parecido(baixaMelhor, 'cliente_nome') > 0;
      var jaData = jaMelhor && diasEntre(jaMelhor.data_pagamento || jaMelhor.data, mov.data) <= 3;
      var baixaData = baixaMelhor && linha.candidatos.baixa.length === 1 && diasEntre(baixaMelhor.data, mov.data) <= 10;
      if (jaNome) {
        linha.acao = 'ja_lancado'; linha.alvoId = jaMelhor.id; usados[jaMelhor.id] = true;
      } else if (baixaNome) {
        linha.acao = 'baixa'; linha.alvoId = baixaMelhor.id; usados[baixaMelhor.id] = true;
      } else if (jaData) {
        linha.acao = 'ja_lancado'; linha.alvoId = jaMelhor.id; usados[jaMelhor.id] = true;
      } else if (baixaData) {
        linha.acao = 'baixa'; linha.alvoId = baixaMelhor.id; usados[baixaMelhor.id] = true;
      } else if (pedidoMelhor && parecido(pedidoMelhor, 'cliente_nome') > 0) {
        linha.acao = 'criar_entrada'; linha.alvoId = pedidoMelhor.id; usados[pedidoMelhor.id] = true;
      }
      linha.descricao = cliente ? cliente.razao_social : partes.nome;
    } else {
      var saidas = livres(porValor(ctx.saidas)).filter(function (s) { return diasEntre(s.data, mov.data) <= JANELA_VINCULO_SAIDA_DIAS; });
      saidas.sort(function (a, b) {
        return (Math.abs(parseFloat(a.valor) - valor) - Math.abs(parseFloat(b.valor) - valor)) || (diasEntre(a.data, mov.data) - diasEntre(b.data, mov.data));
      });
      linha.candidatos.saida = saidas;
      linha.categoria = categoriaDaSaida(mov.memo);
      linha.descricao = mov.memo;
      if (saidas[0]) { linha.acao = 'vincular_saida'; linha.alvoId = saidas[0].id; usados[saidas[0].id] = true; }
      else { linha.acao = 'criar_saida'; }
    }
    linhas.push(linha);
  });

  return linhas;
}

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

(function () {
  var input = document.getElementById('extrato-arquivo');
  if (!input) return;
  input.addEventListener('change', function () { if (input.files[0]) lerArquivoExtrato(input.files[0]); });
  document.getElementById('extrato-aplicar').addEventListener('click', aplicarExtrato);
})();
