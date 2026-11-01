var allUsuarios = [];
var usuarioLogadoId = null;

function esc(texto) {
  return String(texto == null ? '' : texto).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

var ROLE_LABELS = {
  admin: 'Administrador', admin1: 'ADM 1',
  vendedor: 'Vendedor', vendedor_ext: 'Vendedor Externo', vendedor_int: 'Vendedor Interno'
};

async function chamarGerenciarUsuario(payload) {
  var { data: { session } } = await supabaseClient.auth.getSession();
  var resp = await fetch('/api/gerenciar-usuario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ accessToken: session ? session.access_token : null }, payload))
  });
  var data = await resp.json().catch(function () { return {}; });
  if (!resp.ok) throw new Error(data.error || 'Erro na operação.');
  return data;
}

async function loadUsuarios() {
  var { data, error } = await supabaseClient.from('profiles').select('*').order('nome_exibicao');
  if (error) {
    showToast('Erro ao carregar usuários: ' + error.message, 'error');
    return;
  }
  allUsuarios = data || [];
  renderUsuariosTable();
}

function renderUsuariosTable() {
  var tbody = document.getElementById('usuarios-tbody');
  if (!allUsuarios.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = allUsuarios.map(function (u) {
    var inativo = u.ativo === false;
    var status = inativo
      ? '<span class="badge badge-warning">Desativado</span>'
      : (u.must_change_password ? '<span class="badge badge-warning">Troca de senha pendente</span>' : '<span class="badge badge-ok">Ativo</span>');

    var opcoesRole = Object.keys(ROLE_LABELS).filter(function (r) { return r !== 'vendedor'; }).map(function (r) {
      return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>';
    }).join('');

    var ehEu = u.id === usuarioLogadoId;
    var botoes = '<button data-editar="' + u.id + '">Editar</button> ' +
      '<button data-resetar="' + u.id + '">Resetar senha</button>' +
      (ehEu ? '' : ' <button data-ativo="' + u.id + '">' + (inativo ? 'Reativar' : 'Desativar') + '</button>' +
        ' <button data-excluir="' + u.id + '" style="color:#b3261e;">Excluir</button>');

    return '<tr' + (inativo ? ' style="opacity:0.6;"' : '') + '>' +
      '<td>' + esc(u.nome_exibicao) + (ehEu ? ' <small>(você)</small>' : '') + '</td>' +
      '<td>' + esc(u.nome_usuario) + '</td>' +
      '<td>' + esc(u.email || '—') + '</td>' +
      '<td><select data-role-select="' + u.id + '" style="padding:6px 8px; border-radius:6px; border:1px solid #d7ddea;">' + opcoesRole + '</select></td>' +
      '<td>' + status + '</td>' +
      '<td class="row-actions">' + botoes + '</td>' +
    '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-role-select]').forEach(function (select) {
    select.addEventListener('change', async function () {
      try {
        await chamarGerenciarUsuario({ acao: 'mudar_role', userId: select.dataset.roleSelect, role: select.value });
        showToast('Perfil atualizado.', 'ok');
        loadUsuarios();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  tbody.querySelectorAll('[data-editar]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var usuario = allUsuarios.find(function (u) { return u.id === btn.dataset.editar; });
      if (!usuario) return;
      usuarioEmEdicao = usuario;
      document.getElementById('editar-nome-exibicao').value = usuario.nome_exibicao || '';
      document.getElementById('editar-nome-usuario').value = usuario.nome_usuario || '';
      document.getElementById('editar-email').value = usuario.email || '';
      document.getElementById('editar-error').style.display = 'none';
      document.getElementById('modal-editar-usuario').classList.add('open');
    });
  });

  tbody.querySelectorAll('[data-ativo]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var usuario = allUsuarios.find(function (u) { return u.id === btn.dataset.ativo; });
      if (!usuario) return;
      var desativar = usuario.ativo !== false;
      var msg = desativar
        ? 'Desativar ' + usuario.nome_exibicao + '? A pessoa deixa de conseguir entrar, mas o histórico continua.'
        : 'Reativar ' + usuario.nome_exibicao + '?';
      if (!window.confirm(msg)) return;
      try {
        await chamarGerenciarUsuario({ acao: desativar ? 'desativar' : 'reativar', userId: usuario.id });
        showToast(desativar ? 'Usuário desativado.' : 'Usuário reativado.', 'ok');
        loadUsuarios();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  tbody.querySelectorAll('[data-excluir]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var usuario = allUsuarios.find(function (u) { return u.id === btn.dataset.excluir; });
      if (!usuario) return;
      if (!window.confirm('Excluir ' + usuario.nome_exibicao + ' (' + usuario.nome_usuario + ') de vez? Isso não pode ser desfeito.')) return;
      try {
        await chamarGerenciarUsuario({ acao: 'excluir', userId: usuario.id });
        showToast('Usuário excluído.', 'ok');
        loadUsuarios();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  tbody.querySelectorAll('[data-resetar]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var usuario = allUsuarios.find(function (u) { return u.id === btn.dataset.resetar; });
      if (!usuario) return;
      usuarioEmReset = usuario;
      document.getElementById('resetar-usuario-nome').textContent = usuario.nome_exibicao + ' (' + usuario.nome_usuario + ')';
      document.getElementById('resetar-nova-senha').value = '';
      document.getElementById('resetar-error').style.display = 'none';
      document.getElementById('modal-resetar-senha').classList.add('open');
    });
  });
}

/* ===================== EDITAR USUÁRIO ===================== */

var usuarioEmEdicao = null;

document.getElementById('editar-cancelar').addEventListener('click', function () {
  document.getElementById('modal-editar-usuario').classList.remove('open');
  usuarioEmEdicao = null;
});

document.getElementById('editar-confirmar').addEventListener('click', async function () {
  if (!usuarioEmEdicao) return;
  var errorEl = document.getElementById('editar-error');
  errorEl.style.display = 'none';

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    await chamarGerenciarUsuario({
      acao: 'editar',
      userId: usuarioEmEdicao.id,
      nomeExibicao: document.getElementById('editar-nome-exibicao').value.trim(),
      nomeUsuario: document.getElementById('editar-nome-usuario').value.trim(),
      email: document.getElementById('editar-email').value.trim()
    });
    showToast('Usuário atualizado.', 'ok');
    document.getElementById('modal-editar-usuario').classList.remove('open');
    usuarioEmEdicao = null;
    loadUsuarios();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
});

/* ===================== RESETAR SENHA ===================== */

var usuarioEmReset = null;

document.getElementById('resetar-cancelar').addEventListener('click', function () {
  document.getElementById('modal-resetar-senha').classList.remove('open');
  usuarioEmReset = null;
});

document.getElementById('resetar-confirmar').addEventListener('click', async function () {
  if (!usuarioEmReset) return;
  var errorEl = document.getElementById('resetar-error');
  errorEl.style.display = 'none';

  var novaSenha = document.getElementById('resetar-nova-senha').value.trim();
  if (novaSenha.length < 6) {
    errorEl.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
    errorEl.style.display = 'block';
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Resetando...';

  try {
    await chamarGerenciarUsuario({ acao: 'resetar_senha', userId: usuarioEmReset.id, novaSenha: novaSenha });
    showToast('Senha resetada. A pessoa vai trocar no próximo login.', 'ok');
    document.getElementById('modal-resetar-senha').classList.remove('open');
    usuarioEmReset = null;
    loadUsuarios();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Resetar';
  }
});

/* ===================== CRIAR USUÁRIO ===================== */

document.getElementById('usuario-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var errorEl = document.getElementById('usuario-error');
  var saveBtn = document.getElementById('usuario-save-btn');
  errorEl.style.display = 'none';

  var payload = {
    acao: 'criar',
    nomeExibicao: document.getElementById('nome_exibicao').value.trim(),
    nomeUsuario: document.getElementById('nome_usuario').value.trim(),
    email: document.getElementById('email_pessoal').value.trim() || null,
    role: document.getElementById('role').value,
    senha: document.getElementById('senha_inicial').value.trim()
  };

  saveBtn.disabled = true;
  saveBtn.textContent = 'Criando...';

  try {
    await chamarGerenciarUsuario(payload);
    showToast('Usuário criado com sucesso.', 'ok');
    document.getElementById('usuario-form').reset();
    loadUsuarios();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Criar usuário';
  }
});

/* ===================== INIT ===================== */

(async function () {
  var auth = await window.ADMIN_AUTH_READY;
  if (!auth) return;
  usuarioLogadoId = auth.session.user.id;
  loadUsuarios();
})();
