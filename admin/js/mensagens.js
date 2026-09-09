var currentUserId = null;
var conversas = []; // [{ telefone, nome, clienteId, ultimoCorpo, ultimoEm, naoLidas }]
var conversaSelecionada = null;
var pollTimer = null;

function formatarTelefoneExibicao(telefone) {
  // Números do WhatsApp vêm como 55DDDNNNNNNNNN — formata pra leitura humana.
  var digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length >= 12 && digitos.indexOf('55') === 0) {
    var ddd = digitos.slice(2, 4);
    var resto = digitos.slice(4);
    if (resto.length === 9) return '(' + ddd + ') ' + resto.slice(0, 5) + '-' + resto.slice(5);
    if (resto.length === 8) return '(' + ddd + ') ' + resto.slice(0, 4) + '-' + resto.slice(4);
  }
  return telefone;
}

function formatarHora(dataStr) {
  var d = new Date(dataStr);
  var hoje = new Date();
  var mesmodia = d.toDateString() === hoje.toDateString();
  return mesmodia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function carregarConversas() {
  var { data, error } = await supabaseClient
    .from('whatsapp_mensagens')
    .select('telefone_contato, nome_contato, cliente_id, direcao, corpo, criado_em, lida, clientes(razao_social, nome_fantasia)')
    .order('criado_em', { ascending: false })
    .limit(500);

  if (error) {
    showToast('Erro ao carregar mensagens: ' + error.message, 'error');
    return;
  }

  var porTelefone = {};
  (data || []).forEach(function (m) {
    var tel = m.telefone_contato;
    if (!porTelefone[tel]) {
      porTelefone[tel] = {
        telefone: tel,
        nome: null,
        clienteId: m.cliente_id,
        ultimoCorpo: m.corpo,
        ultimoEm: m.criado_em,
        naoLidas: 0
      };
    }
    // O nome (do cliente cadastrado, ou do perfil do WhatsApp) só vem em mensagens
    // de entrada — não sobrescreve com null quando a mais recente é uma que nós enviamos.
    if (!porTelefone[tel].nome) {
      var nomeCliente = m.clientes ? (m.clientes.razao_social || m.clientes.nome_fantasia) : null;
      porTelefone[tel].nome = nomeCliente || m.nome_contato || null;
    }
    if (m.direcao === 'entrada' && !m.lida) porTelefone[tel].naoLidas++;
  });

  conversas = Object.keys(porTelefone).map(function (k) {
    var c = porTelefone[k];
    c.nome = c.nome || formatarTelefoneExibicao(c.telefone);
    return c;
  }).sort(function (a, b) { return new Date(b.ultimoEm) - new Date(a.ultimoEm); });

  renderConversas();
}

function renderConversas() {
  var container = document.getElementById('conversas-lista');

  if (!conversas.length) {
    container.innerHTML = '<p style="padding:16px; color:var(--gray-400); font-size:0.88rem;">Nenhuma mensagem ainda.</p>';
    return;
  }

  container.innerHTML = conversas.map(function (c) {
    var ativa = conversaSelecionada === c.telefone ? ' active' : '';
    var preview = (c.ultimoCorpo || '').slice(0, 50);
    return '<button type="button" class="conversa-item' + ativa + '" data-telefone="' + c.telefone + '">' +
      '<span class="conversa-nome">' + c.nome + (c.naoLidas ? '<span class="conversa-nao-lida">' + c.naoLidas + '</span>' : '') + '</span>' +
      '<div class="conversa-preview">' + preview + '</div>' +
    '</button>';
  }).join('');

  container.querySelectorAll('.conversa-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      abrirConversa(btn.dataset.telefone);
    });
  });
}

async function abrirConversa(telefone) {
  conversaSelecionada = telefone;
  renderConversas();

  var conversa = conversas.find(function (c) { return c.telefone === telefone; });
  var detalhe = document.getElementById('conversa-detalhe');
  detalhe.innerHTML =
    '<div class="conversa-detalhe-header">' + (conversa ? conversa.nome : telefone) + ' — ' + formatarTelefoneExibicao(telefone) + '</div>' +
    '<div class="mensagens-thread" id="mensagens-thread"><p style="color:var(--gray-400);">Carregando...</p></div>' +
    '<p id="mensagem-error" class="error-message" style="display:none;"></p>' +
    '<div class="mensagem-form">' +
      '<textarea id="mensagem-texto" rows="2" placeholder="Escreva uma mensagem... (só funciona se o cliente falou com a gente nas últimas 24h — senão é preciso usar um template aprovado)"></textarea>' +
      '<button type="button" class="btn btn-primary" id="btn-enviar-mensagem">Enviar</button>' +
    '</div>';

  document.getElementById('btn-enviar-mensagem').addEventListener('click', function () { enviarMensagem(telefone); });
  document.getElementById('mensagem-texto').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem(telefone);
    }
  });

  await carregarThread(telefone);
  await marcarComoLidas(telefone);
}

async function carregarThread(telefone) {
  var { data, error } = await supabaseClient
    .from('whatsapp_mensagens')
    .select('*')
    .eq('telefone_contato', telefone)
    .order('criado_em', { ascending: true })
    .limit(200);

  var threadEl = document.getElementById('mensagens-thread');
  if (!threadEl) return; // usuário já trocou de conversa antes da resposta chegar

  if (error) {
    threadEl.innerHTML = '<p style="color:var(--gray-400);">Erro ao carregar mensagens.</p>';
    return;
  }

  threadEl.innerHTML = (data || []).map(function (m) {
    return '<div class="msg-bubble msg-' + m.direcao + '">' + (m.corpo || '') +
      '<span class="msg-hora">' + formatarHora(m.criado_em) + '</span></div>';
  }).join('');
  threadEl.scrollTop = threadEl.scrollHeight;
}

async function marcarComoLidas(telefone) {
  await supabaseClient.from('whatsapp_mensagens').update({ lida: true })
    .eq('telefone_contato', telefone).eq('direcao', 'entrada').eq('lida', false);
  await carregarConversas();
  renderConversas(); // reaplica o estado "active" após o re-render da lista
}

async function enviarMensagem(telefone) {
  var textarea = document.getElementById('mensagem-texto');
  var errorEl = document.getElementById('mensagem-error');
  var btn = document.getElementById('btn-enviar-mensagem');
  if (!textarea || !errorEl || !btn) return;

  var texto = textarea.value.trim();
  errorEl.style.display = 'none';
  if (!texto) return;

  btn.disabled = true;
  btn.textContent = 'Enviando...';

  var { data: { session } } = await supabaseClient.auth.getSession();

  var resp, respData;
  try {
    resp = await fetch('/api/whatsapp-enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: session ? session.access_token : null,
        to: telefone,
        tipo: 'texto',
        texto: texto
      })
    });
    respData = await resp.json().catch(function () { return {}; });
  } catch (err) {
    resp = null;
    respData = {};
  }

  btn.disabled = false;
  btn.textContent = 'Enviar';

  if (!resp || !resp.ok) {
    errorEl.textContent = respData.error || 'Erro ao enviar mensagem. Se o cliente não falou com a gente nas últimas 24h, é preciso usar um template aprovado.';
    errorEl.style.display = 'block';
    return;
  }

  textarea.value = '';
  await carregarThread(telefone);
  await carregarConversas();
}

/* ===================== POLLING (novas mensagens) ===================== */

function iniciarPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async function () {
    await carregarConversas();
    if (conversaSelecionada) await carregarThread(conversaSelecionada);
  }, 15000);
}

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  currentUserId = auth.session.user.id;
  await carregarConversas();
  iniciarPolling();
})();
