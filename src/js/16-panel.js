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
let blIndex = null; // targetId -> [{id, inTitle, inNote, lines}] — lines: the note lines holding the link

function scanLinks(text, fn) {
  if (!text) return;
  BL_RE.lastIndex = 0;
  for (let m; (m = BL_RE.exec(text)); ) fn(m[1]);
}
function blMark(map, targetId, sourceId, where, line) {
  let arr = map.get(targetId);
  if (!arr) map.set(targetId, arr = []);
  let e = arr.find(x => x.id === sourceId); // few sources per target: linear is fine
  if (!e) arr.push(e = { id: sourceId, inTitle: false, inNote: false, lines: [] });
  e[where] = true;
  // the context shown under a backlink (F85): a few note lines, each once
  if (line && e.lines.length < 3 && !e.lines.includes(line)) e.lines.push(line);
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
        // line by line, so each hit can carry the line it sits in
        if (c.note) {
          for (const raw of c.note.split('\n')) {
            const line = raw.trim();
            if (!line.includes('[[')) continue;
            scanLinks(line, t => {
              const id = resolveTitleLink(t);
              if (id && id !== c.id) blMark(map, id, c.id, 'inNote', line);
            });
          }
        }
      }
      walk(c);
    }
  })(store.doc.root);
  blIndex = map;
  blDirty = false;
  return blIndex;
}
function backlinksOf(id) { return backlinkIndex().get(id) || []; }

/* With Hide completed on (F69) the panel does not list a source the outline
   cannot show: a click on it would jump to a row that is not there. A source
   is hidden when it, or anything above it, is completed — the CSS removes the
   whole subtree. A mirror's completion is its original's. */
function sourceHidden(id) {
  if (!completedRowsHidden()) return false;
  const done = x => { const c = store.mirrorContent(x) || x; return !!c.completed; };
  const n = store.getNode(id);
  if (!n) return false;
  if (done(n)) return true;
  return store.ancestorsOf(id).some(a => a.id !== ROOT_ID && done(a));
}
function shownBacklinks(id) { return backlinksOf(id).filter(s => !sourceHidden(s.id)); }
function shownMirrors(id) { return store.mirrorsOf(id).filter(m => !sourceHidden(m.id)); }
/* The ids the `links:` operator accepts for a title (F78): the item the title
   names (resolved exactly as a [[link]] is, so duplicates go to the first),
   everything that links to it, and everything it links to. A mirror row is
   accepted through its content id, so mirrors of any of these come with them. */
function linkedIdsFor(title) {
  const ids = new Set();
  const target = resolveTitleLink(title);
  const n = target && store.getNode(target);
  if (!n) return ids;
  ids.add(target);
  for (const s of backlinksOf(target)) ids.add(s.id);
  const take = t => { const id = resolveTitleLink(t); if (id) ids.add(id); };
  scanLinks(n.title, take);
  scanLinks(n.note, take);
  return ids;
}
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
let ipActiveRowId = null; // the row it was in (structural id): which instance of a mirrored item

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
  if (!s || !(key in s)) return key === 'item' || key === 'zoom'; // first run: item details only
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
  const landed = store.getNode(id);
  ipActiveId = ((landed && store.mirrorContent(landed)) || landed).id; // a mirror row tracks its original
  ipActiveRowId = id;
  focusNodeTitle(id, 'end');
  renderInfoPanel();
}

/* Panel rows that name an ITEM (starred, linked from) — F84. By default they
   zoom: an item with children becomes the page, and a leaf, which would make
   an empty page with only a header, zooms to its parent with the leaf
   focused, so you land among its siblings. The preference
   (prefs.panelLinks === 'reveal') restores the older behaviour of revealing
   the row where it lives without changing zoom; Alt+click does whichever one
   the preference does not. Rows that name a PLACE (a mirror in "Also appears
   in") always reveal: zooming to the original would be the same for all. */
