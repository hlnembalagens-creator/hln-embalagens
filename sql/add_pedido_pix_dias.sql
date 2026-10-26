-- Campo para anotar em quantos dias o cliente pode pagar via Pix, independente
-- da forma de pagamento oficial escolhida no pedido (ex: pedido fechado no cartão,
-- mas o cliente pode acabar pagando via Pix).
alter table pedidos add column if not exists pix_dias integer;
