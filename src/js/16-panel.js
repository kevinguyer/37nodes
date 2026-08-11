/* ===== 16 info panel =====
   Backlink index + the right-hand info panel, and the rename-rewrite offer
   that rides on top of them.

   Backlinks are derived, never stored: links resolve by TITLE (F44), and a
   duplicate title resolves to the first item in document order. So the index
   must resolve every `[[…]]` through resolveTitleLink — the same function the
   renderer uses — or the panel would list a backlink on an item the link
   doesn't actually point at. Sources are titles AND notes; a mirror has no
   text of its own, so it never sources one. */

const BL_RE = /\[\[([^\[\]]+)\]\]/g;
let blDirty = true;
let blIndex = null; // targetId -> [{id, inTitle, inNote}]

function scanLinks(text, fn) {
  if (!text) return;
  BL_RE.lastIndex = 0;
  for (let m; (m = BL_RE.exec(text)); ) fn(m[1]);
}
function blMark(map, targetId, sourceId, where) {
  let arr = map.get(targetId);
  if (!arr) map.set(targetId, arr = []);
  let e = arr.find(x => x.id === sourceId); // few sources per target: linear is fine
  if (!e) arr.push(e = { id: sourceId, inTitle: false, inNote: false });
  e[where] = true;
}
function backlinkIndex() {
  if (blIndex && !blDirty) return blIndex;
  const map = new Map();
  (function walk(n) {
    for (const c of n.children) {
      if (!c.mirrorOf) { // a mirror shows its target's text; it owns none
        scanLinks(c.title, t => {
          const id = resolveTitleLink(t);
          if (id && id !== c.id) blMark(map, id, c.id, 'inTitle'); // self-links aren't backlinks
        });
        scanLinks(c.note, t => {
          const id = resolveTitleLink(t);
          if (id && id !== c.id) blMark(map, id, c.id, 'inNote');
        });
      }
      walk(c);
    }
  })(store.doc.root);
  blIndex = map;
  blDirty = false;
  return blIndex;
}
function backlinksOf(id) { return backlinkIndex().get(id) || []; }
function linksOutOf(n) {
  if (!n || n.mirrorOf) return 0;
  const seen = new Set();
  const take = t => { const id = resolveTitleLink(t); if (id) seen.add(id); };
  scanLinks(n.title, take);
  scanLinks(n.note, take);
  return seen.size;
}

/* --- panel ------------------------------------------------------------- */
const ipEl = $('#info-panel');
const ipTitleEl = $('#ip-title');
const ipBodyEl = $('#ip-body');
const ipStarEl = $('#ip-star');
const ipBtnEl = $('#panel-btn'); // the top-bar switch, lit while the panel is out
let ipActiveId = null; // the item the caret last visited (content id)

function panelOpen() { return !!prefs.infoPanel; }
function syncPanelBtn() {
  ipBtnEl.classList.toggle('on', !!prefs.infoPanel);
  ipBtnEl.setAttribute('aria-pressed', String(!!prefs.infoPanel));
}
function setPanelOpen(on) {
  prefs.infoPanel = !!on;
  savePrefs();
  document.body.classList.toggle('panel-open', prefs.infoPanel);
  ipEl.hidden = !prefs.infoPanel;
  syncPanelBtn();
  if (prefs.infoPanel) renderInfoPanel();
}

function pathOf(id) {
  const chain = store.ancestorsOf(id).slice(1); // drop the hidden root
  if (!chain.length) return 'Top level';
  return chain.map(a => truncate(a.title, 24) || 'Untitled').join(' › ');
}
function ipLabel(text) {
  const el = document.createElement('div');
  el.className = 'ip-label';
  el.textContent = text;
  return el;
}
function ipHint(text) {
  const el = document.createElement('div');
  el.className = 'ip-hint';
  el.textContent = text;
  return el;
}
function ipRow(main, sub, onClick) {
  const b = document.createElement('button');
  b.className = 'ip-row';
  const m = document.createElement('div');
  m.className = 'ip-row-main';
  m.textContent = main;
  b.append(m);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'ip-row-sub';
    s.textContent = sub;
    b.append(s);
  }
  b.addEventListener('click', onClick);
  return b;
}
/* --- collapsible sections ---------------------------------------------
   The panel stacks three of them: the tracked item's details, the starred
   shortlist, and the tag vocabulary. Open/closed lives in prefs (details
   open, the two indexes closed, on a fresh profile) and a collapsed section
   never builds its body — only its count, which is what makes it worth
   glancing at while shut. */
