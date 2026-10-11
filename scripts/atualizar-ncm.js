// Baixa a tabela oficial de NCM do Siscomex (Portal Único) e gera
// admin/data/ncm-tabela.json — usada pelo sistema pra conferir se um NCM existe.
// Rodar de novo quando a Receita publicar atualização:
//   node scripts/atualizar-ncm.js

var fs = require('fs');
var path = require('path');

var URL = 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO';
var SAIDA = path.join(__dirname, '..', 'admin', 'data', 'ncm-tabela.json');

function limpar(texto) {
  return String(texto || '').replace(/<[^>]*>/g, '').replace(/^[-\s]+/, '').replace(/\s+/g, ' ').trim();
}

(async function () {
  var resp = await fetch(URL);
  if (!resp.ok) throw new Error('Falha ao baixar a tabela NCM: HTTP ' + resp.status);
  var dados = await resp.json();

  var porDigitos = {};
  dados.Nomenclaturas.forEach(function (n) { porDigitos[n.Codigo.replace(/\D/g, '')] = limpar(n.Descricao); });

  var codigos = {};
  Object.keys(porDigitos).forEach(function (cod) {
    if (cod.length !== 8) return;
    var partes = [];
    var posicao = porDigitos[cod.slice(0, 4)];
    var subposicao = porDigitos[cod.slice(0, 6)];
    if (posicao) partes.push(posicao.slice(0, 70));
    if (subposicao) partes.push(subposicao);
    partes.push(porDigitos[cod]);
    codigos[cod] = partes.join(' › ').slice(0, 160);
  });

  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(SAIDA, JSON.stringify({ vigencia: dados.Data_Ultima_Atualizacao_NCM, codigos: codigos }));
  console.log('Tabela gerada: ' + Object.keys(codigos).length + ' códigos de 8 dígitos — ' + dados.Data_Ultima_Atualizacao_NCM);
})().catch(function (e) { console.error(e.message); process.exit(1); });
