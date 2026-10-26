# Domínio hlnembalagens.com.br

DNS no próprio Registro.br (modo avançado ativado em 26/10; zona estava em "Domínio em transição").
No Vercel (projeto `hln-embalagens`) já adicionados: `www` (principal), apex (308 → www) e `crm`.

## Registros a criar no Registro.br
| Tipo | Nome | Valor |
|---|---|---|
| A | hlnembalagens.com.br | `216.198.79.1` |
| CNAME | www | `144854fb047dc84f.vercel-dns-017.com` |
| CNAME | crm | `144854fb047dc84f.vercel-dns-017.com` |

(No nome do CNAME não use `@`.) Conferir com `nslookup` e `curl -I https://www.hlnembalagens.com.br`.

## Só depois do HTTPS responder
Trocar `hln-embalagens.vercel.app` por `www.hlnembalagens.com.br` em:
- `index.html` (canonical, og, ld+json), `sitemap.xml`, `robots.txt`
- `js/config.js` (`siteUrl`)
- `scripts/importar-nfe*.json` (`apiUrl`)
- `api/esqueci-senha.js` (`REDIRECT_TO` → `https://crm.hlnembalagens.com.br/admin/trocar-senha.html`)

Criar `vercel.json`: `crm.*` abre `/admin/login.html`; `*.vercel.app` redireciona ao domínio novo.
Usuário ajusta no Supabase: Auth > URL Configuration (Site URL e Redirect URLs).
