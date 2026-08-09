/* ===== 04 view =====
   Incremental DOM rendering. Each node maps to one .node element keyed by
   data-id; structural changes rebuild only the affected children container.
   Collapsed subtrees are rendered lazily on first expand.                  */

const treeEl = $('#tree');
const crumbsEl = $('#breadcrumbs');
const focusHeadEl = $('#focus-head');
const focusTitleEl = $('#focus-title');
const focusNoteEl = $('#focus-note');
const emptyHintEl = $('#empty-hint');
const searchEl = $('#search');
const saveIndicatorEl = $('#save-indicator');

const BRAND_TAGLINE = 'Infinite depth. Zero chaos.';

const view = {
  focusId: ROOT_ID,
  query: '',
  filter: null, // { matched:Set, anc:Set, under:Set, q } while searching
  filterExempt: new Set(), // ids created during this search: shown though they don't match
};

/* id → element map: nodeEl() must be O(1), not a DOM scan — it runs on
   every keystroke and every reconcile step. Entries are validated on read
   (an element may have been detached by a bulk rebuild). */
const elMap = new Map();
function nodeEl(id) {
  const el = elMap.get(id);
  if (el && el.isConnected) return el;
  if (el) elMap.delete(id);
  return null;
}
function idOfTitle(titleEl) {
  if (titleEl === focusTitleEl) return view.focusId;
  const el = titleEl.closest('.node');
  return el ? el.dataset.id : null;
}

/* --- search filter ---------------------------------------------------- */
/* Hide-completed is a CSS rule (body.hide-completed .node.completed) that takes
   the whole completed subtree off screen. The filter has to agree with it: a
   completed hit that can't be seen must not drag its ancestors into the results
   either. Reading the same body class the CSS keys off keeps the two in step. */
function completedRowsHidden() {
  return document.body.classList.contains('hide-completed');
}
function computeFilter() {
  const q = view.query.trim().toLowerCase();
  if (!q) { view.filter = null; return; }
  // a pure #tag query matches the exact tag only (#todo must not hit #todos)
  const tagRe = /^#[\w-]+$/.test(q) ? new RegExp('(^|\\s)' + q + '(?![\\w-])', 'i') : null;
  const test = tagRe
    ? s => tagRe.test(s || '')
    : s => (s || '').toLowerCase().includes(q);
  const skipCompleted = completedRowsHidden();
  const matched = new Set(), anc = new Set(), under = new Set();
  const focus = store.getNode(view.focusId);
  (function walk(n, ancIds, underMatch) {
    const isFocus = n === focus;
    // an off-screen completed row can't be a result, and neither can anything
    // inside it (the CSS hides the subtree with it)
    if (!isFocus && skipCompleted && n.completed) return;
    const hit = !isFocus && (test(n.title) || test(n.note));
    // items made during this search don't match it; keep them on screen anyway
    const kept = !isFocus && view.filterExempt.has(n.id);
    if (hit) matched.add(n.id);
    if (hit || kept) for (const a of ancIds) anc.add(a);
    const nowUnder = underMatch || hit || kept;
    if (nowUnder && !isFocus) under.add(n.id);
    const nextAnc = isFocus ? ancIds : ancIds.concat(n.id);
    for (const c of n.children) walk(c, nextAnc, nowUnder);
  })(focus, [], false);
  view.filter = { matched, anc, under, q, tagQuery: !!tagRe };
}
function nodeVisibleInFilter(n) {
  if (!view.filter) return true;
  return view.filter.under.has(n.id) || view.filter.anc.has(n.id);
}
/* Newly created items match nothing, so the filtered rebuild that follows their
   own 'children' event would render them out of existence — invisible, and
   unreachable by the caret. Exempting them keeps a new line editable where it
   was made; the exemption lasts until the query changes. */
function keepInFilter(ids) {
  if (!view.filter) return;
  let added = false;
  for (const id of [].concat(ids)) {
    // an item the filter already shows (say, a child of a match) needs nothing
    if (!id || view.filterExempt.has(id) || view.filter.under.has(id)) continue;
    view.filterExempt.add(id);
    added = true;
  }
  if (!added) return; // nothing changed: skip the rebuild
  computeFilter();
  renderTree();
}
function clearFilterExempt() {
  view.filterExempt.clear();
}