function ipSectionOpen(key) {
  const s = prefs.ipSections;
  if (!s || !(key in s)) return key === 'item'; // first run: details only
  return !!s[key];
}
function ipSetSectionOpen(key, on) {
  if (!prefs.ipSections) prefs.ipSections = {};
  prefs.ipSections[key] = on;
  savePrefs();
  renderInfoPanel();
}
function ipSection(key, label, count, build) {
  const open = ipSectionOpen(key);
  const sec = document.createElement('section');
  sec.className = 'ip-sec' + (open ? ' open' : '');
  const head = document.createElement('button');
  head.className = 'ip-sec-head';
  head.setAttribute('aria-expanded', String(open));
  const caret = document.createElement('span');
  caret.className = 'ip-caret';
  caret.textContent = '▸';
  const lab = document.createElement('span');
  lab.className = 'ip-sec-title';
  lab.textContent = label;
  head.append(caret, lab);
  if (count != null) {
    const c = document.createElement('span');
    c.className = 'ip-sec-count';
    c.textContent = String(count);
    head.append(c);
  }
  head.addEventListener('click', () => ipSetSectionOpen(key, !open));
  sec.append(head);
  if (open) {
    const body = document.createElement('div');
    body.className = 'ip-sec-body';
    build(body);
    sec.append(body);
  }
  ipBodyEl.append(sec);
}
function ipDetail(grid, label, value) {
  const k = document.createElement('span');
  k.className = 'ip-k';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = 'ip-v';
  v.textContent = value;
  grid.append(k, v);
}

/* land on an item without zooming into it: reveal it where it lives, and
   only change the zoom when it sits outside the current scope */
function jumpToNode(id) {
  if (!store.getNode(id)) return;
  clearSearch(false);
  const inScope = id !== view.focusId && store.isDescendant(id, view.focusId);
  if (!inScope) {
    location.hash = '';
    applyFocusFromHash(); // sync render; the later hashchange event no-ops
  }
  revealNode(id);
  // point the panel at the destination outright: focusNodeTitle may not move
  // focus at all (the row can already hold it), and no focusin would follow
  ipActiveId = id;
  focusNodeTitle(id, 'end');
  renderInfoPanel();
}

function ipTrackedId() {
  return (ipActiveId && store.getNode(ipActiveId)) ? ipActiveId : view.focusId;
}

function ipItemBody(body, id, n) {
  // --- linked from ---
  const back = backlinksOf(id);
  body.append(ipLabel(back.length
    ? `Linked from ${back.length} item${back.length === 1 ? '' : 's'}`
    : 'Linked from'));
  if (!back.length) {
    body.append(ipHint('Nothing links here yet. Type [[ in any item to link to this one.'));
  } else {
    for (const s of back) {
      const src = store.getNode(s.id);
      if (!src) continue;
      const where = s.inNote && !s.inTitle ? 'in a note · ' : '';
      body.append(ipRow(truncate(src.title, 40) || 'Untitled', where + pathOf(s.id),
        () => jumpToNode(s.id)));
    }
  }

  // --- mirrors ---
  const mirrors = store.mirrorsOf(id);
  if (mirrors.length) {
    body.append(ipLabel(`Mirrored in ${mirrors.length} place${mirrors.length === 1 ? '' : 's'}`));
    for (const m of mirrors) {
      body.append(ipRow('⧉ ' + pathOf(m.id), null, () => jumpToNode(m.id)));
    }
  }

  // --- details ---
  body.append(ipLabel('Details'));
  const grid = document.createElement('div');
  grid.className = 'ip-grid';
  const created = new Date(n.createdAt);
  ipDetail(grid, 'Created', isFinite(created.getTime())
    ? created.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'unknown');
  ipDetail(grid, 'Edited', n.updatedAt ? formatAgo(n.updatedAt) : 'unknown');
  ipDetail(grid, 'Items inside', String(store.countNodes(n) - 1));
  ipDetail(grid, 'Links out', String(linksOutOf(n)));
  body.append(grid);
}

