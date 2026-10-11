// NCM: conferência com a tabela oficial (Siscomex) e preenchimento automático por
// tipo de produto. Nada é "adivinhado": o NCM de cada tipo é uma regra que o admin
// define e salva (configuracoes: ncm_<tipo>), e todo código é validado contra a
// tabela oficial em data/ncm-tabela.json (gerada por scripts/atualizar-ncm.js).

var NCM_TIPOS = [
  { chave: 'nylon_poli', label: 'Nylon Poli', reconhece: function (n) { return n.indexOf('NYLON POLI') !== -1; } },
  { chave: 'mrp', label: 'MRP', reconhece: function (n) { return n.indexOf('MRP') !== -1; } },
  { chave: 'termoencolhivel', label: 'Termoencolhível', reconhece: function (n) { return n.indexOf('TERMOENCOLHIVEL') !== -1; } },
  { chave: 'bobina_pdv', label: 'Bobina de PDV', reconhece: function (n) { return n.indexOf('BOBINA') !== -1; } },
  { chave: 'etiqueta', label: 'Etiqueta térmica', reconhece: function (n) { return n.indexOf('ETIQUETA') !== -1 || n.indexOf('ETQ') !== -1; } }
];

var ncmTabelaPromise = null;
var ncmRegras = {}; // { nylon_poli: '3923.29.90', ... }

function ncmSoDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function ncmFormatar(valor) {
  var d = ncmSoDigitos(valor);
  return d.length === 8 ? d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6) : String(valor || '').trim();
}

function carregarTabelaNcm() {
  if (!ncmTabelaPromise) {
    ncmTabelaPromise = fetch('data/ncm-tabela.json').then(function (r) {
      if (!r.ok) throw new Error('tabela NCM indisponível');
      return r.json();
    }).catch(function (err) { ncmTabelaPromise = null; throw err; });
  }
  return ncmTabelaPromise;
}

// { vazio, ok, formatado, descricao, vigencia } — ok=false quando o código não existe na tabela oficial.
async function validarNcm(valor) {
  var d = ncmSoDigitos(valor);
  if (!d) return { vazio: true, ok: false };
  var tabela = await carregarTabelaNcm();
  var descricao = d.length === 8 ? tabela.codigos[d] : null;
  return { vazio: false, ok: !!descricao, formatado: ncmFormatar(valor), descricao: descricao || '', vigencia: tabela.vigencia };
}

// Procura na tabela oficial por trecho do código ou palavras da descrição (máx. 8 resultados).
async function buscarNcm(texto) {
  var tabela = await carregarTabelaNcm();
  var termo = String(texto || '').trim().toLowerCase();
  if (termo.length < 3) return [];
  var digitos = ncmSoDigitos(termo);
  var palavras = termo.split(/\s+/);
  var achados = [];
  Object.keys(tabela.codigos).forEach(function (cod) {
    if (achados.length >= 8) return;
    var desc = tabela.codigos[cod].toLowerCase();
    var porCodigo = digitos.length >= 3 && cod.indexOf(digitos) === 0;
    var porTexto = !digitos && palavras.every(function (p) { return desc.indexOf(p) !== -1; });
    if (porCodigo || porTexto) achados.push({ codigo: ncmFormatar(cod), descricao: tabela.codigos[cod] });
  });
  return achados;
}

function tipoNcmDoProduto(nomeProduto) {
  var nome = String(nomeProduto || '').toUpperCase();
  for (var i = 0; i < NCM_TIPOS.length; i++) {
    if (NCM_TIPOS[i].reconhece(nome)) return NCM_TIPOS[i];
  }
  return null;
}

async function carregarRegrasNcm() {
  var chaves = NCM_TIPOS.map(function (t) { return 'ncm_' + t.chave; });
  var { data } = await supabaseClient.from('configuracoes').select('chave, valor').in('chave', chaves);
  ncmRegras = {};
  (data || []).forEach(function (r) {
    if (r.valor) ncmRegras[r.chave.replace('ncm_', '')] = r.valor;
  });
}

// NCM da regra do tipo do produto (null quando o tipo não tem regra definida).
function ncmAutomatico(nomeProduto) {
  var tipo = tipoNcmDoProduto(nomeProduto);
  return tipo && ncmRegras[tipo.chave] ? ncmRegras[tipo.chave] : null;
}
