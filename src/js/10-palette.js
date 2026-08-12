/* ===== 10 palette =====
   Ctrl+K fuzzy jump: type a few characters of any title, Enter to zoom there.
   The candidate index is snapshotted on open — the dialog is modal, so the
   document cannot change underneath it.

   Alt+M runs the same picker in MOVE mode (F67): the pick is a destination,
   and accepting files the current item under it as its last child. Same
   matcher, same keys; only the candidate set and what Enter does differ. */

const palDialogEl = $('#palette-dialog');
const palInputEl = $('#palette-input');
const palResultsEl = $('#palette-results');
let palItems = [];  // [{id, title, path}] — every node except the root
let palShown = [];  // scored results currently rendered
let palSel = 0;
let palMode = 'jump'; // 'jump' | 'move'
let palMoveId = null; // in move mode: the node being moved

function paletteIndex() {
  const items = [];
  (function walk(n, path) {
    for (const c of n.children) {
      items.push({ id: c.id, title: c.title, path, updatedAt: c.updatedAt });
      const label = truncate(c.title, 30) || 'Untitled';
      walk(c, path ? `${path} › ${label}` : label);
    }
  })(store.doc.root, '');
  return items;
}

/* Destinations for a move. Illegal targets are filtered OUT rather than
   refused on accept: store.move would return false for a cycle, but a picker
   that offers a destination and then quietly does nothing is a bad picker.
   Skipping the moved node also skips its whole subtree — every node under it
   is exactly the set move() rejects. Mirrors are left out because dropping
   INTO one already files the item under the original (07-dnd), so listing
   them would show two rows for one real destination.
   'Top level' has to be synthesised: the walk starts AT the root and so can
   never offer it, leaving no way to file something back out to the top. */
function moveIndex(selfId) {
  const items = [{ id: ROOT_ID, title: 'Top level', path: '', top: true }];
  (function walk(n, path) {
    for (const c of n.children) {
      if (c.id === selfId) continue; // the node itself, and all of its subtree
      if (!c.mirrorOf) items.push({ id: c.id, title: c.title, path, updatedAt: c.updatedAt });
      const label = truncate(c.title, 30) || 'Untitled';
      walk(c, path ? `${path} › ${label}` : label);
    }
  })(store.doc.root, '');
  return items;
}

/* substring beats subsequence; word starts and tight runs beat scatter */
function fuzzyMatch(q, title) {
  const t = title.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) {
    let score = 200 - Math.min(at, 50);
    if (at === 0 || /[^\w]/.test(t[at - 1])) score += 40;
    return { score: score - Math.min(title.length, 100) / 5, spans: [[at, q.length]] };
  }
  let ti = 0, score = 0;
  const spans = [];
  for (const ch of q) {
    const j = t.indexOf(ch, ti);
    if (j < 0) return null;
    if (spans.length && j === ti) { spans[spans.length - 1][1]++; score += 8; }
    else {
      spans.push([j, 1]);
      score += (j === 0 || /[^\w]/.test(t[j - 1])) ? 12 : 2;
      score -= Math.min(j - ti, 20) / 2;
    }
    ti = j + 1;
  }
  return { score: score - Math.min(title.length, 100) / 5, spans };
}

/* title text with the matched characters wrapped in <mark> (shared with the
   [[link]] autocomplete, which scores with the same fuzzyMatch) */
function matchFrag(title, spans) {
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const [s, len] of spans) {
    if (s > pos) frag.append(document.createTextNode(title.slice(pos, s)));
    const m = document.createElement('mark');
    m.textContent = title.slice(s, s + len);
    frag.append(m);
    pos = s + len;
  }
  frag.append(document.createTextNode(title.slice(pos)));
  return frag;
}

function palHint(text) {
  const el = document.createElement('div');
  el.className = 'pal-hint';
  el.textContent = text;
  palResultsEl.append(el);
}
function renderPalette() {
  const q = palInputEl.value.trim().toLowerCase();
  palResultsEl.textContent = '';
  palShown = [];
  palSel = 0;
  if (!q) {
    // empty query: the 12 most recently edited items, ready to act on. In move
    // mode 'Top level' is pinned first — it has no edit time to sort by, and
    // it is the one destination someone reaches for without typing.
    const recent = palItems.filter(it => it.title && !it.top)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 12);
    const top = palMode === 'move' ? palItems.filter(it => it.top) : [];
    palShown = [...top, ...recent]
      .map(it => ({ id: it.id, title: it.title, path: it.path, spans: [] }));
    palHint(palMode === 'move'
      ? 'Pick where it should live — it becomes the last item inside.'
      : palShown.length ? 'Recently edited' : 'Type to jump to any item by title.');
  } else {
    const scored = [];
    for (let i = 0; i < palItems.length; i++) {
      const m = fuzzyMatch(q, palItems[i].title);
      if (m) scored.push({ id: palItems[i].id, title: palItems[i].title, path: palItems[i].path, score: m.score, spans: m.spans, ord: i });
    }
    scored.sort((a, b) => b.score - a.score || a.title.length - b.title.length || a.ord - b.ord);
    palShown = scored.slice(0, 50);
    if (!palShown.length) {
      palHint(palMode === 'move' ? 'No matching destination.' : 'No matching items.');
      return;
    }
  }
  palShown.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'pal-item' + (i === palSel ? ' sel' : '');
    row.dataset.idx = i;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(i === palSel));
    const tEl = document.createElement('div');
    tEl.className = 'pal-title';
    tEl.append(matchFrag(r.title, r.spans));
    row.append(tEl);
    if (r.path) {
      const p = document.createElement('div');
      p.className = 'pal-path';
      p.textContent = r.path;
      row.append(p);
    }
    palResultsEl.append(row);
  });
}

