/* ===== 10 palette =====
   Ctrl+K fuzzy jump: type a few characters of any title, Enter to zoom there.
   The candidate index is snapshotted on open — the dialog is modal, so the
   document cannot change underneath it. */

const palDialogEl = $('#palette-dialog');
const palInputEl = $('#palette-input');
const palResultsEl = $('#palette-results');
let palItems = [];  // [{id, title, path}] — every node except the root
let palShown = [];  // scored results currently rendered
let palSel = 0;

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
    // empty query: the 12 most recently edited items, ready to jump to
    palShown = palItems.filter(it => it.title)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 12)
      .map(it => ({ id: it.id, title: it.title, path: it.path, spans: [] }));
    palHint(palShown.length ? 'Recently edited' : 'Type to jump to any item by title.');
  } else {
    const scored = [];
    for (let i = 0; i < palItems.length; i++) {
      const m = fuzzyMatch(q, palItems[i].title);
      if (m) scored.push({ id: palItems[i].id, title: palItems[i].title, path: palItems[i].path, score: m.score, spans: m.spans, ord: i });
    }
    scored.sort((a, b) => b.score - a.score || a.title.length - b.title.length || a.ord - b.ord);
    palShown = scored.slice(0, 50);
    if (!palShown.length) { palHint('No matching items.'); return; }
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

function openPalette() {
  if (palDialogEl.open) { palInputEl.focus(); palInputEl.select(); return; }
  palItems = paletteIndex();
  palInputEl.value = '';
  renderPalette();
  palDialogEl.showModal();
  palInputEl.focus();
}

palInputEl.addEventListener('input', renderPalette);
palInputEl.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palSetSel(palSel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palSetSel(palSel - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); if (palShown.length) paletteGo(palSel); }
});
palResultsEl.addEventListener('click', e => {
  const row = e.target.closest('.pal-item');
  if (row) paletteGo(parseInt(row.dataset.idx, 10));
});
palResultsEl.addEventListener('mousemove', e => {
  const row = e.target.closest('.pal-item');
  if (row && parseInt(row.dataset.idx, 10) !== palSel) palSetSel(parseInt(row.dataset.idx, 10));
});
palDialogEl.addEventListener('mousedown', e => {
  if (e.target === palDialogEl) palDialogEl.close(); // backdrop click
});
// Ctrl+K must win even while typing in a title/note (same pattern as Ctrl+F)
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'k' || e.key === 'K') && !e.shiftKey && !e.altKey && !e.defaultPrevented) {
    e.preventDefault();
    openPalette();
  }
}, true);
