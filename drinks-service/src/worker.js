const json = (data, status = 200) => Response.json(data, { status });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
// Workers Assets canonicalizes standalone HTML files to extensionless URLs.
// Both spellings must reach Assets, including the destination of its redirects.
const publicAssets = new Set(['/private', '/private.html', '/private.js', '/drinks', '/drinks.html', '/app.js', '/site-registry.js', '/styles.css', '/DeWilVis-drinks.png', '/favicon.ico', '/ClearBG/DeWilVis-whale-blue.png', '/ClearBG/DeWilVis-whale-white.png', '/manage/', '/manage/index.html', '/manage/manage.js', '/manage/manage.css']);
const websiteOrigins = ['https://dewilvis.be', 'https://www.dewilvis.be'];
const authPaths = new Set(['/api/login', '/api/me', '/api/logout']);
const authOriginAllowed = (origin, env) => origin === env.APP_ORIGIN || websiteOrigins.includes(origin);
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('JSON vereist.', 415);
  const reader = request.body?.getReader();
  if (!reader) fail('Lege invoer.');
  let size = 0;
  const parts = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 12000) { await reader.cancel(); fail('Invoer te groot.', 413); }
    parts.push(value);
  }
  try {
    const value = JSON.parse(await new Blob(parts).text());
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Ongeldige invoer.');
    return value;
  } catch { fail('Ongeldige invoer.'); }
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('Vul een geldige naam of beschrijving in.');
  return value.trim();
}
async function auth(request, env, path, method = 'GET', data) {
  const headers = new Headers({ Cookie: request.headers.get('Cookie') || '' });
  if (method === 'POST') {
    headers.set('Origin', env.AUTH_ORIGIN);
    headers.set('Content-Type', 'application/json');
    if (request.headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', request.headers.get('X-CSRF-Token'));
  }
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('CF-Connecting-IP', ip);
  return env.AUTH_SERVICE.fetch(new Request(env.AUTH_ORIGIN + path, {
    method, headers, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }));
}
const drink = (row) => ({ id: row.id, name: row.name, details: row.details, category: row.category, available: Boolean(row.available), position: row.position, version: row.version });
async function route(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  // Only the shared login endpoints accept credentialed requests from the main website.
  // Drink edits retain their original, same-origin-only access checks.
  if (method === 'OPTIONS') {
    if (url.origin !== env.APP_ORIGIN || !authPaths.has(path) || !authOriginAllowed(request.headers.get('Origin'), env)) fail('Ongeldige herkomst.', 403);
    if (!['GET', 'POST'].includes(request.headers.get('Access-Control-Request-Method'))) fail('Methode niet toegestaan.', 405);
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
      'Access-Control-Max-Age': '600',
    } });
  }
  if (!['GET', 'HEAD', 'POST', 'PUT'].includes(method)) fail('Methode niet toegestaan.', 405);
  if (path === '/' || path === '/index.html' || path === '/manage') {
    return Response.redirect(url.origin + (path === '/manage' ? '/manage/' : '/drinks'), 302);
  }
  if (publicAssets.has(path) && ['GET', 'HEAD'].includes(method)) return env.ASSETS.fetch(request);
  if (path === '/api/menu' && method === 'GET') {
    const [groups, items] = await env.DB.batch([
      env.DB.prepare('SELECT id,label,title,intro,footnote FROM categories ORDER BY position,id'),
      env.DB.prepare('SELECT category,name,details FROM drinks WHERE available=1 ORDER BY position,name,id'),
    ]);
    return json({ groups: groups.results.map(group => ({ ...group, items: items.results.filter(item => item.category === group.id).map(item => [item.name, item.details]) })).filter(group => group.items.length) });
  }
  if (!path.startsWith('/api/')) fail('Niet gevonden.', 404);
  if (['POST', 'PUT'].includes(method) && (url.origin !== env.APP_ORIGIN || (authPaths.has(path) ? !authOriginAllowed(request.headers.get('Origin'), env) : request.headers.get('Origin') !== env.APP_ORIGIN))) fail('Ongeldige herkomst.', 403);
  if (path === '/api/login' && method === 'POST') {
    const input = await body(request);
    const user = text(input.user, 30, true).toLowerCase();
    text(input.password, 256, true);
    // Recipes remains the only password and session authority, including its rate limits.
    return auth(request, env, path, 'POST', { user, password: input.password });
  }
  const authResponse = await auth(request, env, '/api/me');
  if (!authResponse.ok) fail(authResponse.status === 401 ? 'Meld je aan om de drankkaart te beheren.' : 'Aanmelden is tijdelijk niet beschikbaar.', authResponse.status === 401 ? 401 : 503);
  const session = await authResponse.json();
  if (!['glenn', 'karen'].includes(session.user) || typeof session.csrf !== 'string' || session.csrf.length < 32) fail('Geen toegang.', 401);
  if (['POST', 'PUT'].includes(method) && !equal(request.headers.get('X-CSRF-Token'), session.csrf)) fail('Sessiecontrole mislukt. Vernieuw de pagina.', 403);
  let response;
  if (path === '/api/me' && method === 'GET') response = json({ user: session.user, csrf: session.csrf });
  else if (path === '/api/logout' && method === 'POST') return auth(request, env, path, 'POST', {});
  else if (path === '/api/drinks' && method === 'GET') {
    const [groups, items] = await env.DB.batch([
      env.DB.prepare('SELECT id,label,title FROM categories ORDER BY position,id'),
      env.DB.prepare('SELECT d.* FROM drinks d JOIN categories c ON c.id=d.category ORDER BY c.position,d.position,d.name,d.id'),
    ]);
    response = json({ groups: groups.results, drinks: items.results.map(drink) });
  } else if ((path === '/api/drinks' && method === 'POST') || (/^\/api\/drinks\/[a-f0-9-]{36}$/.test(path) && method === 'PUT')) {
    const input = await body(request);
    const name = text(input.name, 120, true), details = text(input.details, 600), category = text(input.category, 40, true);
    if (typeof input.available !== 'boolean') fail('Kies of het drankje beschikbaar is.');
    if (!await env.DB.prepare('SELECT id FROM categories WHERE id=?').bind(category).first()) fail('Onbekende categorie.');
    const now = Math.floor(Date.now() / 1000);
    if (method === 'POST') {
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO drinks(id,name,details,category,available,position,edited_by,edited_at) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(position),0)+1 FROM drinks),?,?)').bind(id, name, details, category, Number(input.available), session.user, now).run();
      response = json({ id }, 201);
    } else {
      if (!Number.isSafeInteger(input.version) || input.version < 1) fail('Ongeldige versie.');
      const result = await env.DB.prepare('UPDATE drinks SET name=?,details=?,category=?,available=?,version=version+1,edited_by=?,edited_at=? WHERE id=? AND version=?').bind(name, details, category, Number(input.available), session.user, now, path.split('/').at(-1), input.version).run();
      if (!result.meta.changes) fail('Dit drankje is intussen gewijzigd. Annuleer en laad de kaart opnieuw voordat je deze wijziging herneemt.', 409);
      response = json({ ok: true });
    }
  } else fail('Niet gevonden.', 404);
  for (const cookie of authResponse.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
  return response;
}
export default {
  async fetch(request, env) {
    let response;
    try { response = await route(request, env); }
    catch (error) { response = json({ error: error.status ? error.message : 'Opslaan of laden lukt even niet. Probeer opnieuw.' }, error.status || 503); }
    response = new Response(response.body, response);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const path = new URL(request.url).pathname, origin = request.headers.get('Origin');
    if (path === '/api/menu') {
      if (websiteOrigins.includes(origin)) response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Vary', 'Origin');
    } else if (authPaths.has(path)) {
      if (authOriginAllowed(origin, env)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }
      response.headers.set('Vary', 'Origin');
    }
    return response;
  },
};
