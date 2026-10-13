/* ===== 19 saved and recent searches =====
   A query is just a string (04b), so remembering one is remembering a string.
   Two lists, both kept in prefs — this browser's localStorage — and so
   deliberately NOT part of the document: they are not in JSON exports, the
   file mirror, or undo. Adding them to the document later is one optional
   field and a schema step; nothing here would have to change shape.

   - Saved searches: kept on purpose (☆ beside the search box, or the panel's
     "Save current search"), optionally named, shown in the panel's "Saved
     searches" section.
   - Recent searches: queries you committed (Enter, or leaving the box), the
     last few, offered in the search box's native dropdown alongside the saved
     ones. Typing alone never records: every keystroke is a different query. */

const SS_MAX = 100;
const SS_RECENT_MAX = 15;
const ssSaveBtnEl = $('#search-save');
const ssListEl = $('#search-history');

/* one canonical spelling per query, so "a  b" and "a b " are the same search */
function ssKey(q) { return String(q || '').trim().replace(/\s+/g, ' '); }

/* Does this query filter anything? A lone ">" or an empty "" is non-blank text
   but parses to no terms at all — the outline stays unfiltered — so it is not
   worth saving, recording, or offering a ☆ for. */
function ssMeaningful(q) { return parseQuery(q).groups.length > 0; }

function ssList() { // [{q, name}] — sanitised: prefs come from a text file
  const raw = Array.isArray(prefs.savedSearches) ? prefs.savedSearches : [];
  return raw
    .filter(e => e && typeof e.q === 'string' && ssKey(e.q) && ssMeaningful(e.q))
    .map(e => ({ q: ssKey(e.q), name: typeof e.name === 'string' ? e.name.trim() : '' }))
    .slice(0, SS_MAX);
}
function ssRecentList() {
  const raw = Array.isArray(prefs.recentSearches) ? prefs.recentSearches : [];
  return raw.filter(q => typeof q === 'string' && ssKey(q) && ssMeaningful(q)).map(ssKey).slice(0, SS_RECENT_MAX);
}
function ssIndexOf(q) {
  const k = ssKey(q);
  return ssList().findIndex(e => e.q === k);
}
function ssStore(list) {
  prefs.savedSearches = list;
  savePrefs();
  ssSync();
  renderInfoPanel();
}

function ssSave(q, name = '') {
  const k = ssKey(q);
  if (!k || !ssMeaningful(k) || ssIndexOf(k) >= 0) return;
  ssStore([...ssList(), { q: k, name }]);
}
function ssRemove(i) {
  const list = ssList();
  if (i < 0 || i >= list.length) return;
  list.splice(i, 1);
  ssStore(list);
}
function ssRename(i, name) {
  const list = ssList();
  if (!list[i]) return;
  list[i].name = String(name).trim();
  ssStore(list);
}
/* the ☆ beside the search box: save the query on screen, or forget it */
function ssToggleCurrent() {
  const k = ssKey(view.query);
  if (!k) return;
  const at = ssIndexOf(k);
  if (at >= 0) ssRemove(at);
  else ssSave(k);
}
/* clicking a saved search runs it; clicking the one that is running clears it */
function ssApply(q) {
  if (ssKey(view.query) === ssKey(q)) clearSearch(false);
  else setSearch(q);
}

function ssRecord(q) {
  const k = ssKey(q);
  if (!k || !ssMeaningful(k)) return;
  const list = [k, ...ssRecentList().filter(x => x !== k)].slice(0, SS_RECENT_MAX);
  prefs.recentSearches = list;
  savePrefs();
  ssSync();
}

/* --- view: the ☆ button and the dropdown ---------------------------------- */
function ssSync() {
  const k = ssKey(view.query);
  const meaningful = !!k && ssMeaningful(k);
  const saved = meaningful && ssIndexOf(k) >= 0;
  ssSaveBtnEl.hidden = !meaningful;
  ssSaveBtnEl.textContent = saved ? '★' : '☆';
  ssSaveBtnEl.classList.toggle('on', !!saved);
  ssSaveBtnEl.title = saved ? 'Saved — click to remove from saved searches' : 'Save this search';
  ssSaveBtnEl.setAttribute('aria-pressed', String(!!saved));
  // saved ones first (with their names), then recents not already saved
  ssListEl.textContent = '';
  const seen = new Set();
  for (const e of ssList()) {
    seen.add(e.q);
    const o = document.createElement('option');
    o.value = e.q;
    if (e.name) o.label = e.name;
    ssListEl.append(o);
  }
  for (const q of ssRecentList()) {
    if (seen.has(q)) continue;
    const o = document.createElement('option');
    o.value = q;
    ssListEl.append(o);
  }
}

/* the panel's section body */
function ipSavedBody(body) {
  const list = ssList();
  const cur = ssKey(view.query);
  if (cur && ssMeaningful(cur) && ssIndexOf(cur) < 0) {
    const b = document.createElement('button');
    b.className = 'ip-ss-add';
    b.textContent = '☆ Save current search';
    b.title = cur;
    b.addEventListener('click', () => ssSave(cur));
    body.append(b);
  }
  if (!list.length) {
    body.append(ipHint('Nothing saved yet. Run a search, then click ☆ beside the search box. Saved searches stay in this browser; they are not part of an export.'));
    return;
  }
  list.forEach((e, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'ip-row-wrap';
    const row = ipRow(e.name || e.q, e.name ? e.q : null, () => ssApply(e.q));
    if (ssKey(view.query) === e.q) row.classList.add('on');
    row.title = e.q;
    const edit = document.createElement('button');
    edit.className = 'ip-ss-btn';
    edit.textContent = '✎';
    edit.title = 'Rename';
    edit.addEventListener('click', () => {
      const input = document.createElement('input');
      input.className = 'ip-ss-input';
      input.value = e.name || '';
      input.placeholder = e.q;
      input.setAttribute('aria-label', 'Name for this saved search');
      let done = false;
      const finish = commit => {
        if (done) return;
        done = true;
        if (commit) ssRename(i, input.value);
        else renderInfoPanel();
      };
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      wrap.textContent = '';
      wrap.append(input);
      input.focus();
      input.select();
    });
    const del = document.createElement('button');
    del.className = 'ip-ss-btn';
    del.textContent = '✕';
    del.title = 'Remove';
    del.addEventListener('click', () => ssRemove(i));
    wrap.append(row, edit, del);
    body.append(wrap);
  });
}

/* --- wiring ---------------------------------------------------------------- */
ssSaveBtnEl.addEventListener('click', ssToggleCurrent);
// `change` fires on Enter or on leaving the box with a new value — a commit,
// where `input` fires on every keystroke
searchEl.addEventListener('change', () => ssRecord(searchEl.value));
bootReady.then(ssSync);