function palSetSel(i) {
  if (!palShown.length) return;
  palSel = clamp(i, 0, palShown.length - 1);
  $$('.pal-item', palResultsEl).forEach((el, k) => {
    el.classList.toggle('sel', k === palSel);
    el.setAttribute('aria-selected', String(k === palSel));
  });
  const sel = palResultsEl.querySelector('.pal-item.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function paletteAccept(i) {
  return palMode === 'move' ? paletteMove(i) : paletteGo(i);
}

function paletteGo(i) {
  const r = palShown[i];
  palDialogEl.close();
  if (!r || !store.getNode(r.id)) return;
  clearSearch(false);
  if (view.focusId !== r.id) {
    location.hash = '#' + r.id;
    applyFocusFromHash(); // sync render; the later hashchange event no-ops
  }
  focusNodeTitle(r.id, 'end');
}

function paletteMove(i) {
  const r = palShown[i];
  const id = palMoveId;
  palDialogEl.close();
  if (!r || !id) return;
  const dest = store.getNode(r.id);
  if (!dest || !store.getNode(id)) return;
  store.move(id, dest.id, dest.children.length); // nest as the last item inside
  // Land on it wherever it now is — the panel's own rule (expand what needs
  // expanding, change zoom only if it left the scope). Unconditional: moving
  // an item to the end of the parent it already ends is a no-op, and losing
  // the caret over that would read as the command having failed.
  jumpToNode(id);
}

/* --- opening ------------------------------------------------------------ */
const PAL_JUMP_PH = palInputEl.placeholder;

function palShow() {
  palInputEl.value = '';
  renderPalette();
  palDialogEl.showModal();
  palInputEl.focus();
}
function openPalette() {
  if (palDialogEl.open) { palInputEl.focus(); palInputEl.select(); return; }
  palMode = 'jump';
  palMoveId = null;
  palItems = paletteIndex();
  palInputEl.placeholder = PAL_JUMP_PH;
  palDialogEl.setAttribute('aria-label', 'Jump to item');
  palShow();
}
function openMovePalette(id) {
  if (palDialogEl.open) return;
  const n = id && store.getNode(id);
  if (!n || id === ROOT_ID) return; // the root is the document, not an item
  palMode = 'move';
  palMoveId = id;
  palItems = moveIndex(id);
  // a mirror owns no text: name it by what the row shows, while still moving
  // the mirror itself
  const label = truncate((store.mirrorContent(n) || n).title, 30) || 'Untitled';
  palInputEl.placeholder = `Move “${label}” into…`;
  palDialogEl.setAttribute('aria-label', 'Move item into');
  palShow();
}

/* what a move acts on: the row the caret is in, by its STRUCTURAL id — F58
   puts structural commands on the mirror row itself, so a mirror moves the
   mirror and not the original whose text it is showing */
function moveTargetId() {
  const a = document.activeElement;
  const t = a && a.closest?.('.title');
  if (t) return idOfTitle(t);
  const ta = a && a.closest?.('.note-edit');
  if (!ta) return null;
  if (ta.parentElement === focusNoteEl) return view.focusId;
  const host = ta.closest('.node');
  return host ? host.dataset.id : null;
}

palInputEl.addEventListener('input', renderPalette);
palInputEl.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palSetSel(palSel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palSetSel(palSel - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); if (palShown.length) paletteAccept(palSel); }
});
palResultsEl.addEventListener('click', e => {
  const row = e.target.closest('.pal-item');
  if (row) paletteAccept(parseInt(row.dataset.idx, 10));
});
palDialogEl.addEventListener('close', () => { palMoveId = null; });
palResultsEl.addEventListener('mousemove', e => {
  const row = e.target.closest('.pal-item');
  if (row && parseInt(row.dataset.idx, 10) !== palSel) palSetSel(parseInt(row.dataset.idx, 10));
});
closeOnBackdropClick(palDialogEl);
// Ctrl+K must win even while typing in a title/note (same pattern as Ctrl+F)
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'k' || e.key === 'K') && !e.shiftKey && !e.altKey && !e.defaultPrevented) {
    e.preventDefault();
    openPalette();
  }
}, true);
/* Alt+M: the same picker, aimed at where the current item should live.
   Deliberately not Ctrl+Shift+K — that is Firefox's web console, and N3
   claims Firefox support. */
document.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  // Alt+letter reports differently across keyboard layouts (some send a dead
  // key or an accented character as e.key), so match the physical key too
  if (e.code !== 'KeyM' && e.key !== 'm' && e.key !== 'M') return;
  const id = moveTargetId();
  if (!id) return;
  e.preventDefault();
  openMovePalette(id);
});
