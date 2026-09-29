-- Cria um usuário SOMENTE LEITURA no banco pra conectar o Power BI —
-- nunca use a chave service_role ou a senha do "postgres" numa ferramenta
-- externa. Esse usuário só consegue SELECT, nunca INSERT/UPDATE/DELETE.

create role powerbi_readonly with login password 'TROQUE_POR_UMA_SENHA_FORTE_AQUI';

grant connect on database postgres to powerbi_readonly;
grant usage on schema public to powerbi_readonly;
grant select on all tables in schema public to powerbi_readonly;
-- Garante que tabelas criadas no futuro também fiquem visíveis pro Power BI automaticamente.
alter default privileges in schema public grant select on tables to powerbi_readonly;
