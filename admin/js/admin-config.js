// Configuração do portal administrativo. A anon/publishable key é pública por
// design — a segurança real vem das políticas RLS no banco (só authenticated).
var ADMIN_CONFIG = {
  supabaseUrl: 'https://tuuwszzjxxqjgfyncnhn.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dXdzenpqeHhxamdmeW5jbmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzkzNjksImV4cCI6MjEwMDkxNTM2OX0.JlQf2Hz-16v0aFITkOKbxSQWrrwSHZL-12mgM6BaRwM',
  syntheticEmailDomain: '@hln.internal'
};
