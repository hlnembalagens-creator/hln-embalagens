// Confere o token do usuário logado e se ele é Administrador (admin ou ADM 1) ativo.

var SUPABASE_URL = 'https://tuuwszzjxxqjgfyncnhn.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dXdzenpqeHhxamdmeW5jbmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzkzNjksImV4cCI6MjEwMDkxNTM2OX0.JlQf2Hz-16v0aFITkOKbxSQWrrwSHZL-12mgM6BaRwM';

async function usuarioAdmin(accessToken) {
  if (!accessToken) return null;
  var userResp = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken } });
  if (!userResp.ok) return null;
  var user = await userResp.json();
  var profResp = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=role,ativo', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken } });
  if (!profResp.ok) return null;
  var rows = await profResp.json();
  var p = rows[0];
  return p && p.ativo !== false && (p.role === 'admin' || p.role === 'admin1') ? user : null;
}

module.exports = { usuarioAdmin: usuarioAdmin };