/* --- node rendering ---------------------------------------------------- */
function highlightFrag(text, q) {
  const frag = document.createDocumentFragment();
  const lower = text.toLowerCase();
  let i = 0;
  for (;;) {
    const j = lower.indexOf(q, i);
    if (j < 0) { frag.append(document.createTextNode(text.slice(i))); break; }
    if (j > i) frag.append(document.createTextNode(text.slice(i, j)));
    const m = document.createElement('mark');
    m.textContent = text.slice(j, j + q.length);
    frag.append(m);
    i = j + q.length;
  }
  return frag;
}
/* --- [[wikilinks]]: resolved by title, case-insensitive, at render time.
   The text stays exactly what the user typed (raw and rendered lengths match,
   so caret math survives the edit-mode flatten); a rename simply breaks the
   link visibly instead of silently rewriting anyone's text. */
let linkIndexDirty = true;
let linkIndex = null; // lowercased title -> id (first in document order)
store.subscribe(ev => {
  if (ev.type === 'node' || ev.type === 'children' || ev.type === 'doc') linkIndexDirty = true;
});
function resolveTitleLink(text) {
  if (linkIndexDirty || !linkIndex) {
    linkIndex = new Map();
    (function walk(n) {
      for (const c of n.children) {
        const k = (c.title || '').trim().toLowerCase();
        if (k && !linkIndex.has(k)) linkIndex.set(k, c.id);
        walk(c);
      }
    })(store.doc.root);
    linkIndexDirty = false;
  }
  return linkIndex.get(String(text).trim().toLowerCase()) || null;
}
function makeWikilink(inner) {
  const id = resolveTitleLink(inner);
  if (id) {
    const a = document.createElement('a');
    a.className = 'wikilink';
    a.href = '#' + id;
    a.textContent = '[[' + inner + ']]';
    a.title = 'Zoom to "' + inner.trim() + '"';
    return a;
  }
  const s = document.createElement('span');
  s.className = 'wikilink broken';
  s.textContent = '[[' + inner + ']]';
  s.title = 'No item titled "' + inner.trim() + '"';
  return s;
}

/* --- title inline rendering ---------------------------------------------
   Titles render an inline markdown-ish subset at rest — the note editors'
   "edit raw, render on blur" philosophy (F17), applied to titles. Formatting
   delimiters are HIDDEN in the rendered form, so rendered and raw offsets no
   longer line up. Every rendered text node is therefore recorded in titleSegs
   with the raw offset it starts at, and titleRawOffset() maps a rendered
   caret point back to a raw one when the focusin flatten swaps the DOM to
   raw text. Tags and [[wikilinks]] still render their text in full (F44).

   Grammar (F56): `code`  [[wikilink]]  [text](https://url)  **bold**
   __underline__  *italic*  _italic_  {red|colored}  {bg:red|highlighted}
   #tag — earliest match wins, ties go to the order below; bold, underline,
   italic, and color spans parse their contents recursively; code and link
   text stay literal. Links accept http(s) only, by construction. */
const titleSegs = new WeakMap(); // title el -> {segs:[{node, rawStart}], rawLen}

