/* Interface mobile: barra inferior + gaveta de menu + rótulos para tabelas-cartão.
   Só aparece em telas pequenas (a CSS esconde no desktop). */
(function () {
  var ICONES = {
    'dashboard.html': '📊', 'pedido.html': '📝', 'vendas.html': '💰', 'relatorios.html': '📈',
    'clientes.html': '👥', 'estoque.html': '📦', 'financeiro.html': '🏦', 'calculadora-custo.html': '🧮',
    'mensagens.html': '💬', 'usuarios.html': '⚙️'
  };
  var PRINCIPAIS = ['dashboard.html', 'pedido.html', 'clientes.html', 'vendas.html'];

  function nomeArquivo(href) { return (href || '').split('/').pop().split('?')[0]; }

  function montar() {
    var nav = document.querySelector('.admin-nav');
    if (!nav || document.querySelector('.m-bottom-bar')) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
    if (!links.length) return;

    var bar = document.createElement('nav');
    bar.className = 'm-bottom-bar';
    PRINCIPAIS.forEach(function (arq) {
      var l = links.find(function (a) { return nomeArquivo(a.getAttribute('href')) === arq; });
      if (!l) return;
      var a = document.createElement('a');
      a.href = l.getAttribute('href');
      if (l.classList.contains('active')) a.className = 'active';
      a.innerHTML = '<span class="m-ico">' + (ICONES[arq] || '•') + '</span><span>' + l.textContent.trim() + '</span>';
      bar.appendChild(a);
    });
    var mais = document.createElement('button');
    mais.type = 'button';
    mais.innerHTML = '<span class="m-ico">☰</span><span>Mais</span>';
    bar.appendChild(mais);

    var backdrop = document.createElement('div');
    backdrop.className = 'm-drawer-backdrop';
    var drawer = document.createElement('div');
    drawer.className = 'm-drawer';
    var html = '<h3>Menu</h3>';
    links.forEach(function (l) {
      var arq = nomeArquivo(l.getAttribute('href'));
      html += '<a href="' + l.getAttribute('href') + '"' + (l.classList.contains('active') ? ' class="active"' : '') + '><span>' + (ICONES[arq] || '•') + '</span>' + l.textContent.trim() + '</a>';
    });
    html += '<a href="trocar-senha.html"><span>🔑</span>Trocar senha</a>';
    drawer.innerHTML = html;

    function alternar(abrir) {
      drawer.classList.toggle('open', abrir);
      backdrop.classList.toggle('open', abrir);
    }
    mais.addEventListener('click', function () { alternar(!drawer.classList.contains('open')); });
    backdrop.addEventListener('click', function () { alternar(false); });

    document.body.appendChild(bar);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
  }

  // Dá data-label às células conforme o cabeçalho da coluna (usado pelo CSS em modo cartão).
  function rotular(tabela) {
    var ths = Array.prototype.map.call(tabela.querySelectorAll('thead th'), function (t) { return t.textContent.trim(); });
    if (!ths.length) return;
    Array.prototype.forEach.call(tabela.querySelectorAll('tbody tr'), function (tr) {
      var tds = tr.children;
      if (tds.length === 1 && tds[0].hasAttribute('colspan')) return;
      Array.prototype.forEach.call(tds, function (td, i) {
        if (!td.hasAttribute('data-label') && ths[i]) td.setAttribute('data-label', ths[i]);
      });
    });
  }

  function observarTabelas() {
    document.querySelectorAll('table.admin-table').forEach(function (tabela) {
      rotular(tabela);
      var tbody = tabela.tBodies[0];
      if (!tbody) return;
      new MutationObserver(function () { rotular(tabela); }).observe(tbody, { childList: true });
    });
  }

  function iniciar() {
    // O auth-guard remove links sem permissão: monta a barra depois dele.
    var pronto = window.ADMIN_AUTH_READY && typeof window.ADMIN_AUTH_READY.then === 'function'
      ? window.ADMIN_AUTH_READY : Promise.resolve();
    pronto.then(montar, montar);
    observarTabelas();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
