document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('main-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Preenche automaticamente todos os links de WhatsApp e telefones a partir de config.js
  if (typeof HLN_CONFIG !== 'undefined') {
    document.querySelectorAll('[data-wa-link]').forEach(function (el) {
      // Número e mensagem vêm sempre de config.js (uma única configuração para o site todo).
      el.href = 'https://wa.me/' + HLN_CONFIG.whatsappNumber + '?text=' + encodeURIComponent(HLN_CONFIG.whatsappDefaultMessage);
    });

    document.querySelectorAll('[data-hln-config]').forEach(function (el) {
      var valor = HLN_CONFIG[el.getAttribute('data-hln-config')];
      if (valor) el.textContent = valor;
    });

    document.querySelectorAll('[data-phone-display]').forEach(function (el) {
      el.textContent = HLN_CONFIG.phoneDisplay;
    });
  }

  // Banner de consentimento de cookies (LGPD)
  var consentKey = 'hln_cookie_consent';
  var banner = document.getElementById('cookie-banner');
  if (banner) {
    if (!localStorage.getItem(consentKey)) {
      banner.classList.add('visible');
    }
    var acceptBtn = document.getElementById('cookie-accept');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        localStorage.setItem(consentKey, 'accepted');
        banner.classList.remove('visible');
      });
    }
  }
});
