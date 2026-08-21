// Utilitários de importação/exportação em Excel, usados pelas telas de
// Clientes e Catálogo. Depende da biblioteca SheetJS (window.XLSX), carregada
// via CDN antes deste arquivo.

function lerArquivoExcel(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type: 'array' });
        var primeiraAba = workbook.Sheets[workbook.SheetNames[0]];
        var linhas = XLSX.utils.sheet_to_json(primeiraAba, { defval: '' });
        resolve(linhas);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
    reader.readAsArrayBuffer(file);
  });
}

function baixarExcel(nomeArquivo, linhas, colunas) {
  var worksheet = XLSX.utils.json_to_sheet(linhas, { header: colunas });
  var workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
  XLSX.writeFile(workbook, nomeArquivo);
}

// Lê o valor de uma linha do Excel tentando algumas variações de nome de coluna
// (o usuário pode editar o cabeçalho sem querer, ou reabrir um export antigo).
function campoExcel(linha, nomes) {
  for (var i = 0; i < nomes.length; i++) {
    var chave = nomes[i];
    if (linha[chave] != null && linha[chave] !== '') return String(linha[chave]).trim();
  }
  return '';
}
