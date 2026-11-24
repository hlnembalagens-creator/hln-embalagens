// Núcleo do Extrato: leitura (OFX e PDF da Cora) e sugestões de conciliação. Funções puras, usadas
// tanto pela tela do Financeiro (extrato.js) quanto pelo servidor (api/_lib/extrato-server.js).
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
  if (/TIM S A|VIVO|CLARO|M4 PRODUTOS/.test(m)) return 'Telefone';
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
        linha.acao = 'ja_lancado'; linha.motivo = 'nome'; linha.alvoId = jaMelhor.id; usados[jaMelhor.id] = true;
      } else if (baixaNome) {
        linha.acao = 'baixa'; linha.motivo = 'nome'; linha.alvoId = baixaMelhor.id; usados[baixaMelhor.id] = true;
      } else if (jaData) {
        linha.acao = 'ja_lancado'; linha.motivo = 'data'; linha.alvoId = jaMelhor.id; usados[jaMelhor.id] = true;
      } else if (baixaData) {
        linha.acao = 'baixa'; linha.motivo = 'data'; linha.alvoId = baixaMelhor.id; usados[baixaMelhor.id] = true;
      } else if (pedidoMelhor && parecido(pedidoMelhor, 'cliente_nome') > 0) {
        linha.acao = 'criar_entrada'; linha.motivo = 'pedido'; linha.alvoId = pedidoMelhor.id; usados[pedidoMelhor.id] = true;
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

/* ===================== LEITURA DO PDF (Cora) ===================== */

var TIPOS_CORA = [
  'Pagamento recebido', 'Transf Pix recebida', 'Transf Pix enviada', 'Boleto pago', 'Pgto QR Code Pix',
  'Pagamento da fatura', 'Reserva de Limite para C', 'Resgate de Reserva de Li', 'Tarifa', 'Estorno'
];

function brParaNumero(txt) { return Math.round(parseFloat(String(txt).replace(/\./g, '').replace(',', '.')) * 100) / 100; }

function hashSimples(texto) { // FNV-1a 32 bits, em hexadecimal — só pra ter um identificador estável
  var h = 0x811c9dc5;
  for (var i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// Texto extraído do PDF do extrato da Cora -> { movimentos, saldo, totais, periodo }.
// Cada lançamento vira { fitid, data, valor, memo:'Tipo - Nome - Documento' }, o mesmo formato do OFX.
// O fitid é calculado (hash de data|valor|tipo|nome|doc + a ordem entre iguais do mesmo dia, contada do
// lançamento mais antigo), então o mesmo lançamento recebe o mesmo id em extratos que se sobrepõem.
function parsePdfExtrato(texto) {
  var linhas = String(texto || '').split(/\r?\n/).map(function (l) { return l.trim(); });
  var movs = [];
  var dataAtual = null;
  linhas.forEach(function (l) {
    var d = l.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*Saldo do dia/);
    if (d) { dataAtual = d[3] + '-' + d[2] + '-' + d[1]; return; }
    var m = l.match(/^([+-])\s*R\$\s*([\d.]+,\d{2})\s*(.+)$/);
    if (!m || !dataAtual) return;
    var resto = m[3].replace(/…/g, '...').trim();
    var tipo = '';
    for (var i = 0; i < TIPOS_CORA.length; i++) {
      if (resto.toLowerCase().indexOf(TIPOS_CORA[i].toLowerCase()) === 0) {
        var fim = TIPOS_CORA[i].length;
        // tipos truncados na origem ("Reserva de Limite para C...") levam as reticências junto
        var pontos = resto.slice(fim).match(/^[^\s]*\.\.\./);
        tipo = resto.slice(0, fim + (pontos ? pontos[0].length : 0));
        break;
      }
    }
    var doc = '';
    var dm = resto.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s*$/);
    var corpo = resto;
    if (dm) { doc = dm[1]; corpo = resto.slice(0, dm.index).trim(); }
    var nome = tipo ? corpo.slice(tipo.length).trim() : corpo;
    if (!tipo) { var pedacos = corpo.split(/\s+/); tipo = pedacos.slice(0, 2).join(' '); nome = pedacos.slice(2).join(' '); }
    var valor = brParaNumero(m[2]) * (m[1] === '-' ? -1 : 1);
    movs.push({ data: dataAtual, valor: Math.round(valor * 100) / 100, tipo: tipo, nome: nome.replace(/\.\.\.$/, '').trim(), doc: doc, ordem: movs.length });
  });

  // ordem entre lançamentos idênticos do mesmo dia, contada de baixo pra cima (mais antigo primeiro)
  var contagem = {};
  for (var k = movs.length - 1; k >= 0; k--) {
    var mv = movs[k];
    var chave = [mv.data, mv.valor, mv.tipo, mv.nome, mv.doc].join('|');
    contagem[chave] = (contagem[chave] || 0) + 1;
    mv.fitid = 'pdf-' + hashSimples(chave) + '-' + contagem[chave];
    mv.memo = mv.tipo + ' - ' + mv.nome + (mv.doc ? ' - ' + mv.doc : '');
  }
  movs.forEach(function (x) { delete x.ordem; });
  movs.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });

  function campo(re) { var x = String(texto).match(re); return x ? brParaNumero(x[1]) : null; }
  var per = String(texto).match(/(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/);
  return {
    movimentos: movs,
    saldo: campo(/Saldo final dispon[ií]vel\s*R\$\s*([\d.]+,\d{2})/),
    totais: { entradas: campo(/Total de entradas\s*\+\s*R\$\s*([\d.]+,\d{2})/), saidas: campo(/Total de sa[ií]das\s*-\s*R\$\s*([\d.]+,\d{2})/) },
    periodo: per ? { de: per[3] + '-' + per[2] + '-' + per[1], ate: per[6] + '-' + per[5] + '-' + per[4] } : null
  };
}

function ehExtratoCora(texto) {
  return /Extrato do per[ií]odo/i.test(texto) && /Cora SCFI/i.test(texto) && /Saldo do dia/i.test(texto);
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseOfx: parseOfx, parsePdfExtrato: parsePdfExtrato, ehExtratoCora: ehExtratoCora, montarSugestoes: montarSugestoes,
    separarMemo: separarMemo, tokensNome: tokensNome, categoriaDaSaida: categoriaDaSaida, diasEntre: diasEntre, difDias: difDias
  };
}
