/* ===== 09 main: prefs, theme, zoom/hash, menu, boot ===== */

/* --- one-time storage migration from the app's earlier names (Holon, Holarchy) --- */
try {
  for (const [oldKey, newKey] of [
    ['holon:doc', DOC_KEY], ['holon:prefs', PREFS_KEY],
    ['holarchy:doc', DOC_KEY], ['holarchy:prefs', PREFS_KEY],
  ]) {
    const legacy = localStorage.getItem(oldKey);
    if (legacy !== null) {
      if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, legacy);
      localStorage.removeItem(oldKey);
    }
  }
} catch (e) { /* storage unavailable; load() surfaces that on its own */ }

/* --- prefs & theming --- */
let prefs = {};
try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { prefs = {}; }
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* non-fatal */ }
}
/* --- favicon: built from the logo symbol, so the mark exists once in the file
       and the tab icon can never drift from the one in the top bar. Held at a
       neutral grey rather than the theme colour, which has to stay legible
       against whatever chrome the browser puts behind it. --- */
(function setFavicon() {
  const d = $('#logo-mark path').getAttribute('d');
  // square canvas, mark centred: browsers letterbox a non-square favicon
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -90 1000 1000">'
    + '<path fill="#818181" fill-rule="evenodd" d="' + d + '"/></svg>';
  $('#favicon').href = 'data:image/svg+xml,' + encodeURIComponent(svg);
})();

const DEFAULT_THEME = 'nordic'; // also hard-coded on <html> so first paint matches
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = prefs.theme || DEFAULT_THEME;
  document.documentElement.dataset.theme = t === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : t;
}
darkMQ.addEventListener('change', applyTheme);
const themeSelectEl = $('#theme-select');
themeSelectEl.addEventListener('change', () => {
  prefs.theme = themeSelectEl.value;
  savePrefs();
  applyTheme();
});
const hideCompletedEl = $('#hide-completed');
hideCompletedEl.addEventListener('change', () => {
  prefs.hideCompleted = hideCompletedEl.checked;
  savePrefs();
  document.body.classList.toggle('hide-completed', prefs.hideCompleted);
  // hiding completed rows changes what can be a search result, so results
  // computed under the old setting have to be recomputed
  if (view.query) renderAll();
});
const wideLayoutEl = $('#wide-layout');
wideLayoutEl.addEventListener('change', () => {
  prefs.wideLayout = wideLayoutEl.checked;
  savePrefs();
  document.body.classList.toggle('wide', prefs.wideLayout);
});

/* --- zoom via URL hash --- */
function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  return h && store.getNode(h) ? h : null;
}
function applyFocusFromHash() {
  const id = parseHash() || ROOT_ID;
  if (id !== view.focusId) {
    view.focusId = id;
    store.setSavedFocus(id);
    renderAll();
  }
}
window.addEventListener('hashchange', applyFocusFromHash);

/* --- menu panel --- */
const menuPanelEl = $('#menu-panel');
const menuBtnEl = $('#menu-btn');
function closeMenu() { menuPanelEl.hidden = true; menuBtnEl.setAttribute('aria-expanded', 'false'); }
menuBtnEl.addEventListener('click', e => {
  e.stopPropagation();
  menuPanelEl.hidden = !menuPanelEl.hidden;
  menuBtnEl.setAttribute('aria-expanded', String(!menuPanelEl.hidden));
  if (!menuPanelEl.hidden) { updateExportReadout(); updateFsUI(); }
});
document.addEventListener('click', e => {
  if (!menuPanelEl.hidden && !e.target.closest('#menu-panel') && !e.target.closest('#menu-btn')) closeMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !menuPanelEl.hidden) closeMenu();
});

/* --- menu groups ---
   View / Data / Help, each remembering whether it is open (same bargain the
   info panel's sections strike). A fresh profile opens View — the group with
   the settings someone actually browses — and leaves the other two shut, so
   the menu opens short enough to fit a laptop even before it scrolls. */
function setMenuSection(sec, open) {
  sec.classList.toggle('open', open);
  sec.querySelector('.menu-sec-head').setAttribute('aria-expanded', String(open));
}
for (const sec of $$('.menu-sec', menuPanelEl)) {
  const key = sec.dataset.sec;
  const saved = prefs.menuSections;
  setMenuSection(sec, saved && key in saved ? !!saved[key] : key === 'view');
  sec.querySelector('.menu-sec-head').addEventListener('click', () => {
    const open = !sec.classList.contains('open');
    setMenuSection(sec, open);
    if (!prefs.menuSections) prefs.menuSections = {};
    prefs.menuSections[key] = open;
    savePrefs();
  });
}
$('#export-json').addEventListener('click', () => { exportJSON(); closeMenu(); });
$('#export-md-view').addEventListener('click', () => { exportMarkdown(view.focusId); closeMenu(); });
$('#export-md-all').addEventListener('click', () => { exportMarkdown(ROOT_ID); closeMenu(); });
$('#show-help').addEventListener('click', () => { closeMenu(); $('#help-dialog').showModal(); });
$('#help-close').addEventListener('click', () => $('#help-dialog').close());
// the shortcut list is long enough that its close button can be a scroll away
closeOnBackdropClick($('#help-dialog'));
$('#menu-panel').addEventListener('click', e => e.stopPropagation());

