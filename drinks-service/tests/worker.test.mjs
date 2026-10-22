import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const origin = 'https://drinks.dewilvis.be';
const csrf = 'a'.repeat(64);
let runtime, db;
const authCalls = [];
before(async () => {
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules:true, scriptPath:new URL('../src/worker.js', import.meta.url).pathname,
    compatibilityDate:'2026-10-16', d1Databases:['DB'],
    bindings:{ APP_ORIGIN:origin, AUTH_ORIGIN:'https://recipes.dewilvis.be' },
    serviceBindings:{
      ASSETS:() => new Response('asset'),
      AUTH_SERVICE:async request => {
        authCalls.push({ path:new URL(request.url).pathname, cookie:request.headers.get('Cookie'), origin:request.headers.get('Origin'), ip:request.headers.get('CF-Connecting-IP') });
        if (request.url.endsWith('/api/login')) {
          const input = await request.json();
          if (input.password !== 'test-password') return Response.json({ error:'Naam of wachtwoord klopt niet.' }, {status:401});
          return Response.json({user:input.user,csrf}, {headers:{'Set-Cookie':'dw_session=test; Domain=dewilvis.be; HttpOnly; Secure; SameSite=Strict; Path=/'}});
        }
        if (request.url.endsWith('/api/logout')) return Response.json({ok:true}, {headers:{'Set-Cookie':'dw_session=; Max-Age=0; Domain=dewilvis.be; Path=/'}});
        if (request.headers.get('Cookie') === 'dw_session=outage') return new Response('', {status:503});
        if (request.headers.get('Cookie') !== 'dw_session=test') return Response.json({error:'login'}, {status:401});
        return Response.json({user:'glenn',csrf}, {headers:{'Set-Cookie':'dw_session=renewed; Domain=dewilvis.be; Path=/'}});
      },
    },
  }));
  db = await runtime.getD1Database('DB');
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(file => file.endsWith('.sql')).sort()) {
    const migration = await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
    await db.batch(migration.split('\n').filter(line => line.trim() && !line.startsWith('--')).map(line => db.prepare(line)));
  }
});
after(async () => { await runtime?.dispose(); });
function request(path, {method='GET', data, cookie='dw_session=test', token=csrf, from=origin, headers={}} = {}) {
  return runtime.dispatchFetch(origin + path, {redirect:'manual',method, headers:{Cookie:cookie, Origin:from, 'X-CSRF-Token':token, 'Content-Type':'application/json', ...headers}, ...(data === undefined ? {} : {body:typeof data === 'string' ? data : JSON.stringify(data)})});
}
const sample = {name:'Test Spritz',details:'Tonic · limoen',category:'soft',available:true};
test('public menu contains the original menu and no management metadata', async () => {
  const response = await request('/api/menu', {cookie:''});
  assert.equal(response.status,200);
  const data = await response.json();
  assert.equal(data.groups.length,6);
  assert.ok(data.groups.flatMap(g => g.items).length > 40);
  assert.ok(data.groups.flatMap(g => g.items).some(([name]) => name === 'Cola Zero'));
  assert.ok(!JSON.stringify(data).includes('edited_by'));
  assert.ok(!JSON.stringify(data).includes('version'));
});
test('legacy stars migrate to flags while the public names keep their markers', async () => {
  const managed = await (await request('/api/drinks')).json();
  const marked = managed.drinks.filter(d => d.alcoholFreeVariant);
  assert.deepEqual(marked.map(d => d.name), ['Dark & Stormy', 'Cuba Libre', 'Gin & Tonic']);
  assert.ok(managed.drinks.every(d => !d.name.endsWith('*')));
  assert.ok(managed.drinks.filter(d => !marked.includes(d)).every(d => d.alcoholFreeVariant === false));
  const menu = await (await request('/api/menu', {cookie:''})).json();
  const cocktails = menu.groups.find(g => g.id === 'cocktails');
  assert.equal(cocktails.footnote, '* Ook alcoholvrij verkrijgbaar.');
  for (const d of marked) assert.ok(cocktails.items.some(([name]) => name === d.name + '*'));
});
test('variant flag controls markers and legends across availability and categories', async () => {
  const created = await request('/api/drinks', {method:'POST', data:{...sample, alcoholFreeVariant:true}});
  assert.equal(created.status, 201);
  const {id} = await created.json();
  const group = async category => (await (await request('/api/menu', {cookie:''})).json()).groups.find(g => g.id === category);
  const current = async () => (await (await request('/api/drinks')).json()).drinks.find(d => d.id === id);
  const update = async changes => {
    assert.equal((await request(`/api/drinks/${id}`, {method:'PUT', data:{...await current(), ...changes}})).status, 200);
  };
  assert.equal((await current()).alcoholFreeVariant, true);
  assert.ok((await group('soft')).items.some(([name]) => name === sample.name + '*'));
  assert.equal((await group('soft')).footnote, '* Ook alcoholvrij verkrijgbaar.');
  await update({available:false});
  assert.equal((await group('soft')).footnote, '');
  await update({available:true});
  assert.equal((await group('soft')).footnote, '* Ook alcoholvrij verkrijgbaar.');
  await update({category:'zero'});
  assert.equal((await group('soft')).footnote, '');
  assert.equal((await group('zero')).footnote, '* Ook alcoholvrij verkrijgbaar.');
  await update({alcoholFreeVariant:false});
  assert.equal((await group('zero')).footnote, '');
  assert.ok((await group('zero')).items.some(([name]) => name === sample.name));
  await update({available:false});
});
test('canonical HTML routes stay public after Workers Assets redirects', async () => {
  for (const path of ['/drinks', '/drinks.html', '/private', '/private.html']) {
    const response = await request(path, {cookie:''});
    assert.equal(response.status,200,path);
    assert.equal(await response.text(),'asset');
  }
  for (const path of ['/', '/index.html']) {
    const response = await request(path, {cookie:''});
    assert.equal(response.status,302);
    assert.equal(response.headers.get('Location'),origin+'/drinks');
  }
});
test('management reads and writes require authentication', async () => {
  assert.equal((await request('/api/drinks', {cookie:''})).status,401);
  assert.equal((await request('/api/drinks', {cookie:'',method:'POST',data:sample})).status,401);
});
test('shared login forwards cookies, origin and IP to Recipes', async () => {
  const response = await request('/api/login',{method:'POST',cookie:'',data:{user:'karen',password:'test-password'},headers:{'CF-Connecting-IP':'192.0.2.1'}});
  assert.equal(response.status,200);
  assert.match(response.headers.get('Set-Cookie'), /Domain=dewilvis.be/);
  assert.equal((await response.json()).user,'karen');
  assert.deepEqual(authCalls.at(-1),{path:'/api/login',cookie:null,origin:'https://recipes.dewilvis.be',ip:'192.0.2.1'});
  assert.equal((await request('/api/login',{method:'POST',data:{user:'glenn',password:'wrong'}})).status,401);
});
test('authenticated reads renew the shared session and logout clears it', async () => {
  const me = await request('/api/me');
  assert.deepEqual(await me.json(),{user:'glenn',csrf});
  assert.match(me.headers.get('Set-Cookie'),/renewed/);
  const logout = await request('/api/logout',{method:'POST',data:{}});
  assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});
