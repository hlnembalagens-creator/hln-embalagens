// Função serverless (Vercel) — criar, editar, desativar/reativar, excluir usuário, resetar senha ou mudar perfil.
// Só o Administrador pleno (role === 'admin') pode chamar; usa a service_role
// key do Supabase, que nunca fica exposta no navegador.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dXdzenpqeHhxamdmeW5jbmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzkzNjksImV4cCI6MjEwMDkxNTM2OX0.JlQf2Hz-16v0aFITkOKbxSQWrrwSHZL-12mgM6BaRwM';
var SYNTHETIC_DOMAIN = '@hln.internal';

function usernameToEmail(username) {
  return username.trim().toLowerCase().replace(/\s+/g, '.') + SYNTHETIC_DOMAIN;
}

async function usuarioEhAdminPleno(accessToken) {
  if (!accessToken) return null;
  var userResp = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  });
  if (!userResp.ok) return null;
  var user = await userResp.json();

  var profileResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=role', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  });
  if (!profileResp.ok) return null;
  var rows = await profileResp.json();
  return rows[0] && rows[0].role === 'admin' ? user : null;
}


var LOGIN_VALIDO = /^[a-z0-9._-]+$/;

// Conta administradores ativos, exceto o usuário informado — evita ficar sem nenhum admin.
async function outrosAdminsAtivos(adminHeaders, exceptoId) {
  var resp = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=id&role=eq.admin&ativo=eq.true&id=neq.' + exceptoId, { headers: adminHeaders });
  if (!resp.ok) return 0;
  var rows = await resp.json();
  return rows.length;
}