/* --- banner buttons --- */
$('#banner-export').addEventListener('click', () => (bannerActionFn ? bannerActionFn() : exportJSON()));
$('#banner-close').addEventListener('click', () => hideBanner({ mute: true }));
// the quiet persistent signal: clicking "⚠ Not saved" retries and re-shows details
saveIndicatorEl.addEventListener('click', () => {
  if (saveIndicatorEl.classList.contains('error')) {
    bannerMutedKinds.delete('storage');
    store.saveNow();
  }
});

/* --- backup reminder: readout + configurable overdue warning --- */
const exportReadoutEl = $('#export-readout');
const exportWarnDaysEl = $('#export-warn-days');
function updateExportReadout() {
  exportReadoutEl.textContent = 'Last JSON export: ' +
    (prefs.lastExportAt ? formatAgo(prefs.lastExportAt) : 'never');
}
function checkExportReminder() {
  const days = prefs.exportWarnDays;
  if (!days) { if (bannerKind === 'notice') hideBanner(); return; }
  // an active file mirror keeps a current on-disk backup — nothing to nag about
  if (fsState === 'active') { if (bannerKind === 'notice') hideBanner(); return; }
  const ref = prefs.lastExportAt || prefs.firstUseAt;
  if (!ref) return;
  const elapsed = (Date.now() - new Date(ref).getTime()) / 86400000;
  if (elapsed >= days) {
    const d = Math.floor(elapsed);
    const what = prefs.lastExportAt
      ? `Your last backup was ${d} day${d === 1 ? '' : 's'} ago`
      : 'You haven’t exported a backup yet';
    showBanner(`${what}, and your outline lives only in this browser. (Reminder set to ${days} day${days === 1 ? '' : 's'}; adjust in the ☰ menu.)`, { kind: 'notice' });
  } else if (bannerKind === 'notice') {
    hideBanner();
  }
}
exportWarnDaysEl.addEventListener('change', () => {
  let v = parseInt(exportWarnDaysEl.value, 10);
  if (!isFinite(v) || v < 0) v = 0;
  v = Math.min(v, 365);
  exportWarnDaysEl.value = v;
  prefs.exportWarnDays = v;
  savePrefs();
  checkExportReminder();
});
// long-lived tabs: re-check hourly and whenever the tab wakes up
setInterval(checkExportReminder, 60 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkExportReminder();
});

/* --- flush saves when leaving ---
   saveNow() is async now (IndexedDB), but the cached connection means the
   transaction *starts* synchronously here and browsers complete pending
   IDB transactions during teardown. visibilitychange(hidden) is the
   reliable moment (fires before every normal close/navigate/background);
   beforeunload stays as best-effort belt and braces. */
window.addEventListener('beforeunload', () => { store.saveNow(); fsFlush(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { store.saveNow(); fsFlush(); }
});

/* --- Enter on an empty view starts an item (no focused editor needed) --- */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.defaultPrevented) return;
  const inField = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (inField || document.querySelector('dialog[open]')) return;
  const focus = store.getNode(view.focusId);
  if (focus && focus.children.length === 0 && !view.filter) {
    e.preventDefault();
    const nn = store.create(view.focusId, 0, {});
    focusNodeTitle(nn.id, 0);
  }
});

/* --- focus-header title behaves like a title (input handled by delegation);
       keep it single-line against stray DOM (already enforced in keydown) --- */

/* --- boot --- */
// Resolved once boot() finishes; later files (the tour's first-run check)
// wait on this rather than racing the async document load.
let bootReadyResolve;
const bootReady = new Promise(r => { bootReadyResolve = r; });

(async function boot() {
  // All sync, pre-paint work first — the theme especially must land before
  // first paint (prefs are sync localStorage precisely for this).
  applyTheme();
  themeSelectEl.value = prefs.theme || DEFAULT_THEME;
  document.body.classList.toggle('hide-completed', !!prefs.hideCompleted);
  hideCompletedEl.checked = !!prefs.hideCompleted;
  document.body.classList.toggle('wide', !!prefs.wideLayout);
  wideLayoutEl.checked = !!prefs.wideLayout;
  // backup-reminder defaults: 14 days; never-exported counts from first use
  if (typeof prefs.exportWarnDays !== 'number') prefs.exportWarnDays = 14;
  if (!prefs.firstUseAt) prefs.firstUseAt = nowISO();
  savePrefs();
  exportWarnDaysEl.value = prefs.exportWarnDays;
  updateExportReadout();

  // The static shell shows during this await (typically well under 50 ms).
  const loaded = await store.load();

  // initial zoom: URL hash wins, else last saved focus
  const initial = parseHash() || (store.getNode(loaded.focusId) ? loaded.focusId : ROOT_ID);
  view.focusId = initial;
  if (initial !== ROOT_ID && !location.hash) {
    history.replaceState(null, '', '#' + initial);
  }
  renderAll();
  store.saveNow(); // persist a fresh seed's ids right away
  initFileBackup(); // async: restores the file mirror if one was configured
  if (store.loadWarning) showBanner(store.loadWarning);
  else checkExportReminder(); // don't stack on top of a load warning

  // land the caret on the first visible item
  const first = visibleTitles()[0];
  if (first) activateTitle(first, 'end');
  bootReadyResolve();
})();
