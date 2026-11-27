/* update.js: tells the app when a newer APK is released and takes you to the install in one tap */
const REL_API = 'https://api.github.com/repos/drkathirpi/mmpharmaerp/releases/latest';
let APPV = { build: 0, name: '' };
async function appInfo() {
  try { const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (A && A.getInfo) { const i = await A.getInfo(); APPV = { build: parseInt(i.build, 10) || 0, name: i.version || '' }; } } catch (e) { /* browser */ }
  return APPV;
}
async function latestRelease() {
  const r = await fetch(REL_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub answered ' + r.status);
  const j = await r.json(), n = parseInt(String(j.tag_name || '').replace(/\D+/g, ''), 10), a = (j.assets || []).find(x => /\.apk$/i.test(x.name));
  if (!n || !a) throw new Error('No app file in the latest release');
  return { build: n, name: '1.' + n, url: a.browser_download_url, size: a.size, notes: (j.body || '').split('\n').filter(l => !/^(Co-Authored-By|Claude-Session)/i.test(l)).join('\n').replace(/^Android app for MM Pharma ERP\.?\s*/i, '').trim(), date: j.published_at };
}
function updateSheet(rel, manual) {
  openSheet('Update available', `<div class="pad"><div class="mid">Version ${esc(rel.name)}</div><div class="t2">You have ${esc(APPV.name || 'an older version')}. ${rel.size ? (rel.size / 1048576).toFixed(0) + ' MB download. ' : ''}Your bills and data are kept.</div>${rel.notes ? `<div class="t2" style="margin-top:10px;white-space:pre-wrap">${esc(rel.notes.slice(0, 400))}</div>` : ''}</div>
    <div class="acts"><a class="btn" id="upd" href="${esc(rel.url)}">Update now</a><button class="btn out" id="lt">Later</button></div>
    <div class="pad t2">After the download finishes, tap it in the notification and choose Install. If Android asks, allow installs from your browser once.</div>`, root => {
    $('#lt', root).onclick = () => { S.updSnooze = Date.now() + 864e5; S.updSkip = rel.build; save(); hideSheet(); history.back(); };
  });
}
async function checkUpdate(manual) {
  try {
    await appInfo();
    if (!manual && S.updCheck && Date.now() - S.updCheck < 6 * 36e5) return;
    const rel = await latestRelease(); S.updCheck = Date.now(); save();
    if (APPV.build && rel.build > APPV.build) {
      if (manual || !(S.updSnooze > Date.now() && S.updSkip === rel.build)) updateSheet(rel, manual);
    } else if (manual) toast(APPV.build ? 'You have the latest version (' + (APPV.name || APPV.build) + ')' : 'Open the installed app to check for updates', 4000);
  } catch (e) { if (manual) toast('Could not check for updates. ' + e.message, 5000); }
}
window.addEventListener('load', () => setTimeout(() => { if (S.url) checkUpdate(false); }, 6000));
try { const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (A) A.addListener('resume', () => setTimeout(() => { if (S.url) checkUpdate(false); }, 2500)); } catch (e) { /* browser */ }
on(/^\/about$/, async () => {
  await appInfo();
  view.innerHTML = `<div class="pad"><div class="mid">MM Pharma</div><div class="t2">Version ${esc(APPV.name || 'in browser')}${APPV.build ? ' (build ' + APPV.build + ')' : ''}</div><div class="t2">${esc(S.company || '')}</div></div><div class="acts"><button class="btn" id="ck">Check for updates</button></div><div class="pad t2">The app also checks by itself when you open it.</div>`;
  $('#ck').onclick = () => checkUpdate(true);
}, { title: 'About' });