// Tabelas com histórico ligado ao usuário (created_by etc.). Se houver, não dá para excluir de vez.
async function usuarioTemHistorico(adminHeaders, userId) {
  var consultas = [
    'pedidos?select=id&or=(created_by.eq.' + userId + ',vendedor_id.eq.' + userId + ')&limit=1',
    'clientes?select=id&created_by=eq.' + userId + '&limit=1',
    'produtos_catalogo?select=id&created_by=eq.' + userId + '&limit=1',
    'financeiro_entradas?select=id&created_by=eq.' + userId + '&limit=1',
    'financeiro_saidas?select=id&created_by=eq.' + userId + '&limit=1',
    'estoque_importacoes_pendentes?select=id&processado_por=eq.' + userId + '&limit=1'
  ];
  for (var i = 0; i < consultas.length; i++) {
    var resp = await fetch(SUPABASE_URL + '/rest/v1/' + consultas[i], { headers: adminHeaders });
    if (!resp.ok) return true; // na dúvida, protege o histórico
    var rows = await resp.json();
    if (rows.length) return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  var body = req.body || {};
  var chamador = await usuarioEhAdminPleno(body.accessToken);
  if (!chamador) {
    res.status(401).json({ error: 'Sessão inválida ou sem permissão de Administrador.' });
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Gerenciamento de usuários não configurado no servidor.' });
    return;
  }
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var adminHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };

  try {
    if (body.acao === 'criar') {
      var nomeUsuario = (body.nomeUsuario || '').trim();
      var nomeExibicao = (body.nomeExibicao || '').trim();
      var senha = (body.senha || '').trim();
      var role = body.role;

      if (!nomeUsuario || !nomeExibicao || !senha || !role) {
        res.status(400).json({ error: 'Preencha nome de usuário, nome de exibição, senha e perfil.' });
        return;
      }

      var email = usernameToEmail(nomeUsuario);
      var criarResp = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({ email: email, password: senha, email_confirm: true })
      });
      var criarData = await criarResp.json();
      if (!criarResp.ok) {
        res.status(400).json({ error: criarData.msg || criarData.message || 'Erro ao criar login.' });
        return;
      }

      var profileResp = await fetch(SUPABASE_URL + '/rest/v1/profiles', {
        method: 'POST', headers: Object.assign({}, adminHeaders, { Prefer: 'return=representation' }),
        body: JSON.stringify({
          id: criarData.id, nome_usuario: nomeUsuario, nome_exibicao: nomeExibicao,
          role: role, must_change_password: true, email: body.email || null
        })
      });
      if (!profileResp.ok) {
        var profileErro = await profileResp.json().catch(function () { return {}; });
        res.status(400).json({ error: profileErro.message || 'Login criado, mas erro ao salvar o perfil.' });
        return;
      }

      res.status(200).json({ ok: true });
      return;
    }

    if (body.acao === 'resetar_senha') {
      if (!body.userId || !body.novaSenha) {
        res.status(400).json({ error: 'Faltam dados pra resetar a senha.' });
        return;
      }
      var resetResp = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + body.userId, {
        method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password: body.novaSenha })
      });
      if (!resetResp.ok) {
        var resetErro = await resetResp.json().catch(function () { return {}; });
        res.status(400).json({ error: resetErro.msg || 'Erro ao resetar senha.' });
        return;
      }
      await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + body.userId, {
        method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ must_change_password: true })
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (body.acao === 'editar') {
      if (!body.userId) {
        res.status(400).json({ error: 'Faltam dados pra editar o usuário.' });
        return;
      }
      var novoNomeExibicao = (body.nomeExibicao || '').trim();
      var novoLogin = (body.nomeUsuario || '').trim().toLowerCase();
      var novoEmail = (body.email || '').trim();

      if (!novoNomeExibicao || !novoLogin) {
        res.status(400).json({ error: 'Preencha o nome de exibição e o usuário (login).' });
        return;
      }
      if (!LOGIN_VALIDO.test(novoLogin)) {
        res.status(400).json({ error: 'O usuário (login) só pode ter letras minúsculas sem acento, números, ponto, hífen e sublinhado.' });
        return;
      }
      if (novoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoEmail)) {
        res.status(400).json({ error: 'E-mail pessoal inválido.' });
        return;
      }

      var atualResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + body.userId + '&select=nome_usuario', { headers: adminHeaders });
      var atualRows = atualResp.ok ? await atualResp.json() : [];
      if (!atualRows[0]) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      if (atualRows[0].nome_usuario !== novoLogin) {
        var duplicadoResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=id&nome_usuario=eq.' + encodeURIComponent(novoLogin) + '&id=neq.' + body.userId, { headers: adminHeaders });
        var duplicados = duplicadoResp.ok ? await duplicadoResp.json() : [];
        if (duplicados.length) {
          res.status(400).json({ error: 'Já existe outro usuário com esse login.' });
          return;
        }
        var emailLoginResp = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + body.userId, {
          method: 'PUT', headers: adminHeaders,
          body: JSON.stringify({ email: usernameToEmail(novoLogin), email_confirm: true })
        });
        if (!emailLoginResp.ok) {
          var emailLoginErro = await emailLoginResp.json().catch(function () { return {}; });
          res.status(400).json({ error: emailLoginErro.msg || emailLoginErro.message || 'Erro ao trocar o login.' });
          return;
        }
      }

      var editarResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + body.userId, {
        method: 'PATCH', headers: adminHeaders,
        body: JSON.stringify({ nome_exibicao: novoNomeExibicao, nome_usuario: novoLogin, email: novoEmail || null })
      });
      if (!editarResp.ok) {
        res.status(400).json({ error: 'Erro ao salvar os dados do usuário.' });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (body.acao === 'desativar' || body.acao === 'reativar') {
      if (!body.userId) {
        res.status(400).json({ error: 'Faltam dados pra alterar o acesso.' });
        return;
      }
      var desativando = body.acao === 'desativar';
      if (desativando && body.userId === chamador.id) {
        res.status(400).json({ error: 'Você não pode desativar o seu próprio usuário.' });
        return;
      }
      if (desativando) {
        var alvoResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + body.userId + '&select=role', { headers: adminHeaders });
        var alvoRows = alvoResp.ok ? await alvoResp.json() : [];
        if (alvoRows[0] && alvoRows[0].role === 'admin' && (await outrosAdminsAtivos(adminHeaders, body.userId)) === 0) {
          res.status(400).json({ error: 'Não dá para desativar o último Administrador.' });
          return;
        }
      }
      var banResp = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + body.userId, {
        method: 'PUT', headers: adminHeaders,
        body: JSON.stringify({ ban_duration: desativando ? '876000h' : 'none' })
      });
      if (!banResp.ok) {
        var banErro = await banResp.json().catch(function () { return {}; });
        res.status(400).json({ error: banErro.msg || banErro.message || 'Erro ao alterar o acesso.' });
        return;
      }
      await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + body.userId, {
        method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ ativo: !desativando })
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (body.acao === 'excluir') {
      if (!body.userId) {
        res.status(400).json({ error: 'Faltam dados pra excluir o usuário.' });
        return;
      }
      if (body.userId === chamador.id) {
        res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário.' });
        return;
      }
      var excluirAlvoResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + body.userId + '&select=role', { headers: adminHeaders });
      var excluirAlvo = excluirAlvoResp.ok ? await excluirAlvoResp.json() : [];
      if (excluirAlvo[0] && excluirAlvo[0].role === 'admin' && (await outrosAdminsAtivos(adminHeaders, body.userId)) === 0) {
        res.status(400).json({ error: 'Não dá para excluir o último Administrador.' });
        return;
      }
      if (await usuarioTemHistorico(adminHeaders, body.userId)) {
        res.status(409).json({ error: 'Esse usuário tem pedidos, clientes ou lançamentos registrados e não pode ser excluído sem perder o histórico. Use "Desativar".' });
        return;
      }
      var excluirResp = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + body.userId, { method: 'DELETE', headers: adminHeaders });
      if (!excluirResp.ok) {
        var excluirErro = await excluirResp.json().catch(function () { return {}; });
        res.status(400).json({ error: excluirErro.msg || excluirErro.message || 'Erro ao excluir o usuário.' });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (body.acao === 'mudar_role') {
      if (!body.userId || !body.role) {
        res.status(400).json({ error: 'Faltam dados pra mudar o perfil.' });
        return;
      }
      if (body.role !== 'admin' && (await outrosAdminsAtivos(adminHeaders, body.userId)) === 0) {
        var atualRoleResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + body.userId + '&select=role', { headers: adminHeaders });
        var atualRole = atualRoleResp.ok ? await atualRoleResp.json() : [];
        if (atualRole[0] && atualRole[0].role === 'admin') {
          res.status(400).json({ error: 'Não dá para tirar o perfil do último Administrador.' });
          return;
        }
      }
      var roleResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + body.userId, {
        method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ role: body.role })
      });
      if (!roleResp.ok) {
        res.status(400).json({ error: 'Erro ao mudar o perfil.' });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Ação desconhecida.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
