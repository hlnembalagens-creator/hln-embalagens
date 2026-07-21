// Configuração do portal administrativo. A anon/publishable key é pública por
// design — a segurança real vem das políticas RLS no banco (só authenticated).
var ADMIN_CONFIG = {
  supabaseUrl: 'https://uothefghnrjxqpowmaqt.supabase.co',
  supabaseAnonKey: 'sb_publishable_uGEHkeR3AY6231ug115RdQ_tPJlLuwP',
  syntheticEmailDomain: '@hln.internal'
};
