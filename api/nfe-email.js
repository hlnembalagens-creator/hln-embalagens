// Função serverless (Vercel Cron, 1x por dia) — lê a caixa nfe@ por IMAP, pega os PDFs
// de NF/romaneio dos e-mails novos e grava em estoque_importacoes_pendentes (mesma fila
// do import da pasta local). O admin confirma na tela de Estoque. E-mails processados
// vão para a pasta "Processados" da própria caixa, então nada é lido duas vezes.
//
// Variáveis de ambiente (Vercel): NFE_IMAP_HOST, NFE_IMAP_USER, NFE_IMAP_PASS,
// NFE_IMAP_PORT (opcional, 993), CRON_SECRET, além das que a leitura por IA já usa.

var ImapFlow = require('imapflow').ImapFlow;
var simpleParser = require('mailparser').simpleParser;
var salvarPendente = require('./_lib/salvar-pendente').salvarPendente;

var PASTA_PROCESSADOS = 'Processados';
var MAX_EMAILS_POR_EXECUCAO = 15;
var MAX_PDF_BYTES = 8 * 1024 * 1024;

function ehPdf(anexo) {
  var nome = (anexo.filename || '').toLowerCase();
  return anexo.contentType === 'application/pdf' || nome.slice(-4) === '.pdf';
}

module.exports = async function handler(req, res) {
  var segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.authorization !== 'Bearer ' + segredo) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }

  if (!process.env.NFE_IMAP_HOST || !process.env.NFE_IMAP_USER || !process.env.NFE_IMAP_PASS) {
    res.status(500).json({ error: 'Caixa nfe@ não configurada (NFE_IMAP_HOST/USER/PASS ausentes).' });
    return;
  }

  var client = new ImapFlow({
    host: process.env.NFE_IMAP_HOST,
    port: Number(process.env.NFE_IMAP_PORT) || 993,
    secure: true,
    auth: { user: process.env.NFE_IMAP_USER, pass: process.env.NFE_IMAP_PASS },
    logger: false
  });

  var resumo = { emails: 0, pdfs: 0, gravados: 0, erros: [] };

  try {
    await client.connect();

    await client.mailboxCreate(PASTA_PROCESSADOS).catch(function () { /* já existe */ });
    var lock = await client.getMailboxLock('INBOX');
    try {
      var uids = await client.search({ all: true }, { uid: true });
      uids = (uids || []).slice(0, MAX_EMAILS_POR_EXECUCAO);

      for (var i = 0; i < uids.length; i++) {
        var uid = uids[i];
        var msg = await client.fetchOne(uid, { source: true }, { uid: true });
        var email = await simpleParser(msg.source);
        var pdfs = (email.attachments || []).filter(ehPdf);
        var tudoCerto = true;

        resumo.emails++;
        for (var j = 0; j < pdfs.length; j++) {
          var anexo = pdfs[j];
          if (anexo.size > MAX_PDF_BYTES) {
            resumo.erros.push((anexo.filename || 'anexo') + ': maior que 8 MB, ignorado.');
            continue;
          }
          resumo.pdfs++;
          var r = await salvarPendente(anexo.filename || ('nfe-' + uid + '.pdf'), anexo.content.toString('base64'));
          if (r.gravou) resumo.gravados++;
          // Erro de leitura da IA já fica registrado (status "erro") e aparece para o admin;
          // só não marcamos como processado se NÃO conseguimos gravar nada no banco.
          if (!r.gravou) { tudoCerto = false; resumo.erros.push((anexo.filename || 'anexo') + ': ' + r.error); }
        }

        if (tudoCerto) await client.messageMove(uid, PASTA_PROCESSADOS, { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { await client.close(); } catch (x) { /* ignora */ }
    res.status(502).json({ error: 'Falha ao ler a caixa nfe@: ' + (e && e.message ? e.message : e), resumo: resumo });
    return;
  }

  res.status(200).json({ ok: true, resumo: resumo });
};