/* Starred items in document order — the order they read in the outline, so
   the list stays where you last saw it instead of reshuffling on every edit.
   Each row jumps; the ★ beside it unstars without leaving where you are. */
function ipStarredBody(body) {
  const items = starredItems();
  if (!items.length) {
    body.append(ipHint('Nothing starred yet. Star an item with Alt+S, from its ≡ menu, or with the ☆ above.'));
    return;
  }
  for (const it of items) {
    const wrap = document.createElement('div');
    wrap.className = 'ip-row-wrap';
    wrap.append(
      ipRow(truncate(it.title, 40) || 'Untitled', pathOf(it.id), () => jumpToNode(it.id)));
    const un = document.createElement('button');
    un.className = 'ip-unstar';
    un.textContent = '★';
    un.title = 'Unstar';
    un.addEventListener('click', () => store.toggleStarred(it.id));
    wrap.append(un);
    body.append(wrap);
  }
}

/* The tag vocabulary as chips: alphabetical, so a tag keeps its place between
   renders, with its item count riding along. Clicking one is exactly the
   chip-click in the outline (F43) — a filter you can click off again. */
function ipTagsBody(body) {
  const tags = tagsAlphabetical(view.focusId);
  if (!tags.length) {
    body.append(ipHint(view.focusId === ROOT_ID
      ? 'No tags yet. Type # in any item to tag it — the list of tags you already use appears as you type.'
      : 'No tags in this part of the outline. Zoom out to see the rest.'));
    return;
  }
  const cloud = document.createElement('div');
  cloud.className = 'ip-tags';
  const active = view.query.trim().toLowerCase();
  for (const t of tags) {
    const b = document.createElement('button');
    b.className = 'ip-tag' + (active === t.tag.toLowerCase() ? ' active' : '');
    b.title = `${t.count} item${t.count === 1 ? '' : 's'} · click to filter`;
    b.append(document.createTextNode(t.tag));
    const c = document.createElement('sup');
    c.textContent = String(t.count);
    b.append(c);
    b.addEventListener('click', () => toggleTagFilter(t.tag));
    cloud.append(b);
  }
  body.append(cloud);
}

function renderInfoPanel() {
  if (!panelOpen()) return;
  const id = ipTrackedId();
  const n = store.getNode(id);
  const tracked = !!n && id !== ROOT_ID;
  ipBodyEl.textContent = '';
  ipTitleEl.textContent = tracked ? (truncate(n.title, 60) || 'Untitled') : 'No item selected';
  ipTitleEl.title = tracked ? (n.title || 'Untitled') : '';
  ipStarEl.hidden = !tracked;
  if (tracked) {
    ipStarEl.textContent = n.starred ? '★' : '☆';
    ipStarEl.classList.toggle('on', !!n.starred);
    ipStarEl.title = (n.starred ? 'Unstar this item' : 'Star this item') + ' (Alt+S)';
  }

  ipSection('item', 'This item', null, body => {
    if (!tracked) { body.append(ipHint('Click an item to see what links to it.')); return; }
    ipItemBody(body, id, n);
  });
  ipSection('starred', 'Starred', starredItems().length, ipStarredBody);
  ipSection('tags', view.focusId === ROOT_ID ? 'Tags' : 'Tags in this view',
    tagsAlphabetical(view.focusId).length, ipTagsBody);
}
const ipRefresh = debounce(renderInfoPanel, 120);

