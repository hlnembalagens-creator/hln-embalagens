// Função serverless (Vercel) — lê uma NF/romaneio em PDF usando a API da
// Anthropic e devolve os dados extraídos em JSON estruturado. Só admin pode
// chamar (verifica o token da sessão + o profiles.role no Supabase).
// Nada é gravado no banco aqui — quem grava é o front, depois que o admin
// conferir/corrigir os dados na tela.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dXdzenpqeHhxamdmeW5jbmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzkzNjksImV4cCI6MjEwMDkxNTM2OX0.JlQf2Hz-16v0aFITkOKbxSQWrrwSHZL-12mgM6BaRwM';

async function usuarioAdmin(accessToken) {
  if (!accessToken) return false;
  var userResp = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  });
  if (!userResp.ok) return false;
  var user = await userResp.json();

  var profileResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=role', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  });
  if (!profileResp.ok) return false;
  var rows = await profileResp.json();
  return rows[0] && rows[0].role !== 'vendedor';
}

var PROMPT = 'Você vai analisar uma Nota Fiscal (NF-e/DANFE), romaneio ou pedido de venda em PDF, enviado por um fornecedor pra empresa HLN Embalagens e Equipamentos (CNPJ 66.878.650/0001-42). ' +
  'Extraia os dados e responda SOMENTE com um JSON válido (sem markdown, sem texto antes ou depois), seguindo exatamente este formato:\n\n' +
  '{\n' +
  '  "fornecedor": {\n' +
  '    "cnpj": "00.000.000/0000-00 ou null",\n' +
  '    "razao_social": "string ou null",\n' +
  '    "nome_fantasia": "string ou null",\n' +
  '    "logradouro": "string ou null", "numero": "string ou null", "complemento": "string ou null",\n' +
  '    "bairro": "string ou null", "cep": "string ou null", "municipio": "string ou null", "uf": "string ou null",\n' +
  '    "telefone_empresa": "string ou null", "email_empresa": "string ou null"\n' +
  '  },\n' +
  '  "documento": { "tipo": "nf ou romaneio ou pedido", "numero": "string ou null", "data_emissao": "YYYY-MM-DD ou null" },\n' +
  '  "itens": [\n' +
  '    { "descricao": "string", "codigo": "string ou null", "ncm": "string ou null", "quantidade": 0, "valor_unitario": 0, "valor_total": 0 }\n' +
  '  ],\n' +
  '  "pagamento": {\n' +
  '    "forma": "boleto ou a_vista ou pix ou outro",\n' +
  '    "parcelas": [ { "vencimento": "YYYY-MM-DD ou null", "valor": 0 } ]\n' +
  '  },\n' +
  '  "valor_total_documento": 0\n' +
  '}\n\n' +
  'Regras: números sempre como number puro (nunca string, nunca "R$", nunca vírgula decimal — use ponto). ' +
  'Datas sempre "YYYY-MM-DD". Se não achar um valor, use null (nunca invente). ' +
  'Se o documento tiver parcelas/faturas com datas de vencimento, liste todas em pagamento.parcelas. ' +
  'Se não houver parcelamento explícito, coloque uma única parcela com o valor total e vencimento null.';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  var body = req.body || {};

  if (!(await usuarioAdmin(body.accessToken))) {
    res.status(401).json({ error: 'Sessão inválida ou sem permissão de admin.' });
    return;
  }

  if (!body.pdfBase64) {
    res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Leitura de documento não configurada (ANTHROPIC_API_KEY ausente no servidor).' });
    return;
  }

  var aiResp;
  try {
    aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.pdfBase64 } },
            { type: 'text', text: PROMPT }
          ]
        }]
      })
    });
  } catch (err) {
    res.status(502).json({ error: 'Falha ao contatar o serviço de leitura: ' + err.message });
    return;
  }

  var aiData = await aiResp.json().catch(function () { return {}; });

  if (!aiResp.ok) {
    res.status(502).json({ error: (aiData && aiData.error && aiData.error.message) || 'Erro ao ler o documento.' });
    return;
  }

  var blocoTexto = (aiData.content || []).find(function (b) { return b.type === 'text'; });
  var textoResposta = (blocoTexto && blocoTexto.text) || '';
  var jsonLimpo = textoResposta.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  var extraido;
  try {
    extraido = JSON.parse(jsonLimpo);
  } catch (err) {
    var motivo = aiData.stop_reason === 'max_tokens'
      ? 'A resposta ficou grande demais e foi cortada (documento com muitos itens).'
      : 'Não consegui interpretar a resposta da leitura.';
    res.status(502).json({
      error: motivo + ' Tente novamente ou preencha manualmente.',
      debug: jsonLimpo.slice(0, 500)
    });
    return;
  }

  res.status(200).json({ ok: true, dados: extraido });
};
