const form = document.getElementById('private-login');
const signedIn = document.getElementById('private-signed-in');
const title = document.getElementById('private-auth-title');
const status = document.getElementById('private-auth-message');
const logout = document.getElementById('private-logout');
const local = ['localhost', '127.0.0.1', 'drinks.dewilvis.be'].includes(location.hostname);
const apiOrigin = local ? '' : 'https://drinks.dewilvis.be';
let session = null;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}
function showSession(value) {
  session = value;
  form.hidden = Boolean(session);
  signedIn.hidden = !session;
  title.textContent = session ? `Welkom, ${session.user === 'glenn' ? 'Glenn' : 'Karen'}.` : 'Meld je aan.';
}
async function api(path, method = 'GET', data) {
  const headers = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (method === 'POST' && session) headers['X-CSRF-Token'] = session.csrf;
  let response;
  try {
    response = await fetch(apiOrigin + path, {
      method, credentials:'include', cache:'no-store', headers,
      signal:AbortSignal.timeout(15000), ...(data === undefined ? {} : {body:JSON.stringify(data)}),
    });
  } catch { throw new Error('Aanmelden is even niet bereikbaar. Probeer opnieuw.'); }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Dat lukt even niet. Probeer opnieuw.'), {status:response.status});
  return result;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  message('Even aanmelden…');
  try {
    const data = new FormData(form);
    const result = await api('/api/login', 'POST', {user:String(data.get('user')).trim().toLowerCase(), password:data.get('password')});
    showSession(result);
    form.reset();
    message('Je bent aangemeld voor Recipes, Instagram Saver en drankbeheer.');
    title.setAttribute('tabindex', '-1');
    title.focus({preventScroll:true});
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
});
logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    await api('/api/logout', 'POST', {});
    showSession(null);
    message('Je bent afgemeld bij De WilVis.');
    document.getElementById('private-name').focus({preventScroll:true});
  } catch (error) {
    if (error.status === 401) showSession(null);
    message(error.message, true);
  } finally { logout.disabled = false; }
});
async function checkSession() {
  try { showSession(await api('/api/me')); message('Je bent al aangemeld met je De WilVis-account.'); }
  catch (error) {
    showSession(null);
    message(error.status === 401 ? 'Gebruik dezelfde naam en hetzelfde wachtwoord als bij Recipes en Saver.' : error.message, error.status !== 401);
  }
}
checkSession();
