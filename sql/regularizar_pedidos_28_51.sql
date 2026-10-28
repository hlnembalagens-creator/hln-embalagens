-- Regularização de 28/10/2026 (aprovada pelo usuário).
-- Cole no Supabase > SQL Editor e execute uma vez.

begin;

-- Pedido 28 (teste ALTISVAC): remove pedido, item de vácuo e saída vinculada.
delete from financeiro_saidas where pedido_id = '787047ee-681c-4252-821d-c9434b64f68e';
delete from pedido_itens_vacuo where pedido_id = '787047ee-681c-4252-821d-c9434b64f68e';
delete from pedidos where id = '787047ee-681c-4252-821d-c9434b64f68e';

-- Pedido 51 (Thermoprint): preços com custo c/ IPI arredondado -> R$ 5.584,00.
update pedido_itens_gerais set preco_unitario = 6.16, preco_total = 2956.80
  where id = '4dea8d53-e4b7-4c2f-9011-3fc0ab0b61b2';   -- 480 x 6,16
update pedido_itens_gerais set preco_unitario = 8.21, preco_total = 1313.60
  where id in ('451ec7ed-bae5-420f-b07d-fd643329a227',   -- 160 x 8,21
               '0700fb21-9c7a-46ed-9a02-dffa76c4bd00');  -- 160 x 8,21
update pedidos set valor_total_a_pagar = 5584, valor_total_a_pagar_vista = 5584,
  icms = '18% incluso no preço (R$ 973,48)', ipi = '3,25% incluso no valor (R$ 175,77)',
  updated_at = now()
  where id = 'fadc6efb-c54d-40f1-b25b-7637bb959c81';
update financeiro_saidas set valor = 5584
  where id = '7c7abad5-ffc2-4cca-bd97-4d692adcea74';

commit;

-- Conferência: p28 = 0, v51 = 5584, itens51 = 5584, s51 = 5584
select (select count(*) from pedidos where numero = 28) p28,
       (select valor_total_a_pagar from pedidos where numero = 51) v51,
       (select sum(preco_total) from pedido_itens_gerais where pedido_id = 'fadc6efb-c54d-40f1-b25b-7637bb959c81') itens51,
       (select valor from financeiro_saidas where id = '7c7abad5-ffc2-4cca-bd97-4d692adcea74') s51;
