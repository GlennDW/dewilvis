// Ephemeral local preview only. Never included in the deployment asset allowlist.
// Uses a fake session and an in-memory database; no real accounts or data.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:8795';
const csrf = 'b'.repeat(64);
const runtime = new Miniflare(convertV4MiniflareOptions({
  host:'127.0.0.1', port:8795,
  modules:true, scriptPath:new URL('../src/worker.js', import.meta.url).pathname,
  compatibilityDate:'2026-10-16', d1Databases:['DB'],
  bindings:{APP_ORIGIN:origin,AUTH_ORIGIN:'https://recipes.dewilvis.be'},
  serviceBindings:{
    ASSETS:async request => {
      const path = new URL(request.url).pathname;
      const file = path.endsWith('/') ? path+'index.html' : path;
      try {
        const bytes = await readFile(new URL('../dist'+file, import.meta.url));
        const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'image/x-icon';
        return new Response(bytes,{headers:{'Content-Type':type}});
      } catch { return new Response('Not found',{status:404}); }
    },
    AUTH_SERVICE:async request => {
      const path = new URL(request.url).pathname;
      if (path === '/api/login') {
        const input = await request.json();
        if (input.password !== 'preview') return Response.json({error:'Gebruik preview als wachtwoord voor deze lokale demo.'},{status:401});
        return Response.json({user:'glenn',csrf},{headers:{'Set-Cookie':'preview_session=local; HttpOnly; SameSite=Strict; Path=/'}});
      }
      if (path === '/api/logout') return Response.json({ok:true},{headers:{'Set-Cookie':'preview_session=; Max-Age=0; Path=/'}});
      return request.headers.get('Cookie')?.includes('preview_session=local') ? Response.json({user:'glenn',csrf}) : Response.json({error:'Meld je aan bij de lokale demo.'},{status:401});
    },
  },
}));
const db = await runtime.getD1Database('DB');
const migration = await readFile(new URL('../migrations/0001_menu.sql',import.meta.url),'utf8');
await db.batch(migration.split('\n').filter(line => line.trim() && !line.startsWith('--')).map(line => db.prepare(line)));
await runtime.ready;
console.log('Local preview: '+origin+'/manage/ (password: preview; temporary data only)');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async () => { await runtime.dispose(); process.exit(0); });