function panelZooms() { return prefs.panelLinks !== 'reveal'; }
function panelGo(id, ev) {
  const flip = !!(ev && ev.altKey);
  if (panelZooms() !== flip) zoomToItem(id);
  else jumpToNode(id);
}
function zoomToItem(id) {
  const n = store.getNode(id);
  if (!n || id === ROOT_ID) return;
  const target = store.mirrorContent(n) || n; // a mirror zooms to its original
  clearSearch(false);
  let zoomId = target.id;
  if (!target.children.length) {
    const p = store.getParent(target.id);
    zoomId = p ? p.id : ROOT_ID;
  }
  const hash = zoomId === ROOT_ID ? '' : '#' + zoomId;
  if (view.focusId !== zoomId) {
    location.hash = hash;
    applyFocusFromHash(); // sync render; the later hashchange event no-ops
  }
  revealNode(target.id);
  ipActiveId = target.id;
  ipActiveRowId = target.id;
  focusNodeTitle(target.id, 'end'); // the zoom header when it is the zoomed item
  renderInfoPanel();
}

function ipTrackedId() {
  return (ipActiveId && store.getNode(ipActiveId)) ? ipActiveId : view.focusId;
}

/* A line of text with the links that point at `targetId` marked (F85). Other
   links in the line stay as typed. A long line is cut to a window around the
   first hit, so the link is always in view. List markers and quote/heading
   prefixes are dropped — they are note formatting, not context. */
