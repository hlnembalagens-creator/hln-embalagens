-- Aplicado em 02/11/2026 (já executado no Supabase).
-- 1) Backup: tabelas backup_catalogo_20261102 (nome e NCM antigos) e backup_configuracoes_ncm_20261102 (regras de NCM).
-- 2) Micra sem centésimos nas embalagens: "NYLON POLI 20X25X12 - ALTISVAC" -> "NYLON POLI 20X25X120 - ALTISVAC" (191 produtos).
-- 3) NCM só com dígitos, sem pontos (203 produtos e 5 regras em configuracoes).

-- update public.produtos_catalogo
--    set nome_produto = regexp_replace(nome_produto, '(\d{2})( - ALTISVAC)$', '\1' || '0' || '\2'), updated_at = now()
--  where nome_produto ~ '^(NYLON POLI|MRP|TERMOENCOLHIVEL) \d+X\d+X\d{2} - ALTISVAC$';
-- update public.produtos_catalogo set ncm = replace(ncm, '.', '') where ncm like '%.%';
-- update public.configuracoes set valor = replace(valor, '.', '') where chave like 'ncm\_%' and valor like '%.%';

-- Para desfazer (volta nome e NCM antigos):
-- update public.produtos_catalogo p set nome_produto = b.nome_antigo, ncm = b.ncm_antigo
--   from public.backup_catalogo_20261102 b where b.id = p.id;
-- update public.configuracoes c set valor = b.valor_antigo
--   from public.backup_configuracoes_ncm_20261102 b where b.chave = c.chave;