/* --- what the panel follows: the caret ---------------------------------- */
document.addEventListener('focusin', e => {
  const t = e.target.closest?.('.title');
  const ta = !t && e.target.closest?.('.note-edit');
  const id = t ? contentIdOfTitle(t) : ta ? contentIdOfNoteEditor(ta) : null;
  if (id && id !== ipActiveId) { ipActiveId = id; ipRefresh(); }
});
window.addEventListener('hashchange', () => {
  // zooming somewhere else is a change of subject: drop a tracked item that
  // the new scope no longer contains, so the panel falls back to the zoom
  // target. (Runs after 09's applyFocusFromHash, so view.focusId is current.)
  if (ipActiveId && ipActiveId !== view.focusId && !store.isDescendant(ipActiveId, view.focusId)) {
    ipActiveId = null;
  }
  ipRefresh();
});
store.subscribe(ev => {
  if (ev.type === 'node' || ev.type === 'children' || ev.type === 'doc') {
    blDirty = true;
    ipRefresh();
  }
});

/* --- rename → offer to rewrite inbound links ---------------------------- */
/* Links resolve by title, so renaming an item breaks every link into it
   (F44 keeps that visible rather than silently retargeting). The backlinks
   are snapshotted when editing STARTS — by the time the edit ends the old
   title is gone from the store and those links no longer resolve here. */
let renameWatch = null;

function renameWatchStart(titleEl) {
  renameWatch = null;
  const id = contentIdOfTitle(titleEl);
  const n = id && store.getNode(id);
  if (!n || !n.title.trim()) return; // an untitled item can't have been linked to
  const sources = backlinksOf(id);
  if (!sources.length) return;
  renameWatch = { id, before: n.title, sources: sources.map(s => ({ ...s })) };
}
function replaceLinkText(text, from, to) {
  const key = from.trim().toLowerCase();
  return String(text).replace(BL_RE, (m, inner) =>
    inner.trim().toLowerCase() === key ? '[[' + to + ']]' : m);
}
function renameWatchEnd(titleEl) {
  const w = renameWatch;
  renameWatch = null;
  if (!w || contentIdOfTitle(titleEl) !== w.id) return;
  const n = store.getNode(w.id);
  if (!n || n.title === w.before) return;
  // a title that is empty or carries brackets can't sit inside [[ ]] at all
  if (!n.title.trim() || /[[\]]/.test(n.title)) return;
  const live = w.sources.filter(s => store.getNode(s.id));
  if (!live.length) return;
  offerRenameRewrite(w.before, n.title, live);
}
function offerRenameRewrite(from, to, sources) {
  const count = sources.length;
  bannerMutedKinds.delete('rename-links'); // every rename gets its own offer
  showBanner(
    `${count} item${count === 1 ? '' : 's'} still link${count === 1 ? 's' : ''} to “${truncate(from, 40)}”. Update ${count === 1 ? 'it' : 'them'} to “${truncate(to, 40)}”?`,
    {
      kind: 'rename-links',
      tone: 'notice',
      action: {
        label: 'Update links',
        onClick: () => {
          store.group(() => {
            for (const s of sources) {
              const src = store.getNode(s.id);
              if (!src) continue;
              if (s.inTitle) store.setTitle(s.id, replaceLinkText(src.title, from, to));
              if (s.inNote) store.setNote(s.id, replaceLinkText(src.note, from, to));
            }
          });
          hideBanner();
        },
      },
    });
}

/* --- wiring -------------------------------------------------------------- */
ipBtnEl.addEventListener('click', () => setPanelOpen(!panelOpen()));
$('#ip-close').addEventListener('click', () => setPanelOpen(false));
ipStarEl.addEventListener('click', () => {
  const id = ipTrackedId();
  if (id && id !== ROOT_ID) store.toggleStarred(id);
});
document.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  // Alt+letter reports differently across keyboard layouts (some send a dead
  // key or an accented character as e.key), so match the physical key too
  if (e.code === 'KeyI' || e.key === 'i' || e.key === 'I') {
    e.preventDefault();
    setPanelOpen(!panelOpen());
  }
});

// state lands before boot's first render, so the column never jumps
document.body.classList.toggle('panel-open', panelOpen());
ipEl.hidden = !panelOpen();
syncPanelBtn();
bootReady.then(renderInfoPanel);