function ctxFrag(text, targetId, max = 110) {
  const t = String(text).replace(/^\s*(?:[-*+]|\d+\.|>+|#{1,6})\s+/, '');
  const re = new RegExp(BL_RE.source, 'g');
  const hits = [];
  for (let m; (m = re.exec(t)); ) {
    if (resolveTitleLink(m[1]) === targetId) hits.push([m.index, m.index + m[0].length]);
  }
  let from = 0, to = t.length;
  if (t.length > max) {
    from = Math.max(0, (hits.length ? hits[0][0] : 0) - 36);
    to = Math.min(t.length, from + max);
    from = Math.max(0, to - max);
  }
  const frag = document.createDocumentFragment();
  if (from > 0) frag.append(document.createTextNode('…'));
  let pos = from;
  for (const [s, e] of hits) {
    if (e <= from) continue;
    if (s >= to) break;
    const s0 = Math.max(s, from), e0 = Math.min(e, to);
    if (s0 > pos) frag.append(document.createTextNode(t.slice(pos, s0)));
    const mk = document.createElement('mark');
    mk.textContent = t.slice(s0, e0);
    frag.append(mk);
    pos = e0;
  }
  if (pos < to) frag.append(document.createTextNode(t.slice(pos, to)));
  if (to < t.length) frag.append(document.createTextNode('…'));
  return frag;
}

/* One backlink: the source's title (with the link marked when it is in the
   title), then the note line or lines the link sits in, then where it lives. */
function ipBacklinkRow(s, targetId) {
  const src = store.getNode(s.id);
  const b = document.createElement('button');
  b.className = 'ip-row ip-bl';
  b.title = src.title || 'Untitled';
  const m = document.createElement('div');
  m.className = 'ip-row-main';
  if (s.inTitle) m.append(ctxFrag(src.title, targetId, 70));
  else m.textContent = truncate(src.title, 60) || 'Untitled';
  b.append(m);
  for (const line of s.lines || []) {
    const c = document.createElement('div');
    c.className = 'ip-row-ctx';
    c.append(ctxFrag(line, targetId));
    b.append(c);
  }
  const sub = document.createElement('div');
  sub.className = 'ip-row-sub';
  sub.textContent = ((s.lines || []).length || !s.inNote || s.inTitle ? '' : 'in a note · ') + pathOf(s.id);
  b.append(sub);
  b.addEventListener('click', e => panelGo(s.id, e));
  return b;
}

function ipItemBody(body, id, n, rowId = null) {
  // --- linked from ---
  const back = shownBacklinks(id);
  body.append(ipLabel(back.length
    ? `Linked from ${back.length} item${back.length === 1 ? '' : 's'}`
    : 'Linked from'));
  if (!back.length) {
    body.append(ipHint('Nothing links here yet. Type [[ in any item to link to this one.'));
  } else {
    for (const s of back) {
      const src = store.getNode(s.id);
      if (!src) continue;
      body.append(ipBacklinkRow(s, id));
    }
  }

  if (back.length || linksOutOf(n)) {
    body.append(ipRow('Show only linked items', 'Alt+L', () => filterToLinked(id)));
  }

  // --- every place this item appears (F83) ---
  // The original first, then each mirror, whichever of them the caret is in:
  // a mirror row tracks its original, so without the original's own place in
  // the list there would be no way to say where "the real one" lives, and no
  // way to mark which row you are standing in.
  const mirrors = shownMirrors(id);
  if (mirrors.length) {
    const places = [];
    if (!sourceHidden(id)) places.push({ rowId: id, glyph: '◆', role: 'the original' });
    for (const m of mirrors) places.push({ rowId: m.id, glyph: '◇', role: 'a mirror' });
    body.append(ipLabel(`Also appears in ${places.length} place${places.length === 1 ? '' : 's'}`));
    for (const p of places) {
      const here = p.rowId === rowId;
      const row = ipRow(`${p.glyph} ${pathOf(p.rowId)}`,
        here ? `${p.role} · you are here` : p.role, () => jumpToNode(p.rowId));
      if (here) row.classList.add('on');
      body.append(row);
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
      ipRow(truncate(it.title, 40) || 'Untitled', pathOf(it.id), e => panelGo(it.id, e)));
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
  const tags = tagsForPanel(view.focusId);
  if (!tags.length) {
    body.append(ipHint(view.focusId === ROOT_ID
      ? 'No tags yet. Type # in any item to tag it — the list of tags you already use appears as you type.'
      : 'No tags in this part of the outline. Zoom out to see the rest.'));
    return;
  }
  const cloud = document.createElement('div');
  cloud.className = 'ip-tags';
  const lit = view.filter ? view.filter.tags : null; // every positive tag in the query
  for (const t of tags) {
    const b = document.createElement('button');
    b.className = 'ip-tag' + (lit && lit.has(t.tag.toLowerCase()) ? ' active' : '');
    b.title = `${t.count} item${t.count === 1 ? '' : 's'} · click to filter · Shift+click to add to the search`;
    b.append(document.createTextNode(t.tag));
    const c = document.createElement('sup');
    c.textContent = String(t.count);
    b.append(c);
    b.addEventListener('click', e => toggleTagFilter(t.tag, e.shiftKey));
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
    ipItemBody(body, id, n, ipActiveRowId);
  });
  // The zoomed-into item gets the same treatment while the caret is on
  // something else inside it: its links and mirrors are the ones you came
  // here for, and the caret is rarely on the heading itself. Shut, the
  // header carries what those lists would hold.
  const fid = view.focusId;
  const fn = store.getNode(fid);
  if (fid !== ROOT_ID && fn && id !== fid) {
    ipSection('zoom', 'Zoomed into', shownBacklinks(fid).length + shownMirrors(fid).length, body => {
      const t = document.createElement('div');
      t.className = 'ip-zoom-title';
      t.textContent = truncate(fn.title, 60) || 'Untitled';
      t.title = fn.title || 'Untitled';
      body.append(t);
      ipItemBody(body, fid, fn);
    });
  }
  ipSection('starred', 'Starred', starredItems().length, ipStarredBody);
  ipSection('saved', 'Saved searches', ssList().length, ipSavedBody);
  ipSection('tags', view.focusId === ROOT_ID ? 'Tags' : 'Tags in this view',
    tagsForPanel(view.focusId).length, ipTagsBody);
}
const ipRefresh = debounce(renderInfoPanel, 120);

/* --- what the panel follows: the caret ---------------------------------- */
document.addEventListener('focusin', e => {
  const t = e.target.closest?.('.title');
  const ta = !t && e.target.closest?.('.note-edit');
  const id = t ? contentIdOfTitle(t) : ta ? contentIdOfNoteEditor(ta) : null;
  // the structural row too: the same item can sit in several places
  let rowId = null;
  if (t) rowId = t === focusTitleEl ? view.focusId : idOfTitle(t);
  else if (ta) rowId = ta.parentElement === focusNoteEl ? view.focusId : ta.closest('.node')?.dataset.id || null;
  if (id && (id !== ipActiveId || rowId !== ipActiveRowId)) {
    ipActiveId = id;
    ipActiveRowId = rowId;
    ipRefresh();
  }
});
window.addEventListener('hashchange', () => {
  // zooming somewhere else is a change of subject: drop a tracked item that
  // the new scope no longer contains, so the panel falls back to the zoom
  // target. (Runs after 09's applyFocusFromHash, so view.focusId is current.)
  if (ipActiveId && ipActiveId !== view.focusId && !store.isDescendant(ipActiveId, view.focusId)) {
    ipActiveId = null;
    ipActiveRowId = null;
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
  offerRenameRewrite(w.before, n.title, live, w.id);
}
/* Declining is only "the links break" while the old title is now unused.
   With a duplicate in the document the index simply resolves that title to
   the OTHER item, so the links quietly land somewhere new — the one case
   where F44's promise (rename breaks links visibly rather than silently
   retargeting them) does not hold on its own. Name the item they would move
   to, by PATH: naming it by title would just repeat the title they share. */
function renameTwin(oldTitle, renamedId) {
  const id = resolveTitleLink(oldTitle);
  // a case- or whitespace-only rename still resolves to the item itself
  return id && id !== renamedId ? id : null;
}
function offerRenameRewrite(from, to, sources, renamedId) {
  const count = sources.length;
  const one = count === 1;
  const twinId = renameTwin(from, renamedId);
  let msg = `${count} item${one ? '' : 's'} still link${one ? 's' : ''} to “${truncate(from, 40)}”. Update ${one ? 'it' : 'them'} to “${truncate(to, 40)}”?`;
  if (twinId) {
    msg += ` Another item is also called “${truncate(from, 40)}” (${pathOf(twinId)}) — left alone, ${one ? 'that link now points' : 'those links now point'} there instead.`;
  }
  bannerMutedKinds.delete('rename-links'); // every rename gets its own offer
  showBanner(msg,
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
  if (altChord(e, 'KeyI')) {
    e.preventDefault();
    setPanelOpen(!panelOpen());
  }
});

/* --- resizable: drag the panel's left edge; double-click resets ----------
   The width is one CSS variable (--panel-w) that the panel, the body
   padding and the fixed chrome all key off, so resizing is writing that
   variable. The pref holds a number; absent means the stylesheet default. */
const IP_W_MIN = 220;
const ipResizeEl = $('#ip-resize');
function ipMaxWidth() { // never let the panel squeeze the outline out
  // a window that reports no width yet (hidden tab, pre-layout) constrains
  // nothing: clamping the saved width against it would shrink it to the
  // minimum on every such load
  const vw = window.innerWidth || Infinity;
  return Math.max(IP_W_MIN, Math.min(640, vw - 360));
}
function applyPanelWidth(w) {
  if (w) document.documentElement.style.setProperty('--panel-w', clamp(w, IP_W_MIN, ipMaxWidth()) + 'px');
  else document.documentElement.style.removeProperty('--panel-w');
}
ipResizeEl.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault();
  ipResizeEl.setPointerCapture(e.pointerId);
  document.body.classList.add('ip-resizing');
  let w = null;
  const move = ev => {
    w = clamp(Math.round(window.innerWidth - ev.clientX), IP_W_MIN, ipMaxWidth());
    applyPanelWidth(w);
  };
  const up = () => {
    ipResizeEl.removeEventListener('pointermove', move);
    ipResizeEl.removeEventListener('pointerup', up);
    ipResizeEl.removeEventListener('pointercancel', up);
    document.body.classList.remove('ip-resizing');
    if (w) { prefs.panelWidth = w; savePrefs(); }
  };
  ipResizeEl.addEventListener('pointermove', move);
  ipResizeEl.addEventListener('pointerup', up);
  ipResizeEl.addEventListener('pointercancel', up);
});
ipResizeEl.addEventListener('dblclick', () => {
  delete prefs.panelWidth;
  savePrefs();
  applyPanelWidth(null);
});
applyPanelWidth(prefs.panelWidth);

// state lands before boot's first render, so the column never jumps
document.body.classList.toggle('panel-open', panelOpen());
ipEl.hidden = !panelOpen();
syncPanelBtn();
bootReady.then(renderInfoPanel);
