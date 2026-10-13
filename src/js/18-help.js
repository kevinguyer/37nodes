/* ===== 18 help center =====
   The in-app manual (F72): an overview, topic pages, a keyboard reference, and
   a "what's new" list, all inside the one file.

   Authoring: topics are src/help/NN-slug.md and the release list is
   src/help/whatsnew.md; build.ps1 bundles them into HELP_DATA below. They are
   rendered with the same DOM-only markdown renderer as notes (02), so help
   text is as XSS-safe as user text. Two help-only conventions are layered on
   top, after rendering:
     - a `code` span that is a key combo (`Alt+C`, `Enter`) becomes a <kbd>
     - a link to `#help/<topic>` navigates inside the dialog
   Keep `[[` and `((` inside code spans in the .md files: bare, the renderer
   would try to resolve them as wikilinks against the user's own document.

   Shortcuts are the one thing not authored as prose: HELP_KEYS is a table, so
   the reference stays one scannable list and search can filter its rows.
   "What's new" tracks the newest entry the user has opened in
   prefs.whatsNewSeen (+ whatsNewHash), and lights a dot on the ☰ button until
   they do. */

// the build puts the real data (plus a comma) at the marker; unbuilt, the default stands
const HELP_DATA = [/*__HELP__*/{ topics: [], news: '' }][0];

/* [keys, what] — `keys` is a list of alternatives, each a combo joined by "+" */
const HELP_KEYS = [
  { cat: 'Editing', rows: [
    [['Enter'], 'New item below (splits the title at the caret)'],
    [['Shift+Enter'], 'Add or edit the item\'s note'],
    [['Tab', 'Shift+Tab'], 'Indent / outdent'],
    [['Alt+↑', 'Alt+↓'], 'Move the item up / down'],
    [['Ctrl+Enter'], 'Complete / un-complete'],
    [['Ctrl+↑', 'Ctrl+↓'], 'Collapse / expand'],
    [['Backspace'], 'On an empty item: delete it (its children are kept)'],
    [['Ctrl+Shift+Backspace'], 'Delete the item and everything under it'],
    [['Ctrl+Z', 'Ctrl+Shift+Z'], 'Undo / redo'],
    [['Ctrl+Shift+C'], 'Copy the item and its subtree as markdown'],
  ] },
  { cat: 'Formatting', rows: [
    [['Ctrl+B', 'Ctrl+I', 'Ctrl+U'], 'Bold / italic / underline the selected title text. Select text for the full format bar'],
    [['Ctrl+.'], 'Item menu: heading, colour and more. Also the ≡ handle, or right-click a bullet'],
  ] },
  { cat: 'Moving around', rows: [
    [['↑', '↓', '←', '→'], 'Move between items'],
    [['Ctrl+Home', 'Ctrl+End'], 'First / last item in view'],
    [['Alt+→', 'Alt+←'], 'Zoom in / zoom out'],
    [['Alt+Shift+←'], 'Zoom all the way out to the top'],
  ] },
  { cat: 'Finding and filing', rows: [
    [['Ctrl+F'], 'Search the outline'],
    [['Ctrl+K'], 'Jump to any item by title. Type Parent/Child to choose between items with the same name'],
    [['Alt+M'], 'Move this item inside another one you pick'],
    [['Alt+Shift+M'], 'Show this item inside another one you pick, as a live mirror (the original stays put)'],
    [['Alt+C'], 'Show / hide completed items'],
    [['Shift+Enter'], 'In the Move to… / Mirror to… picker: do the opposite of your After-move setting (go with it, or stay here)'],
    [['Alt+L'], 'Show only the items linked to or from this one (again to clear)'],
  ] },
  { cat: 'Linking and organising', rows: [
    [['[['], 'Link to an item: pick from the list; Enter or Tab inserts it'],
    [['(('], 'On an empty item: turn it into a live mirror of another item'],
    [['#'], 'Tag an item: the tags you already use are offered as you type'],
    [['Alt+S'], 'Star / unstar the item'],
    [['Alt+I'], 'Open or close the info panel'],
  ] },
  { cat: 'General', rows: [
    [['Esc'], 'Clear the search, close a note, close a dialog'],
    [['?'], 'This keyboard reference'],
  ] },
];

