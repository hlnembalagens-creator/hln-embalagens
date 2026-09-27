// Roda uma vez ao dia (via Agendador de Tarefas do Windows) ou manualmente
// a qualquer momento: "node scripts/importar-nfe-pasta.js".
// Varre a pasta Nfe, lê cada PDF novo pela mesma IA usada no import manual
// (via /api/importar-nfe-pendente) e move o arquivo pra Processados/Erros.
// Nada é gravado direto no estoque — o resultado fica pendente de revisão
// na tela Estoque > Importações pendentes.

var fs = require('fs');
var path = require('path');

var config = require('./importar-nfe.config.json');

function listarPdfs(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true })
    .filter(function (e) { return e.isFile() && /\.pdf$/i.test(e.name); })
    .map(function (e) { return e.name; });
}

function moverArquivo(pasta, nome, subpasta) {
  var destinoDir = path.join(pasta, subpasta);
  if (!fs.existsSync(destinoDir)) fs.mkdirSync(destinoDir, { recursive: true });
  var carimbo = new Date().toISOString().slice(0, 10);
  var destino = path.join(destinoDir, carimbo + ' - ' + nome);
  fs.renameSync(path.join(pasta, nome), destino);
}

async function processarArquivo(pasta, nome) {
  var caminho = path.join(pasta, nome);
  var buffer = fs.readFileSync(caminho);

  if (buffer.length > 4 * 1024 * 1024) {
    console.log('[pular] ' + nome + ' tem mais de 4MB — mova pra Erros e trate manualmente.');
    moverArquivo(pasta, nome, 'Erros');
    return;
  }

  var base64 = buffer.toString('base64');

  var resp = await fetch(config.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.secret, nomeArquivo: nome, pdfBase64: base64 })
  });

  var data = await resp.json().catch(function () { return {}; });

  if (!resp.ok || data.ok === false) {
    console.log('[erro] ' + nome + ': ' + (data.error || 'falha desconhecida'));
    moverArquivo(pasta, nome, 'Erros');
    return;
  }

  console.log('[ok] ' + nome + ' — pendente de revisão no Estoque.');
  moverArquivo(pasta, nome, 'Processados');
}

async function main() {
  var pasta = config.pastaNfe;
  if (!fs.existsSync(pasta)) {
    console.log('Pasta não encontrada: ' + pasta);
    process.exit(1);
  }

  var pdfs = listarPdfs(pasta);
  if (!pdfs.length) {
    console.log('Nenhum PDF novo em ' + pasta + '.');
    return;
  }

  console.log(pdfs.length + ' PDF(s) encontrado(s). Processando...');
  for (var i = 0; i < pdfs.length; i++) {
    await processarArquivo(pasta, pdfs[i]);
  }
  console.log('Concluído.');
}

main().catch(function (err) {
  console.error('Erro inesperado: ' + err.message);
  process.exit(1);
});
