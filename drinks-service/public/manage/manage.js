const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
let session = null, groups = [], drinks = [], editing = null, saving = false;
function message(text = '', error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function locked() {
  session = null; groups = []; drinks = []; $('list').replaceChildren();
  $('editor').hidden = true; $('login-panel').hidden = false;
}
async function api(path, method = 'GET', data) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers['X-CSRF-Token'] = session.csrf;
  const response = await fetch(path, { method, credentials:'same-origin', cache:'no-store', headers, signal: AbortSignal.timeout(15000), ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') locked();
    throw new Error(result.error || 'Dat lukt even niet. Probeer opnieuw.');
  }
  return result;
}
function render() {
  const query = $('search').value.trim().toLocaleLowerCase('nl');
  const category = $('category-filter').value, availability = $('availability-filter').value;
  const visible = drinks.filter(d => `${d.name} ${d.details}`.toLocaleLowerCase('nl').includes(query) && (category === 'all' || category === d.category) && (availability === 'all' || d.available === (availability === 'yes')));
  $('count').textContent = `${drinks.filter(d => d.available).length} beschikbaar · ${drinks.length} drankjes in beheer`;
  $('list').innerHTML = visible.map(d => `<article class="manage-row${d.available ? '' : ' unavailable'}"><div class="manage-card-top"><p class="eyebrow">${escapeHtml(groups.find(g => g.id === d.category)?.label)}</p><span class="manage-state">${d.available ? 'Beschikbaar' : 'Niet beschikbaar'}</span></div><div class="manage-card-copy"><h3>${escapeHtml(d.name)}</h3><p>${escapeHtml(d.details)}</p></div><div class="manage-card-footer"><button type="button" class="button button-outline" data-edit="${escapeHtml(d.id)}" aria-label="${escapeHtml(d.name)} aanpassen">Aanpassen</button><span class="availability-control"><span>Op de kaart</span><button type="button" role="switch" aria-checked="${d.available}" class="availability-switch" data-toggle="${escapeHtml(d.id)}" aria-label="${escapeHtml(d.name)} beschikbaar"></button></span></div></article>`).join('') || '<p>Geen drankjes gevonden. Pas je filters aan of voeg een drankje toe.</p>';
}
async function load() {
  const data = await api('/api/drinks');
  groups = data.groups; drinks = data.drinks;
  const previous = $('category-filter').value;
  const options = groups.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.title)}</option>`).join('');
  $('category-filter').innerHTML = '<option value="all">Alles</option>' + options;
  $('category-filter').value = groups.some(g => g.id === previous) ? previous : 'all';
  $('drink-category').innerHTML = options;
  $('login-panel').hidden = true; $('editor').hidden = false;
  render();
}
function edit(item) {
  editing = item ? { ...item } : null;
  $('form-title').textContent = item ? 'Drankje aanpassen' : 'Een nieuw drankje.';
  $('drink-name').value = item?.name || '';
  $('drink-details').value = item?.details || '';
  $('drink-category').value = item?.category || groups[0]?.id || '';
  $('drink-available').checked = item?.available ?? true;
  $('drink-alcohol-free-variant').checked = item?.alcoholFreeVariant ?? false;
  $('form-message').textContent = '';
  $('drink-dialog').showModal(); $('drink-name').focus();
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  try {
    const form = new FormData(event.target);
    session = await api('/api/login', 'POST', { user: form.get('user'), password: form.get('password') });
    event.target.reset(); await load(); message();
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
});
for (const id of ['search', 'category-filter', 'availability-filter']) $(id).addEventListener('input', render);
$('add').addEventListener('click', () => edit(null));
$('cancel').addEventListener('click', () => { if (!saving) $('drink-dialog').close(); });
$('drink-dialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
$('reload').addEventListener('click', async () => {
  try { await load(); message('De kaart is opnieuw geladen.'); }
  catch (error) { message(error.message, true); }
});
$('list').addEventListener('click', async event => {
  const button = event.target.closest('[data-edit], [data-toggle]');
  if (!button) return;
  const item = drinks.find(d => d.id === (button.dataset.edit || button.dataset.toggle));
  if (!item) return;
  if (button.dataset.edit) { edit(item); return; }
  button.disabled = true;
  let saved = false;
  try {
    await api(`/api/drinks/${item.id}`, 'PUT', { ...item, available: !item.available }); saved = true;
    await load();
    const updatedSwitch = [...$('list').querySelectorAll('[data-toggle]')].find(control => control.dataset.toggle === item.id);
    updatedSwitch?.focus({ preventScroll: true });
    message(`${item.name} staat ${item.available ? 'niet meer' : 'nu'} op de publieke kaart.`);
  } catch (error) { message(saved ? 'De wijziging is opgeslagen. Laad de kaart opnieuw om de actuele stand te zien.' : error.message, true); }
  finally { button.disabled = false; }
});
$('drink-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  saving = true;
  const controls = [...event.target.querySelectorAll('input, textarea, select, button')];
  controls.forEach(control => { control.disabled = true; });
  $('form-message').textContent = '';
  let saved = false;
  try {
    const input = { name:$('drink-name').value, details:$('drink-details').value, category:$('drink-category').value, available:$('drink-available').checked, alcoholFreeVariant:$('drink-alcohol-free-variant').checked, ...(editing ? { version:editing.version } : {}) };
    await api(editing ? `/api/drinks/${editing.id}` : '/api/drinks', editing ? 'PUT' : 'POST', input);
    saved = true; $('drink-dialog').close(); await load(); message('Opgeslagen. De publieke kaart is bijgewerkt.');
  } catch (error) {
    if (saved) message('Opgeslagen. Laad de kaart opnieuw om de actuele stand te zien.', true);
    else $('form-message').textContent = error.message;
  } finally { saving = false; controls.forEach(control => { control.disabled = false; }); }
});
async function start() {
  try { session = await api('/api/me'); await load(); message(); }
  catch (error) { locked(); message(error.message, true); }
}
start();
