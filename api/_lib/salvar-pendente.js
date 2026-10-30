// Lê um PDF de NF/romaneio com a IA e grava o resultado como "pendente" em
// estoque_importacoes_pendentes (quem confirma é o admin, na tela de Estoque).
// Usado pelo import da pasta local (importar-nfe-pendente) e pela leitura do e-mail nfe@.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';

var extrairDadosDocumento = require('./ler-documento').extrairDadosDocumento;

// Devolve { ok: true } | { ok: false, error, gravou }.
// gravou = true quando o resultado (inclusive "erro de leitura") ficou registrado no banco.
async function salvarPendente(nomeArquivo, pdfBase64) {
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { ok: false, gravou: false, error: 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor.' };

  var resultado = await extrairDadosDocumento(pdfBase64);

  var linha = resultado.ok
    ? { nome_arquivo: nomeArquivo, dados: resultado.dados, status: 'pendente' }
    : { nome_arquivo: nomeArquivo, dados: {}, status: 'erro', erro: resultado.error };

  var insertResp = await fetch(SUPABASE_URL + '/rest/v1/estoque_importacoes_pendentes', {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(linha)
  });

  if (!insertResp.ok) {
    var erroTexto = await insertResp.text().catch(function () { return ''; });
    return { ok: false, gravou: false, error: 'Falha ao gravar pendente no banco: ' + erroTexto };
  }

  if (!resultado.ok) return { ok: false, gravou: true, error: resultado.error };
  return { ok: true, gravou: true };
}

module.exports = { salvarPendente: salvarPendente };
