-- Aviso do Supabase (function_search_path_mutable): fixa o search_path da função.
alter function public.resequenciar_codigos_produtos() set search_path = public, pg_temp;