test('failed auth service fails closed', async () => {
  assert.equal((await request('/api/drinks',{cookie:'dw_session=outage'})).status,503);
});
test('writes reject missing CSRF and foreign origins including login', async () => {
  assert.equal((await request('/api/drinks',{method:'POST',token:'',data:sample})).status,403);
  assert.equal((await request('/api/drinks',{method:'POST',from:'https://evil.example',data:sample})).status,403);
  assert.equal((await request('/api/login',{method:'POST',from:'https://evil.example',data:{user:'glenn',password:'test-password'}})).status,403);
});
test('main website can preflight, sign in, restore and end a shared session', async () => {
  for (const from of ['https://dewilvis.be','https://www.dewilvis.be']) {
    for (const path of ['/api/login','/api/me','/api/logout']) {
      const preflight = await request(path,{method:'OPTIONS',from,cookie:'',headers:{'Access-Control-Request-Method':path === '/api/me' ? 'GET' : 'POST','Access-Control-Request-Headers':'content-type,x-csrf-token'}});
      assert.equal(preflight.status,204);
      assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),from);
      assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),'true');
      assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/X-CSRF-Token/);
    }
    const login = await request('/api/login',{method:'POST',from,cookie:'',data:{user:'glenn',password:'test-password'}});
    assert.equal(login.status,200);
    assert.equal(login.headers.get('Access-Control-Allow-Origin'),from);
    assert.equal(login.headers.get('Access-Control-Allow-Credentials'),'true');
    assert.match(login.headers.get('Set-Cookie'),/Domain=dewilvis.be/);
    const me = await request('/api/me',{from});
    assert.equal(me.status,200);
    assert.equal(me.headers.get('Access-Control-Allow-Origin'),from);
    assert.deepEqual(await me.json(),{user:'glenn',csrf});
    const logout = await request('/api/logout',{method:'POST',from,data:{}});
    assert.equal(logout.status,200);
    assert.equal(logout.headers.get('Access-Control-Allow-Credentials'),'true');
    assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
    const expired = await request('/api/me',{from,cookie:''});
    assert.equal(expired.status,401);
    assert.equal(expired.headers.get('Access-Control-Allow-Origin'),from);
    assert.equal((await request('/api/logout',{method:'POST',from,token:'',data:{}})).status,403);
  }
});
test('credentialed CORS never extends to foreign sites or drink editing', async () => {
  for (const path of ['/api/login','/api/me','/api/logout']) {
    const preflight = await request(path,{method:'OPTIONS',from:'https://evil.example',headers:{'Access-Control-Request-Method':'POST'}});
    assert.equal(preflight.status,403);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),null);
  }
  const preflight = await request('/api/drinks',{method:'OPTIONS',from:'https://dewilvis.be',headers:{'Access-Control-Request-Method':'POST'}});
  assert.equal(preflight.status,403);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
  const write = await request('/api/drinks',{method:'POST',from:'https://dewilvis.be',data:sample});
  assert.equal(write.status,403);
  assert.equal(write.headers.get('Access-Control-Allow-Origin'),null);
  const invalidMethod = await request('/api/login',{method:'OPTIONS',from:'https://dewilvis.be',headers:{'Access-Control-Request-Method':'DELETE'}});
  assert.equal(invalidMethod.status,405);
  const menu = await request('/api/menu',{from:'https://dewilvis.be'});
  assert.equal(menu.headers.get('Access-Control-Allow-Credentials'),null);
});
test('add, edit, hide, restore and stale-write protection use real D1', async () => {
  const created = await request('/api/drinks',{method:'POST',data:sample});
  assert.equal(created.status,201);
  const {id} = await created.json();
  let menu = await (await request('/api/menu',{cookie:''})).json();
  assert.ok(menu.groups.some(g => g.items.some(([name]) => name === sample.name)));
  const update = {...sample,name:'Changed Spritz',available:false,version:1};
  assert.equal((await request(`/api/drinks/${id}`,{method:'PUT',data:update})).status,200);
  menu = await (await request('/api/menu',{cookie:''})).json();
  assert.ok(!menu.groups.some(g => g.items.some(([name]) => name === 'Changed Spritz' || name === sample.name)));
  const managed = await (await request('/api/drinks')).json();
  const item = managed.drinks.find(d => d.id === id);
  assert.equal(item.alcoholFreeVariant,false); assert.equal(item.available,false); assert.equal(item.version,2); assert.equal(item.name,'Changed Spritz');
  assert.equal((await request(`/api/drinks/${id}`,{method:'PUT',data:update})).status,409);
  assert.equal((await request(`/api/drinks/${id}`,{method:'PUT',data:{...item,available:true}})).status,200);
  menu = await (await request('/api/menu',{cookie:''})).json();
  assert.ok(menu.groups.some(g => g.items.some(([name]) => name === 'Changed Spritz')));
});
test('invalid input and oversized bodies never modify menu', async () => {
  for (const data of [{...sample,name:''},{...sample,category:'unknown'},{...sample,available:'yes'},{...sample,alcoholFreeVariant:'yes'},{...sample,alcoholFreeVariant:null},[], '{bad json']) {
    assert.equal((await request('/api/drinks',{method:'POST',data})).status,400);
  }
  assert.equal((await request('/api/drinks',{method:'POST',data:{...sample,details:'x'.repeat(13000)}})).status,413);
  assert.equal((await request('/api/drinks',{method:'POST',data:sample,headers:{'Content-Type':'text/plain'}})).status,415);
});
test('public CORS is allowlisted, private responses are never cached or exposed', async () => {
  for (const from of ['https://dewilvis.be','https://www.dewilvis.be']) {
    const response = await request('/api/menu',{from,cookie:''});
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),from);
  }
  assert.equal((await request('/api/menu',{from:'https://evil.example'})).headers.get('Access-Control-Allow-Origin'),null);
  const response = await request('/api/drinks');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.equal((await request('/src/worker.js')).status,404);
  assert.equal((await request('/migrations/0001_menu.sql')).status,404);
  assert.equal((await request('/api/drinks',{method:'DELETE'})).status,405);
});
test('an empty offering stays empty, without static fallback', async () => {
  await db.prepare('UPDATE drinks SET available=0').run();
  const menu = await (await request('/api/menu',{cookie:''})).json();
  assert.deepEqual(menu,{groups:[]});
});