const hcEl = $('#help-dialog');
const hcSearchEl = $('#hc-search');
const hcNavEl = $('#hc-topics');
const hcMainEl = $('#hc-main');
const hcContentEl = $('#hc-content');

let hcCur = 'home';
let hcQuery = '';

/* --- content model ------------------------------------------------------- */
let hcTopicCache = null;
function hcTopics() {
  if (hcTopicCache) return hcTopicCache;
  return (hcTopicCache = HELP_DATA.topics.map(t => {
    const lines = t.md.replace(/\r\n?/g, '\n').split('\n');
    const title = (lines[0] || '').replace(/^#\s+/, '').trim() || t.id;
    // the first paragraph after the title is the one-line summary on the overview
    let i = 1;
    while (i < lines.length && !lines[i].trim()) i++;
    const sum = [];
    while (i < lines.length && lines[i].trim() && !/^(#|[-*>\d`])/.test(lines[i])) sum.push(lines[i++].trim());
    return { id: t.id, title, summary: sum.join(' '), md: t.md, text: t.md.toLowerCase() };
  }));
}
let hcNewsCache = null;
function hcNews() { // newest first, as written: [{id, title, md}]
  if (hcNewsCache) return hcNewsCache;
  const out = [];
  let cur = null;
  for (const line of HELP_DATA.news.replace(/\r\n?/g, '\n').split('\n')) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) { cur = { id: m[1].trim(), title: m[1].trim(), lines: [] }; out.push(cur); }
    else if (cur) cur.lines.push(line);
  }
  return (hcNewsCache = out.map(e => ({ id: e.id, title: e.title, md: e.lines.join('\n').trim() })));
}
const HELP_KEYS_TEXT = HELP_KEYS.map(g => g.cat + ' ' + g.rows.map(r => r[0].join(' ') + ' ' + r[1]).join(' ')).join(' ').toLowerCase();

/* Everything the nav can show, in order. `text` is what the search looks in. */
function hcEntries() {
  const news = hcNews();
  return [
    { id: 'home', title: 'Overview', text: 'overview help' },
    { id: 'news', title: 'What’s new', text: news.map(e => e.title + ' ' + e.md).join(' ').toLowerCase() },
    ...hcTopics().map(t => ({ id: t.id, title: t.title, text: t.title.toLowerCase() + ' ' + t.text })),
    { id: 'keys', title: 'Keyboard shortcuts', text: 'keyboard shortcuts keys ' + HELP_KEYS_TEXT },
  ];
}

/* --- what's new bookkeeping ---------------------------------------------- */
/* A short stable fingerprint of an entry's text (djb2, base 36). A release
   grows bullet by bullet under one header, so the header alone cannot say
   whether you have read THIS version of it: the seen marker is the newest
   header plus the fingerprint of its text when it was opened. */
function hcFingerprint(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
/* → { fresh, updated, count }: `fresh` entries are newer than the one last
   seen; `updated` says the last-seen entry itself has grown since. */
function hcUnseen() {
  const news = hcNews();
  if (!news.length) return { fresh: 0, updated: false, count: 0 };
  const seen = prefs.whatsNewSeen;
  const at = seen ? news.findIndex(e => e.id === seen) : -1;
  if (at < 0) return { fresh: news.length, updated: false, count: news.length };
  const updated = prefs.whatsNewHash !== hcFingerprint(news[at].md);
  return { fresh: at, updated, count: at + (updated ? 1 : 0) };
}
function hcUnseenCount() { return hcUnseen().count; }
function hcRememberSeen() {
  const top = hcNews()[0];
  prefs.whatsNewSeen = top.id;
  prefs.whatsNewHash = hcFingerprint(top.md);
}
function hcMarkSeen() {
  if (!hcNews().length || !hcUnseen().count) return;
  hcRememberSeen();
  savePrefs();
  hcSyncDot();
}
function hcSyncDot() {
  const n = hcUnseenCount();
  $('#menu-btn').classList.toggle('has-news', n > 0);
  const pill = $('#help-new-pill');
  if (pill) pill.hidden = n === 0;
}

/* --- rendering ----------------------------------------------------------- */
const KEY_NAMES = new Set(['Enter', 'Tab', 'Esc', 'Backspace', 'Delete', 'Home', 'End', '?', '#', '[[', '((',
  '↑', '↓', '←', '→']);
function isKeyCombo(t) {
  return /^(?:Ctrl|Alt|Shift|Cmd)\+\S+/.test(t) || KEY_NAMES.has(t);
}
function hcKbd(combo) {
  const wrap = document.createElement('span');
  wrap.className = 'hc-combo';
  const parts = /^(?:Ctrl|Alt|Shift|Cmd)\+/.test(combo) ? combo.split('+') : [combo];
  parts.forEach((p, i) => {
    if (i) wrap.append(document.createTextNode('+'));
    const k = document.createElement('kbd');
    k.textContent = p;
    wrap.append(k);
  });
  return wrap;
}
function hcKeysCell(alts) {
  const frag = document.createDocumentFragment();
  alts.forEach((a, i) => {
    if (i) frag.append(document.createTextNode(' / '));
    frag.append(hcKbd(a));
  });
  return frag;
}

/* post-render touch-ups on a markdown subtree */
function hcDecorate(root) {
  for (const c of $$('code', root)) {
    if (c.closest('pre') || !isKeyCombo(c.textContent)) continue;
    c.replaceWith(hcKbd(c.textContent));
  }
  for (const a of $$('a', root)) {
    const h = a.getAttribute('href') || '';
    if (!h.startsWith('#help/')) continue;
    a.removeAttribute('target');
    a.removeAttribute('rel');
    a.dataset.help = h.slice(6);
  }
  return root;
}
function hcMd(src) {
  const el = hcDecorate(mdRender(src));
  el.classList.add('hc-md');
  return el;
}

function hcRenderNav() {
  const q = hcQuery;
  const unseen = hcUnseenCount();
  hcNavEl.textContent = '';
  let shown = 0;
  for (const e of hcEntries()) {
    if (q && !(e.title.toLowerCase().includes(q) || e.text.includes(q))) continue;
    shown++;
    const b = document.createElement('button');
    b.className = 'hc-topic' + (e.id === hcCur ? ' on' : '');
    b.dataset.topic = e.id;
    b.append(document.createTextNode(e.title));
    if (e.id === 'news' && unseen > 0) {
      const p = document.createElement('span');
      p.className = 'hc-pill';
      p.textContent = String(unseen);
      p.title = `${unseen} new`;
      b.append(p);
    }
    hcNavEl.append(b);
  }
  if (!shown) {
    const d = document.createElement('div');
    d.className = 'hc-empty';
    d.textContent = 'Nothing matches that.';
    hcNavEl.append(d);
  }
}

function hcCard(id, title, summary) {
  const b = document.createElement('button');
  b.className = 'hc-card';
  b.dataset.topic = id;
  const t = document.createElement('span');
  t.className = 'hc-card-title';
  t.textContent = title;
  b.append(t);
  if (summary) {
    const s = document.createElement('span');
    s.className = 'hc-card-sum';
    s.textContent = summary;
    b.append(s);
  }
  return b;
}

function hcShowHome(root) {
  const h = document.createElement('h1');
  h.textContent = 'How can we help?';
  const p = document.createElement('p');
  p.className = 'hc-lede';
  p.textContent = 'Pick a topic, or search from the box on the left. Your outline never leaves this browser, and neither does anything you read here.';
  root.append(h, p);
  const grid = document.createElement('div');
  grid.className = 'hc-cards';
  if (hcNews().length) {
    const n = hcUnseenCount();
    grid.append(hcCard('news', n ? `What’s new (${n})` : 'What’s new', 'What changed in each release, newest first.'));
  }
  for (const t of hcTopics()) grid.append(hcCard(t.id, t.title, t.summary));
  grid.append(hcCard('keys', 'Keyboard shortcuts', 'Every key, grouped by what you are doing. Also reachable with ?.'));
  root.append(grid);
}

function hcShowNews(root, markRead = true) {
  const unseen = hcUnseen();
  const h = document.createElement('h1');
  h.textContent = 'What’s new';
  root.append(h);
  hcNews().forEach((e, i) => {
    const sec = document.createElement('section');
    sec.className = 'hc-release';
    const h2 = document.createElement('h2');
    h2.textContent = e.title;
    if (i < unseen.fresh || (i === unseen.fresh && unseen.updated)) {
      const p = document.createElement('span');
      p.className = 'hc-pill hc-pill-new';
      p.textContent = i < unseen.fresh ? 'New' : 'Updated';
      h2.append(p);
    }
    sec.append(h2, hcMd(e.md));
    root.append(sec);
  });
  // after the badges are drawn: this is the moment they are read — but only
  // when the person chose this page. Landing here as a search result is not
  // reading it.
  if (markRead) hcMarkSeen();
}

function hcShowKeys(root) {
  const h = document.createElement('h1');
  h.textContent = 'Keyboard shortcuts';
  const note = document.createElement('p');
  note.className = 'hc-lede';
  note.append(document.createTextNode('On macOS, use '), hcKbd('⌘'), document.createTextNode(' in place of '), hcKbd('Ctrl'), document.createTextNode('.'));
  root.append(h, note);
  let any = false;
  for (const g of HELP_KEYS) {
    const rows = g.rows.filter(r => !hcQuery || (r[0].join(' ') + ' ' + r[1] + ' ' + g.cat).toLowerCase().includes(hcQuery));
    if (!rows.length) continue;
    any = true;
    const h2 = document.createElement('h2');
    h2.textContent = g.cat;
    const table = document.createElement('table');
    table.className = 'hc-keys';
    for (const [keys, what] of rows) {
      const tr = document.createElement('tr');
      const k = document.createElement('td');
      k.append(hcKeysCell(keys));
      const w = document.createElement('td');
      w.textContent = what;
      tr.append(k, w);
      table.append(tr);
    }
    root.append(h2, table);
  }
  if (!any) {
    const d = document.createElement('p');
    d.className = 'hc-empty';
    d.textContent = 'No shortcut matches that.';
    root.append(d);
  }
}

function hcShowTopic(root, t) {
  root.append(hcMd(t.md));
}

/* `read` is false when the page was chosen FOR the person (a search result
   landing on it), as opposed to opened by them: only the latter counts as
   reading What's new. */
function hcShow(id, read = true) {
  const entries = hcEntries();
  if (!entries.some(e => e.id === id)) id = 'home';
  hcCur = id;
  hcContentEl.textContent = '';
  if (id === 'home') hcShowHome(hcContentEl);
  else if (id === 'news') hcShowNews(hcContentEl, read);
  else if (id === 'keys') hcShowKeys(hcContentEl);
  else hcShowTopic(hcContentEl, hcTopics().find(t => t.id === id));
  hcMainEl.scrollTop = 0;
  hcRenderNav();
}

/* --- open / wiring -------------------------------------------------------- */
function openHelp(id) {
  hcQuery = '';
  hcSearchEl.value = '';
  if (!hcEl.open) hcEl.showModal();
  hcShow(id || 'home');
  hcMainEl.focus({ preventScroll: true }); // arrows scroll the page; typing does not land in a field
}

hcNavEl.addEventListener('click', e => {
  const b = e.target.closest('[data-topic]');
  if (b) hcShow(b.dataset.topic);
});
hcMainEl.addEventListener('click', e => {
  const b = e.target.closest('[data-topic], a[data-help]');
  if (!b) return;
  e.preventDefault();
  hcShow(b.dataset.topic || b.dataset.help);
});
hcSearchEl.addEventListener('input', () => {
  hcQuery = hcSearchEl.value.trim().toLowerCase();
  if (hcQuery) {
    // keep the page you are on if it still matches; otherwise the first hit
    const hits = hcEntries().filter(en => en.title.toLowerCase().includes(hcQuery) || en.text.includes(hcQuery));
    if (hits.length && !hits.some(en => en.id === hcCur)) { hcShow(hits[0].id, false); return; }
  }
  hcShow(hcCur, false);
});
hcEl.addEventListener('keydown', e => {
  // "/" jumps to the search box, as in most docs sites
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && e.target !== hcSearchEl) {
    e.preventDefault();
    hcSearchEl.focus();
    hcSearchEl.select();
  }
});
$('#show-help').addEventListener('click', () => { closeMenu(); openHelp('home'); });
$('#help-close').addEventListener('click', () => hcEl.close());
closeOnBackdropClick(hcEl);

// on a first run the tour has the screen and nothing here is news; for anyone
// with a document already, the dot says there is something to read
bootReady.then(() => {
  const news = hcNews();
  if (news.length && prefs.whatsNewSeen === undefined && store.wasSeeded) {
    hcRememberSeen();
    savePrefs();
  }
  hcSyncDot();
});
