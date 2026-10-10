// Consulta de CNPJ via BrasilAPI (gratuita, sem chave, dados oficiais da Receita Federal).
// https://brasilapi.com.br/api/cnpj/v1/{cnpj}

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Redes móveis (4G/5G) às vezes falham numa tentativa isolada — tenta de novo
// antes de desistir, com um limite de tempo por tentativa pra não travar.
async function fetchComRetentativa(url, tentativas) {
  var ultimoErro;
  for (var i = 0; i < tentativas; i++) {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      ultimoErro = err;
      if (i < tentativas - 1) await sleep(700 * (i + 1));
    }
  }
  throw ultimoErro;
}

// Fonte alternativa: https://open.cnpja.com/office/{cnpj} (gratuita, com CORS liberado).
async function fetchCnpjCnpja(cnpj) {
  try {
    var resp = await fetchComRetentativa('https://open.cnpja.com/office/' + cnpj, 2);
    if (!resp.ok) return null;
    var d = await resp.json();
    var end = d.address || {};
    var fone = (d.phones && d.phones[0]) ? (d.phones[0].area || '') + (d.phones[0].number || '') : '';
    return {
      cnpj: d.taxId || cnpj,
      razaoSocial: (d.company && d.company.name) || '',
      nomeFantasia: d.alias || '',
      logradouro: end.street || '',
      numero: end.number || '',
      complemento: end.details || '',
      bairro: end.district || '',
      cep: end.zip || '',
      municipio: end.city || '',
      uf: end.state || '',
      telefone: fone,
      email: (d.emails && d.emails[0] && d.emails[0].address) || ''
    };
  } catch (err) {
    return null;
  }
}

async function fetchCnpj(cnpjInput) {
  var cnpj = onlyDigits(cnpjInput);

  if (cnpj.length !== 14) {
    throw new Error('CNPJ deve ter 14 dígitos.');
  }

  // A BrasilAPI usa um espelho da base da Receita que demora a incluir empresas/filiais
  // recém-abertas — se ela não achar, tenta a CNPJá (dados mais frescos) antes de desistir.
  var response;
  try {
    response = await fetchComRetentativa('https://brasilapi.com.br/api/cnpj/v1/' + cnpj, 3);
  } catch (networkError) {
    response = null;
  }

  if (!response || !response.ok) {
    var alternativo = await fetchCnpjCnpja(cnpj);
    if (alternativo) return alternativo;
    if (!response) throw new Error('Não foi possível conectar à consulta de CNPJ. Verifique sua internet.');
    if (response.status === 404) {
      throw new Error('CNPJ não encontrado na Receita Federal (empresas abertas há poucos dias podem demorar a aparecer — preencha manualmente).');
    }
    throw new Error('Consulta de CNPJ indisponível no momento (tente novamente em instantes).');
  }

  var data = await response.json();

  var telefone = '';
  if (data.ddd_telefone_1) {
    telefone = data.ddd_telefone_1;
  }

  return {
    cnpj: data.cnpj || cnpj,
    razaoSocial: data.razao_social || '',
    nomeFantasia: data.nome_fantasia || '',
    logradouro: [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(' ').trim(),
    numero: data.numero || '',
    complemento: data.complemento || '',
    bairro: data.bairro || '',
    cep: data.cep || '',
    municipio: data.municipio || '',
    uf: data.uf || '',
    telefone: telefone,
    email: data.email || ''
  };
}
