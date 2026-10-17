'use strict';
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const storageKey = 'dewilvis.instagram.private-endpoint';
let data = null, endpoint = '', selected = null, filter = 'all', manualSelection = false, busy = false, live = false, controller = null;

export function normalizeEndpoint(value) {
  const url = new URL(String(value).trim());
  if (['127.0.0.1','localhost'].includes(location.hostname) && url.origin === location.origin && url.pathname === '/instagram-saver/status' && !url.search && !url.hash && !url.username && !url.password) return url.href;
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net$/i.test(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('Gebruik de HTTPS-dashboardlink van je Mac op je eigen Tailscale-netwerk.');
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '/instagram-saver' && path !== '/instagram-saver/status') throw new Error('De private link moet eindigen op /instagram-saver/status.');
  url.pathname = '/instagram-saver/status';
  return url.href;
}
const age = (timestamp) => {
  if (!timestamp) return 'Nog niet';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 5) return 'Net';
  if (seconds < 60) return `${seconds}s geleden`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m geleden`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}u geleden`;
  return `${Math.floor(seconds / 86400)}d geleden`;
};
const stamp = (timestamp) => timestamp ? new Date(timestamp * 1000).toLocaleString('nl-BE', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '—';
const phases = {'Enrichment complete':'AI-verrijking klaar','Saved to Obsidian':'Bewaard in Obsidian','Completed in queue':'Verwerking afgerond','Adding AI enrichment':'AI-verrijking toevoegen','AI enrichment waiting':'AI-verrijking wacht','Saving to Obsidian':'Bewaren in Obsidian','Transcribing audio':'Audio uitschrijven','Extracting audio':'Audio uit de video halen','Downloading media':'Video ophalen','Waiting to start':'Klaar om te starten','Waiting to transcribe':'Wacht op transcriptie','Waiting to extract audio':'Wacht op audio-extractie','Waiting to download':'Wacht op ophalen','Waiting to save to Obsidian':'Wacht op bewaren'};
const phase = (job) => phases[job.phase] || 'Verwerken';
const stepNames = ['Link ontvangen','Video opgehaald','Audio uitgehaald','Uitgeschreven','Bewaard in Obsidian','Verrijkt met AI'];
const status = (job) => job.slow ? ['slow','Duurt wat langer'] : [job.status, ({processing:'Bezig',retry:'Nieuwe poging gepland',pending:'Even wachten',attention:'Aandacht nodig',done:'Klaar'})[job.status] || 'Onbekend'];
const matches = (job) => filter === 'all' || (filter === 'active' && job.status === 'processing') || (filter === 'waiting' && ['retry','pending'].includes(job.status)) || (filter === 'done' && job.status === 'done') || (filter === 'attention' && (job.slow || job.status === 'attention'));
const safeReelUrl = (job) => /^https:\/\/www\.instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/$/.test(job.url || '') ? job.url : null;

function setConnection(label, description, connected = false) {
  live = connected;
  $('connection-label').textContent = label;
  $('connection-description').textContent = description;
  $('connection-dot').className = `saver-led${connected ? ' live' : endpoint ? ' warn' : ''}`;
  $('manage').textContent = endpoint ? 'Verbinding beheren ↗' : 'Verbinding instellen ↗';
  $('refresh').disabled = !endpoint;
  $('disconnect').hidden = !endpoint;
}
function showBanner(message) { $('banner').hidden = !message; $('banner').textContent = message || ''; }
function render() {
  if (!data) return;
  for (const key of ['active','waiting','saved','attention']) $(key).textContent = Number(data.counts[key]) || 0;
  const names = ['Telegram-ontvanger','Verwerkingsdienst','Toegang tot Obsidian'];
  $('health').innerHTML = data.services.map((service, index) => {
    const recent = service.ok && service.last_seen && Date.now()/1000 - service.last_seen < 120;
    return `<div class="saver-health-row"><span class="saver-led ${recent ? '' : 'warn'}"></span><div><p class="saver-health-name">${names[index] || 'Dienst'}</p><span class="saver-health-state">${recent ? 'Actief' : service.message === 'Needs permission' ? 'Toegang nodig' : 'Geen recent signaal'}${service.last_seen ? ' · ' + age(service.last_seen) : ''}</span></div></div>`;
  }).join('');
  const latest = data.jobs.find((job) => job.status === 'processing') || data.jobs[0];
  const chosen = (manualSelection ? data.jobs.find((job) => job.id === selected) : latest) || latest;
  $('follow').disabled = !manualSelection;
  $('follow').textContent = manualSelection ? 'Volg het nieuwste' : 'Volgt het nieuwste';
  if (chosen) { selected = chosen.id; renderDetail(chosen); }
  else $('activity').innerHTML = '<div class="saver-empty"><span class="saver-empty-symbol">↘</span><h3>Ruimte voor een<br>nieuwe vondst.</h3><p>Stuur een Instagram-link naar je Telegram-bot. Je ziet hem hier verschijnen.</p></div>';
  $('jobs').innerHTML = data.jobs.filter(matches).map((job) => {
    const [className, label] = status(job);
    return `<tr class="${job.id === selected ? 'saver-selected' : ''}"><td><button class="saver-job-button" data-job="${escapeHtml(job.id)}"><strong>${escapeHtml(job.title)}</strong><span>${escapeHtml(job.creator || job.id)}</span></button></td><td><span class="saver-table-phase">${escapeHtml(phase(job))}</span></td><td><span class="saver-pill ${escapeHtml(className)}">${escapeHtml(label)}</span></td><td class="saver-muted" title="${escapeHtml(stamp(job.last_activity))}">${age(job.last_activity)}</td></tr>`;
  }).join('');
  $('jobs').querySelectorAll('[data-job]').forEach((button) => button.addEventListener('click', () => { selected = button.dataset.job; manualSelection = true; render(); }));
  $('empty').hidden = data.jobs.some(matches);
  $('empty').textContent = data.jobs.length ? 'Geen vondsten met deze filter.' : 'Je wachtrij is nog leeg.';
  $('queue-count').textContent = `${data.jobs.length} ${data.jobs.length === 1 ? 'vondst' : 'vondsten'}`;
  $('updated').textContent = `${live ? 'Bijgewerkt' : 'Laatste ontvangen status'}: ${new Date(data.now*1000).toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
}
function renderDetail(job) {
  const [className, label] = status(job);
  const first = job.steps.findIndex((step) => !step.done);
  const progress = job.status === 'retry' ? `Nieuwe poging ${job.next_attempt_at > Date.now()/1000 ? 'om ' + new Date(job.next_attempt_at*1000).toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'}) : 'kan elk moment starten'}` : `Laatste stap ${age(job.last_activity)}`;
  let process = '';
  if (job.phase === 'Transcribing audio' && data.process?.observable) process = data.process.running ? `Transcriptie loopt · ${Number(data.process.cpu).toFixed(1)}% CPU · looptijd ${escapeHtml(data.process.runtime)}` : 'Op dit moment geen transcriptieproces waargenomen.';
  let warning = job.slow ? 'Al meer dan 3 minuten geen nieuw verwerkingsbestand. Dit kan traag verlopen of vastzitten; een actieve dienst betekent niet automatisch dat de Reel vooruitgaat.' : null;
  if (!warning && job.error) warning = job.status === 'attention' ? 'Deze vondst vraagt aandacht. Je link blijft bewaard. Kijk in de Saver-app op je Mac of gebruik /retry in Telegram.' : 'De vorige poging kon niet afronden. Je link blijft bewaard en wordt opnieuw geprobeerd.';
  const url = safeReelUrl(job);
  $('activity').innerHTML = `<div class="saver-reel-head"><div class="saver-reel-icon" aria-hidden="true">▷</div><div><h3 class="saver-reel-title">${escapeHtml(job.title)}</h3><div class="saver-creator">${escapeHtml(job.creator || 'Instagram')} · ${escapeHtml(job.id)}</div></div></div><div class="saver-phase-line"><span class="saver-phase">${escapeHtml(phase(job))}</span><span class="saver-pill ${escapeHtml(className)}">${escapeHtml(label)}</span></div><div class="saver-detail-note">${escapeHtml(progress)} · ${job.attempts ? 'Poging ' + Number(job.attempts) : 'Nog niet gestart'}</div>${process ? `<div class="saver-process">${process}</div>` : ''}${warning ? `<div class="saver-warning">${escapeHtml(warning)}</div>` : ''}${!job.note_observable ? '<div class="saver-warning">De toegang tot de notitiemap kon niet gecontroleerd worden.</div>' : ''}<ol class="saver-steps">${job.steps.map((step,index) => `<li class="saver-step ${step.done ? 'done' : index === first && job.status === 'processing' ? 'current' : ''}"><span class="saver-step-icon">${step.done ? '✓' : index === first && job.status === 'processing' ? '•' : ''}</span><span>${stepNames[index] || escapeHtml(step.label)}</span></li>`).join('')}</ol><div class="saver-detail-footer"><span class="saver-muted">Ontvangen ${escapeHtml(stamp(job.created_at))}</span>${url ? `<a class="saver-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Bekijk de Reel ↗</a>` : ''}</div>`;
}
async function refresh() {
  if (!endpoint || busy) return;
  busy = true;
  const current = endpoint;
  controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(current, {cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
    if (!response.ok) throw new Error(response.status === 403 ? 'access' : 'offline');
    const incoming = await response.json();
    if (current !== endpoint) return;
    if (!Array.isArray(incoming.jobs) || !Array.isArray(incoming.services) || !incoming.counts || !Number.isFinite(incoming.now)) throw new Error('format');
    incoming.jobs = incoming.jobs.filter((job) => /^[A-Za-z0-9_-]{1,100}$/.test(job.id) && Array.isArray(job.steps));
    data = incoming;
    setConnection('Je Mac is verbonden.', 'Live voortgang via je eigen private netwerk.', true);
    showBanner(incoming.error ? 'De verbinding werkt, maar de wachtrij kon nog niet gelezen worden.' : '');
    $('connection-form').hidden = true;
    render();
  } catch (error) {
    if (current !== endpoint) return;
    setConnection('Je Mac is even niet bereikbaar.', 'Controleer of Tailscale op beide toestellen aan staat en je Mac wakker is.');
    showBanner(error.message === 'access' ? 'Deze Tailscale-gebruiker heeft geen toegang tot dit dashboard. Gebruik hetzelfde account als op je Mac.' : 'Geen live verbinding. De getoonde gegevens, als die er zijn, zijn de laatst ontvangen status.');
    render();
  } finally { clearTimeout(timeout); busy = false; }
}
function remember(value) {
  endpoint = normalizeEndpoint(value);
  $('endpoint').value = endpoint;
  try { localStorage.setItem(storageKey,endpoint); } catch {}
  setConnection('Verbinding maken…','Even afstemmen met je Mac.');
  showBanner(''); refresh();
}
$('connection-form').addEventListener('submit',(event) => { event.preventDefault(); try { remember($('endpoint').value); } catch(error) { showBanner(error.message); } });
$('manage').addEventListener('click',() => { $('connection-form').hidden = !$('connection-form').hidden; if (!$('connection-form').hidden) $('endpoint').focus(); });
$('refresh').addEventListener('click',refresh);
$('follow').addEventListener('click',() => { manualSelection=false; render(); });
$('disconnect').addEventListener('click',() => {
  endpoint=''; controller?.abort(); data=null; selected=null; manualSelection=false;
  try {localStorage.removeItem(storageKey);} catch {}
  location.reload();
});
document.querySelectorAll('.saver-filter').forEach((button) => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('.saver-filter').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
let initial='';
try {initial=new URLSearchParams(location.hash.slice(1)).get('bridge') || localStorage.getItem(storageKey) || '';} catch {}
if (location.hash) history.replaceState(null,'',location.pathname+location.search);
if (initial) {try {remember(initial);} catch(error) {showBanner(error.message);}}
setInterval(refresh,3000);