const TITLE_PATTERNS = [
  { re: /`([^`]+)`/, make(m, at, ctx) {
      const c = document.createElement('code');
      ctx.text(c, m[1], at + 1);
      return c;
    } },
  // [[wikilink]] before [md](link): "[[x]]" must never parse as a bracket pair
  { re: /\[\[([^\[\]]+)\]\]/, make(m, at, ctx) {
      const a = makeWikilink(m[1]); // brackets stay visible (F44)
      ctx.seg(a.firstChild, at);
      return a;
    } },
  { re: /\[([^\[\]]+)\]\((https?:\/\/[^)\s]+)\)/, make(m, at, ctx) {
      const a = document.createElement('a');
      a.className = 'tlink';
      a.href = m[2];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = m[2];
      ctx.text(a, m[1], at + 1);
      return a;
    } },
  { re: /\*\*([^*]+)\*\*/, make(m, at, ctx) {
      const b = document.createElement('strong');
      ctx.parse(b, m[1], at + 2);
      return b;
    } },
  { re: /__([^_]+)__/, make(m, at, ctx) {
      const u = document.createElement('u');
      ctx.parse(u, m[1], at + 2);
      return u;
    } },
  { re: /\*([^*]+)\*/, make(m, at, ctx) {
      const em = document.createElement('em');
      ctx.parse(em, m[1], at + 1);
      return em;
    } },
  { re: /\b_([^_]+)_\b/, make(m, at, ctx) {
      const em = document.createElement('em');
      ctx.parse(em, m[1], at + 1);
      return em;
    } },
  { re: /\{(bg:)?(red|orange|yellow|green|blue|purple)\|([^{}]*)\}/, make(m, at, ctx) {
      const s = document.createElement('span');
      s.className = (m[1] ? 'th-' : 'tc-') + m[2];
      ctx.parse(s, m[3], at + 1 + (m[1] ? 3 : 0) + m[2].length + 1);
      return s;
    } },
  // #tag: start-of-title or whitespace before the #, so URLs stay plain
  { re: /(^|\s)(#[\w-]+)/, isTag: true },
];

function titleParseInto(parent, text, rawBase, activeTag, S) {
  const emitText = (container, str, at) => {
    if (!str) return;
    const tn = document.createTextNode(str);
    S.segs.push({ node: tn, rawStart: at });
    container.append(tn);
  };
  const ctx = {
    text: emitText,
    seg: (tn, at) => S.segs.push({ node: tn, rawStart: at }),
    parse: (container, str, at) => titleParseInto(container, str, at, activeTag, S),
  };
  let rest = text, base = rawBase;
  while (rest) {
    let best = null, bestIdx = Infinity, bestPat = null;
    for (const p of TITLE_PATTERNS) {
      const m = rest.match(p.re);
      if (m && m.index < bestIdx) {
        best = m; bestIdx = m.index; bestPat = p;
        if (bestIdx === 0) break; // earlier patterns already had their chance
      }
    }
    if (!best) { emitText(parent, rest, base); break; }
    if (bestPat.isTag) {
      const chipAt = bestIdx + best[1].length; // keep the leading space plain
      emitText(parent, rest.slice(0, chipAt), base);
      const s = document.createElement('span');
      s.className = 'tag' + (activeTag && best[2].toLowerCase() === activeTag ? ' active' : '');
      s.textContent = best[2];
      s.title = 'Filter by ' + best[2];
      ctx.seg(s.firstChild, base + chipAt);
      parent.append(s);
    } else {
      emitText(parent, rest.slice(0, bestIdx), base);
      parent.append(bestPat.make(best, base + bestIdx, ctx));
    }
    rest = rest.slice(bestIdx + best[0].length);
    base += bestIdx + best[0].length;
  }
}

function titleFrag(el, text, activeTag) {
  const S = { segs: [], rawLen: text.length };
  const frag = document.createDocumentFragment();
  titleParseInto(frag, text, 0, activeTag, S);
  // plain single-run render: offsets are identical, skip the map
  if (S.segs.length === 1 && S.segs[0].rawStart === 0 && S.segs[0].node.length === text.length) {
    titleSegs.delete(el);
  } else {
    titleSegs.set(el, S);
  }
  return frag; // empty text → empty frag, so the :empty placeholder still shows
}

/* rendered caret offset → raw text offset (identity when no map exists,
   which covers plain titles and the raw-with-<mark>s search rendering) */
function titleRawOffset(el, renderedOff) {
  const S = titleSegs.get(el);
  if (!S) return renderedOff;
  let acc = 0;
  for (const s of S.segs) {
    const len = s.node.length;
    if (renderedOff <= acc + len) return s.rawStart + (renderedOff - acc);
    acc += len;
  }
  return S.rawLen;
}

function setTitleContent(el, n) {
  el.textContent = '';
  const f = view.filter;
  if (f && !f.tagQuery && f.matched.has(n.id) && (n.title || '').toLowerCase().includes(f.q)) {
    titleSegs.delete(el); // raw text + <mark>s: rendered offsets ARE raw offsets
    el.append(highlightFrag(n.title, f.q)); // text search: marks win over formatting
  } else {
    el.append(titleFrag(el, n.title || '', f && f.tagQuery ? f.q : null));
  }
}
function applyNodeState(el, n) {
  const hasKids = n.children.length > 0;
  const expanded = view.filter ? true : !n.collapsed;
  if (n.format) el.dataset.format = n.format; else delete el.dataset.format;
  if (n.color) el.dataset.color = n.color; else delete el.dataset.color;
  el.classList.toggle('completed', n.completed);
  el.classList.toggle('has-children', hasKids);
  el.classList.toggle('collapsed', hasKids && !expanded);
  el.classList.toggle('expanded', hasKids && expanded);
  if (hasKids) el.setAttribute('aria-expanded', String(expanded));
  else el.removeAttribute('aria-expanded');
  const f = view.filter;
  el.classList.toggle('dim', !!(f && f.anc.has(n.id) && !f.under.has(n.id)));
  // checklist progress: shown once any direct child is checked off
  const done = n.children.reduce((s, c) => s + (c.completed ? 1 : 0), 0);
  let badge = el.querySelector(':scope > .row > .progress');
  if (done > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'progress';
      el.querySelector(':scope > .row').append(badge);
    }
    badge.textContent = `${done}/${n.children.length}`;
  } else if (badge) {
    badge.remove();
  }
}
function buildNoteContent(n) {
  const wrap = document.createElement('div');
  wrap.className = 'note';
  wrap.append(mdRender(n.note));
  return wrap;
}
function renderNode(n, level) {
  if (!nodeVisibleInFilter(n)) return null;
  const el = document.createElement('div');
  el.className = 'node';
  el.dataset.id = n.id;
  elMap.set(n.id, el);
  el.setAttribute('role', 'treeitem');
  el.setAttribute('aria-level', level);

  const row = document.createElement('div');
  row.className = 'row';
  // hover-revealed menu handle, hung in the left gutter (absolute, so rows
  // never shift). It lives inside the .node's padding-left — see the
  // .node margin/padding note in app.css for why it can't just overflow.
  const handle = document.createElement('button');
  handle.className = 'handle';
  handle.tabIndex = -1;
  handle.textContent = '≡';
  handle.title = 'Item menu';
  const tg = document.createElement('button');
  tg.className = 'toggle';
  tg.tabIndex = -1;
  tg.textContent = '▸';
  tg.title = 'Collapse / expand';
  const bullet = document.createElement('a');
  bullet.className = 'bullet';
  bullet.href = '#' + n.id;
  bullet.tabIndex = -1;
  bullet.draggable = true;
  bullet.title = 'Click to zoom in · drag to move';
  const dot = document.createElement('span');
  dot.className = 'dot';
  bullet.append(dot);
  const title = document.createElement('div');
  title.className = 'title';
  // NOT contenteditable at rest: with 20k editable roots, focusing one costs
  // ~100ms in Chrome. Editing is enabled per-title on mousedown/keyboard-nav
  // (activateTitle) and disabled again on focusout.
  title.spellcheck = false;
  setTitleContent(title, n);
  row.append(handle, tg, bullet, title);
  el.append(row);

  if (n.note) el.append(buildNoteContent(n));

  const kids = document.createElement('div');
  kids.className = 'children';
  kids.setAttribute('role', 'group');
  el.append(kids);

  applyNodeState(el, n);
  const expand = view.filter ? true : !n.collapsed;
  if (expand && n.children.length) fillChildren(kids, n, level);
  return el;
}
function fillChildren(kidsEl, n, level) {
  kidsEl.dataset.filled = '1';
  for (const c of n.children) {
    const ce = renderNode(c, level + 1);
    if (ce) kidsEl.append(ce);
  }
}

/* --- region renderers --------------------------------------------------- */
function renderTree() {
  elMap.clear();
  treeEl.textContent = '';
  const focus = store.getNode(view.focusId);
  const frag = document.createDocumentFragment();
  for (const c of focus.children) {
    const el = renderNode(c, 1);
    if (el) frag.append(el);
  }
  treeEl.append(frag);
  updateEmptyHint();
}
function renderCrumbs() {
  crumbsEl.textContent = '';
  if (view.focusId === ROOT_ID) {
    const s = document.createElement('span');
    s.className = 'crumb current app-name';
    s.textContent = '37nodes';
    const tag = document.createElement('span');
    tag.className = 'tagline';
    tag.textContent = BRAND_TAGLINE;
    crumbsEl.append(s, tag);
    // the rotating tagline (module 13) owns this text once it has booted;
    // a re-render mid-reveal hands it the frame it was on
    taglineAdopt(tag);
    return;
  }
  const home = document.createElement('a');
  home.className = 'crumb';
  home.href = '#';
  home.textContent = 'Home';
  crumbsEl.append(home);
  const chain = [...store.ancestorsOf(view.focusId).slice(1), store.getNode(view.focusId)];
  chain.forEach((n, i) => {
    const last = i === chain.length - 1;
    const a = document.createElement(last ? 'span' : 'a');
    a.className = 'crumb' + (last ? ' current' : '');
    if (!last) a.href = '#' + n.id;
    a.textContent = truncate(n.title, 40) || 'Untitled';
    crumbsEl.append(a);
  });
}
function renderFocusHead() {
  if (view.focusId === ROOT_ID) { focusHeadEl.hidden = true; return; }
  focusHeadEl.hidden = false;
  const n = store.getNode(view.focusId);
  if (document.activeElement !== focusTitleEl) focusTitleEl.textContent = n.title;
  if (!focusNoteEl.querySelector('.note-edit:focus')) {
    focusNoteEl.textContent = '';
    if (n.note) focusNoteEl.append(mdRender(n.note));
  }
}
function updateEmptyHint() {
  const focus = store.getNode(view.focusId);
  const empty = focus.children.length === 0;
  emptyHintEl.hidden = !(empty && !view.filter);
  if (!emptyHintEl.hidden) {
    emptyHintEl.textContent = view.focusId === ROOT_ID
      ? 'Empty outline. Click here or press Enter to start.'
      : 'Nothing inside yet. Click here to add an item.';
  }
  if (view.filter && treeEl.children.length === 0) {
    emptyHintEl.hidden = false;
    emptyHintEl.textContent = 'No matches.';
  }
}
function renderAll() {
  if (!store.getNode(view.focusId)) view.focusId = ROOT_ID;
  computeFilter();
  renderCrumbs();
  renderFocusHead();
  renderTree();
}

function fixLevels(el, level) {
  el.setAttribute('aria-level', level);
  const kids = el.querySelector(':scope > .children');
  for (const c of kids.children) fixLevels(c, level + 1);
}
/* Keyed reconciliation: reuse existing rows by id, move/insert/remove only
   what changed. This is what keeps Enter O(1)-ish in a 20k-node outline. */
function reconcileChildren(container, parentNode, level) {
  let expected = container.firstElementChild;
  for (const c of parentNode.children) {
    let el = (expected && expected.dataset.id === c.id) ? expected : nodeEl(c.id);
    if (el && el === expected) {
      expected = expected.nextElementSibling;
    } else if (el) {
      container.insertBefore(el, expected); // reuse (subtree comes along intact)
    } else {
      el = renderNode(c, level + 1);
      container.insertBefore(el, expected);
    }
    if (el.getAttribute('aria-level') !== String(level + 1)) fixLevels(el, level + 1);
  }
  const valid = new Set(parentNode.children.map(c => c.id));
  for (const el of [...container.children]) {
    const cid = el.dataset.id;
    if (valid.has(cid)) continue;
    const n = store.getNode(cid);
    const sp = n && store.getParent(cid);
    // if the node still exists under another parent, that parent's own
    // 'children' event (emitted in the same action) will re-home this element
    if (n && sp && sp.id !== parentNode.id) continue;
    el.remove();
  }
}
function renderChildrenOf(id) {
  computeFilter(); // structure may have changed what matches show
  if (view.filter) { renderTree(); return; } // search view: rebuild filtered tree
  const parentNode = store.getNode(id);
  if (!parentNode) { renderAll(); return; }
  if (id === view.focusId) {
    reconcileChildren(treeEl, parentNode, 0);
    updateEmptyHint();
    return;
  }
  const el = nodeEl(id);
  if (!el) return; // inside a collapsed region; will render lazily on expand
  const kids = el.querySelector(':scope > .children');
  const level = parseInt(el.getAttribute('aria-level'), 10) || 1;
  applyNodeState(el, parentNode);
  if (parentNode.collapsed || !parentNode.children.length) {
    kids.textContent = '';
    delete kids.dataset.filled;
    updateEmptyHint();
    return;
  }
  kids.dataset.filled = '1';
  reconcileChildren(kids, parentNode, level);
  updateEmptyHint();
}

function updateRow(id, isTypingEcho) {
  if (id === view.focusId) { renderFocusHead(); renderCrumbs(); return; }
  const el = nodeEl(id);
  const n = store.getNode(id);
  if (!el || !n) return;
  const title = el.querySelector(':scope > .row > .title');
  // While being edited the title is RAW text and the DOM is the source of
  // truth: rebuild it only when the store text actually differs (programmatic
  // edits like an Enter split — the store wins even while focused). A
  // same-text 'node' event (completion, format, color) must not touch the
  // DOM under the caret — rendering formatting into an editing title would
  // hide delimiters, and the next input would store the delimiter-less text.
  const titleEditing = title.isContentEditable && title === document.activeElement;
  if (titleEditing) {
    if (!isTypingEcho && title.textContent !== n.title) title.textContent = n.title;
  } else {
    setTitleContent(title, n);
  }
  // note: rebuild rendered note unless its editor is focused
  let noteWrap = el.querySelector(':scope > .note');
  const editing = noteWrap && noteWrap.querySelector('.note-edit:focus');
  if (!editing) {
    if (noteWrap) noteWrap.remove();
    if (n.note) el.querySelector(':scope > .row').after(buildNoteContent(n));
  }
  applyNodeState(el, n);
  // completion toggles change the parent's progress badge too
  const p = store.getParent(id);
  if (p && p.id !== ROOT_ID) {
    const pe = nodeEl(p.id);
    if (pe) applyNodeState(pe, p);
  }
}

/* --- note editor -------------------------------------------------------- */
function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
function noteContainerFor(id) {
  if (id === view.focusId) return focusNoteEl;
  const el = nodeEl(id);
  if (!el) return null;
  let wrap = el.querySelector(':scope > .note');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'note';
    el.querySelector(':scope > .row').after(wrap);
  }
  return wrap;
}
function openNoteEditor(id) {
  const n = store.getNode(id);
  const container = noteContainerFor(id);
  if (!n || !container) return;
  if (container.querySelector('.note-edit')) {
    container.querySelector('.note-edit').focus();
    return;
  }
  container.textContent = '';
  const ta = document.createElement('textarea');
  ta.className = 'note-edit';
  ta.value = n.note || '';
  ta.rows = 1;
  ta.spellcheck = false;
  ta.placeholder = 'Add a note… (markdown)';
  container.append(ta);
  autoGrow(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function closeNoteEditor(ta) {
  const container = ta.parentElement;
  if (!container) return;
  const isFocusNote = container === focusNoteEl;
  const id = isFocusNote ? view.focusId : (container.closest('.node') || {}).dataset?.id;
  if (!id) { container.remove(); return; }
  const n = store.getNode(id);
  const noteText = n ? n.note : '';
  container.textContent = '';
  if (noteText) container.append(mdRender(noteText));
  else if (!isFocusNote) container.remove();
}

/* --- focus helpers -------------------------------------------------------- */
function revealNode(id) {
  for (const a of store.ancestorsOf(id)) {
    if (a.id !== ROOT_ID && a.collapsed) store.setCollapsed(a.id, false);
  }
}
function activateTitle(t, off = 0) {
  if (t.contentEditable !== 'true') t.contentEditable = 'true';
  t.focus();
  setCaret(t, off === 'end' ? t.textContent.length : clamp(off, 0, t.textContent.length));
  t.scrollIntoView({ block: 'nearest' });
}
function focusNodeTitle(id, off = 0) {
  if (!store.getNode(id)) return;
  if (id === view.focusId) {
    focusTitleEl.focus();
    setCaret(focusTitleEl, off === 'end' ? focusTitleEl.textContent.length : off);
    return;
  }
  let el = nodeEl(id);
  if (!el) { revealNode(id); el = nodeEl(id); }
  if (!el) return;
  activateTitle(el.querySelector(':scope > .row > .title'), off);
}
/* nearest visible title before/after el in document order — O(distance),
   unlike visibleTitles() which scans the whole tree */
function siblingTitle(el, dir) {
  const walker = document.createTreeWalker($('#page'), NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => (n.classList.contains('title') && n.offsetParent !== null)
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  walker.currentNode = el;
  return dir > 0 ? walker.nextNode() : walker.previousNode();
}
function visibleTitles() {
  const list = [];
  if (!focusHeadEl.hidden) list.push(focusTitleEl);
  for (const t of treeEl.querySelectorAll('.title')) {
    if (t.offsetParent !== null) list.push(t);
  }
  return list;
}

/* --- banner & save indicator --------------------------------------------- */
const bannerEl = $('#banner');
const bannerMsgEl = $('#banner-msg');
const bannerActionEl = $('#banner-export');
let bannerKind = null; // 'storage' | 'notice' | 'fsbackup' | 'multitab' | null (generic)
let bannerActionFn = null; // custom action; null = default (export JSON)
const bannerMutedKinds = new Set(); // kinds the user dismissed this session
function showBanner(msg, { kind = null, action = null } = {}) {
  if (kind && bannerMutedKinds.has(kind)) return;
  bannerMsgEl.textContent = msg;
  bannerKind = kind;
  bannerActionFn = action ? action.onClick : null;
  bannerActionEl.textContent = action ? action.label : 'Export now';
  bannerEl.classList.toggle('notice', kind === 'notice');
  bannerEl.hidden = false;
}
function hideBanner({ mute = false } = {}) {
  if (mute && bannerKind) bannerMutedKinds.add(bannerKind);
  bannerEl.hidden = true;
  bannerKind = null;
  bannerActionFn = null;
}
function updateSaveIndicator(state) {
  saveIndicatorEl.classList.toggle('error', state === 'error');
  saveIndicatorEl.textContent =
    state === 'saving' ? 'Saving…' : state === 'error' ? '⚠ Not saved' : 'Saved';
  saveIndicatorEl.title = state === 'error'
    ? 'Saving failed. Click to retry and see details' : '';
}

/* --- store event wiring ----------------------------------------------------- */
store.subscribe(ev => {
  switch (ev.type) {
    case 'node':
      updateRow(ev.id, !!ev.typing);
      break;
    case 'children':
      if (!store.getNode(view.focusId)) {
        location.hash = ''; // focus node was deleted; hashchange re-renders at root
      } else {
        renderChildrenOf(ev.id);
      }
      break;
    case 'collapse': {
      const el = nodeEl(ev.id);
      const n = store.getNode(ev.id);
      if (!el || !n) break;
      const kids = el.querySelector(':scope > .children');
      if (!n.collapsed && !kids.dataset.filled && n.children.length) {
        const level = parseInt(el.getAttribute('aria-level'), 10) || 1;
        fillChildren(kids, n, level);
      }
      if (!n.collapsed) {
        kids.classList.add('just-expanded');
        setTimeout(() => kids.classList.remove('just-expanded'), 250);
      }
      applyNodeState(el, n);
      break;
    }
    case 'doc':
      renderAll();
      break;
    case 'save':
      updateSaveIndicator(ev.state);
      if (ev.state === 'error') {
        showBanner('Saving failed (storage may be full or blocked). Your outline is safe in this tab, and you can export a backup from the ☰ menu.', { kind: 'storage' });
      } else if (ev.state === 'saved' && ev.recovered) {
        bannerMutedKinds.delete('storage'); // saves work again; a future failure may warn once more
        if (bannerKind === 'storage') hideBanner();
      }
      break;
    case 'remote-save':
      // Cross-tab guard: another tab just saved this outline. Warn-only —
      // dismissing mutes the kind for the session. The default banner
      // action (Export now) is deliberate: a fresh backup is the right
      // move before a potential conflict.
      showBanner('This outline is open in another tab, which just saved changes. Edits here may overwrite it — best to use one tab at a time.', { kind: 'multitab' });
      break;
  }
});
