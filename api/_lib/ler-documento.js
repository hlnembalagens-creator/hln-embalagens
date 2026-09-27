// Lógica compartilhada de leitura de NF/romaneio via IA — usada tanto pelo
// endpoint manual (ler-documento-estoque.js) quanto pela importação automática
// da pasta Nfe (importar-nfe-pendente.js). Não grava nada no banco.

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
  '    { "descricao": "string", "codigo": "string ou null", "ncm": "string ou null", "cfop": "string ou null", "quantidade": 0, "valor_unitario": 0, "valor_total": 0 }\n' +
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
  'Se não houver parcelamento explícito, coloque uma única parcela com o valor total e vencimento null.\n\n' +
  'ATENÇÃO — se o documento for uma NF-e/DANFE (nota fiscal eletrônica), a tabela "Itens da nota fiscal" tem colunas nesta ordem: ' +
  'Código, Descrição do produto/serviço, NCM/SH, CSOSN, CFOP, UN (unidade), Qtde (quantidade), Preço un, Preço total, BC ICMS, Vlr ICMS, Vlr IPI, %ICMS, %IPI. ' +
  'O CFOP é um código de 4 dígitos (ex: 5102, 6102) que identifica o tipo de operação fiscal — NUNCA é a quantidade comprada, mesmo que fique visualmente perto ou pareça um número "solto". ' +
  'A quantidade real está na coluna "Qtde", normalmente com casas decimais (ex: 5,00000). ' +
  'Depois de extrair, CONFIRA: quantidade × valor_unitario deve bater com valor_total (e valor_total de todos os itens deve bater com o total da nota). ' +
  'Se não bater, você pegou o campo errado — corrija antes de responder.';

// Retorna { ok: true, dados } ou { ok: false, error, debug? }
async function extrairDadosDocumento(pdfBase64) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'Leitura de documento não configurada (ANTHROPIC_API_KEY ausente no servidor).' };
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
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: PROMPT }
          ]
        }]
      })
    });
  } catch (err) {
    return { ok: false, error: 'Falha ao contatar o serviço de leitura: ' + err.message };
  }

  var aiData = await aiResp.json().catch(function () { return {}; });

  if (!aiResp.ok) {
    return { ok: false, error: (aiData && aiData.error && aiData.error.message) || 'Erro ao ler o documento.' };
  }

  var blocoTexto = (aiData.content || []).find(function (b) { return b.type === 'text'; });
  var textoResposta = (blocoTexto && blocoTexto.text) || '';
  var jsonLimpo = textoResposta.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return { ok: true, dados: JSON.parse(jsonLimpo) };
  } catch (err) {
    var motivo = aiData.stop_reason === 'max_tokens'
      ? 'A resposta ficou grande demais e foi cortada (documento com muitos itens).'
      : 'Não consegui interpretar a resposta da leitura.';
    return { ok: false, error: motivo + ' Tente novamente ou preencha manualmente.', debug: jsonLimpo.slice(0, 500) };
  }
}

module.exports = { extrairDadosDocumento: extrairDadosDocumento };
