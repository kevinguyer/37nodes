/* ===== 11 [[link]] and ((mirror)) autocomplete =====
   Obsidian-style suggester. Typing the second '[' closes the pair and opens a
   list of item titles filtered as you type; Enter/Tab completes it. Links
   resolve by title (F44), so completing one is a pure text insertion — there is
   no id to keep in sync afterwards. Works in titles (contenteditable) and in
   note editors (textarea).
   '((' (titles only, childless items) runs the same picker in mirror mode:
   accepting converts the item into a live mirror of the picked one (F58). */

const AC_MAX = 8;
const acPopEl = $('#link-auto');
let acEl = null;    // element being edited while the popup is open
let acStart = -1;   // text index just after the opening '[[' / '(('
let acKind = 'link'; // 'link' | 'mirror'
let acItems = [];   // candidate snapshot, taken when a link region is entered
let acShown = [];   // rows currently rendered
let acSel = 0;

/* --- the two editor kinds behind one interface --- */
const acIsTextarea = el => el.tagName === 'TEXTAREA';
const acText = el => (acIsTextarea(el) ? el.value : el.textContent);
const acCaret = el => (acIsTextarea(el) ? el.selectionStart : caretOffset(el));
const acCollapsed = el => (acIsTextarea(el)
  ? el.selectionStart === el.selectionEnd
  : selectionCollapsedIn(el));
function acEditable(node) {
  if (!node || !node.classList) return null;
  return (node.classList.contains('title') || node.classList.contains('note-edit')) ? node : null;
}
function acOwnerId(el) { // CONTENT id: text written here lands on a mirror's target
  if (!acIsTextarea(el)) return contentIdOfTitle(el);
  const host = el.closest('.node');
  return el.parentElement === focusNoteEl
    ? view.focusId
    : (host && (host.dataset.mirror || host.dataset.id)) || null;
}
function acStructuralId(el) { // the row's own node: what '((' would convert
  if (acIsTextarea(el)) return null;
  return idOfTitle(el);
}
/* write text back to both the DOM (source of truth while focused) and the store */
function acWrite(el, text, caret, atomic) {
  const id = acOwnerId(el);
  if (acIsTextarea(el)) {
    el.value = text;
    el.setSelectionRange(caret, caret);
    autoGrow(el);
  } else {
    el.textContent = text;
    setCaret(el, caret);
  }
  if (!id) return;
  const put = () => (acIsTextarea(el) ? store.setNote(id, text) : store.setTitle(id, text));
  if (atomic) store.group(put); else put(); // atomic: completion is one undo step
}

/* --- the link/mirror region under the caret --- */
function acProbe(el) {
  if (!acCollapsed(el)) return null;
  const caret = acCaret(el);
  const before = acText(el).slice(0, caret);
  const openL = before.lastIndexOf('[[');
  // mirrors are node surgery, not text: titles only, never the focus header
  const openM = (!acIsTextarea(el) && el !== focusTitleEl) ? before.lastIndexOf('((') : -1;
  const open = Math.max(openL, openM);
  if (open < 0) return null;
  const kind = open === openM && openM > openL ? 'mirror' : 'link';
  const query = before.slice(open + 2);
  // brackets/parens or a line break between the opener and the caret: region over
  if (/[[\]()\n]/.test(query) || query.length > 80) return null;
  if (kind === 'mirror') {
    // only a childless, non-mirror item can become a mirror (F58 guards)
    const id = acStructuralId(el);
    const n = id && store.getNode(id);
    if (!n || n.mirrorOf || n.children.length) return null;
  }
  return { start: open + 2, kind, query };
}

/* Candidates, deduped the way resolveTitleLink resolves: first in document
   order wins, so offering the later twins would be a lie. Titles containing
   brackets can't sit inside [[ ]] at all, so they are never offered. */
function acIndex(selfId) {
  const byKey = new Map();
  (function walk(n, path) {
    for (const c of n.children) {
      const title = (c.title || '').trim();
      const key = title.toLowerCase();
      if (key && !/[[\]]/.test(title)) {
        const hit = byKey.get(key);
        if (hit) hit.dupes++;
        else byKey.set(key, { id: c.id, title, path, dupes: 1, updatedAt: c.updatedAt });
      }
      const label = truncate(c.title, 30) || 'Untitled';
      walk(c, path ? `${path} › ${label}` : label);
    }
  })(store.doc.root, '');
  // the node being edited would resolve to itself — not a link worth making
  return [...byKey.values()].filter(it => it.id !== selfId);
}

/* mirror candidates: any titled item that isn't the node itself, one of its
   ancestors (cycle), or another mirror (chains flatten, but offering them
   would just duplicate rows) */
function acMirrorIndex(selfId) {
  const items = [];
  (function walk(n, path) {
    for (const c of n.children) {
      if (c.id !== selfId && !c.mirrorOf && c.title
          && !store.isDescendant(selfId, c.id)) {
        items.push({ id: c.id, title: c.title, path, updatedAt: c.updatedAt });
      }
      const label = truncate(c.title, 30) || 'Untitled';
      walk(c, path ? `${path} › ${label}` : label);
    }
  })(store.doc.root, '');
  return items;
}

function acHint(text) {
  const el = document.createElement('div');
  el.className = 'pal-hint';
  el.textContent = text;
  acPopEl.append(el);
}
function acRender(query) {
  acPopEl.textContent = '';
  acShown = [];
  acSel = 0;
  const q = query.trim().toLowerCase();
  if (!q) {
    acShown = acItems.slice()
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, AC_MAX)
      .map(it => ({ ...it, spans: [] }));
  } else {
    const scored = [];
    for (let i = 0; i < acItems.length; i++) {
      const m = fuzzyMatch(q, acItems[i].title);
      if (m) scored.push({ ...acItems[i], score: m.score, spans: m.spans, ord: i });
    }
    scored.sort((a, b) => b.score - a.score || a.title.length - b.title.length || a.ord - b.ord);
    acShown = scored.slice(0, AC_MAX);
  }
  if (!acShown.length) {
    if (acKind === 'mirror') {
      acHint(q ? 'No matching item to mirror — Esc keeps the text as typed.'
               : 'Pick an item to mirror here: it will appear as a live copy.');
    } else {
      acHint(q ? 'No item with that title, so this link will show as broken.'
               : 'No other items to link to yet.');
    }
    return;
  }
  acShown.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'pal-item' + (i === acSel ? ' sel' : '');
    row.dataset.idx = i;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(i === acSel));
    const tEl = document.createElement('div');
    tEl.className = 'pal-title';
    tEl.append(matchFrag(r.title, r.spans));
    row.append(tEl);
    const note = r.dupes > 1
      ? (r.path ? `${r.path} · ` : '') + `${r.dupes} items share this title, links reach this one`
      : r.path;
    if (note) {
      const p = document.createElement('div');
      p.className = 'pal-path';
      p.textContent = note;
      row.append(p);
    }
    acPopEl.append(row);
  });
}
function acSetSel(i) {
  if (!acShown.length) return;
  acSel = clamp(i, 0, acShown.length - 1);
  $$('.pal-item', acPopEl).forEach((el, k) => {
    el.classList.toggle('sel', k === acSel);
    el.setAttribute('aria-selected', String(k === acSel));
  });
  const sel = acPopEl.querySelector('.pal-item.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

/* --- placing the popup at the caret --- */
const AC_MIRROR_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
  'lineHeight', 'textTransform', 'boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom',
  'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'];
let acMirrorEl = null;
/* a textarea has no caret geometry of its own: lay the same text out in a
   hidden div with identical metrics and measure a marker at the caret */
function acTextareaCaretRect(ta) {
  if (!acMirrorEl) {
    acMirrorEl = document.createElement('div');
    acMirrorEl.id = 'link-auto-mirror';
    acMirrorEl.setAttribute('aria-hidden', 'true');
    document.body.append(acMirrorEl);
  }
  const cs = getComputedStyle(ta);
  for (const p of AC_MIRROR_PROPS) acMirrorEl.style[p] = cs[p];
  const box = ta.getBoundingClientRect();
  acMirrorEl.style.width = box.width + 'px';
  acMirrorEl.style.left = box.left + 'px';
  acMirrorEl.style.top = (box.top - ta.scrollTop) + 'px';
  acMirrorEl.textContent = ta.value.slice(0, ta.selectionStart);
  const dot = document.createElement('span');
  dot.textContent = '\u200b'; // a marker with no width of its own
  acMirrorEl.append(dot);
  const rect = dot.getBoundingClientRect();
  acMirrorEl.textContent = '';
  return rect.height ? rect : box;
}
function acCaretRect(el) {
  if (acIsTextarea(el)) return acTextareaCaretRect(el);
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const r = sel.getRangeAt(0).cloneRange();
    let rect = r.getBoundingClientRect();
    // a collapsed range can measure empty; borrow the character before it
    if (!rect.height && r.startOffset > 0) {
      r.setStart(r.startContainer, r.startOffset - 1);
      rect = r.getBoundingClientRect();
    }
    if (rect.height) return rect;
  }
  return el.getBoundingClientRect();
}
function acPlace(el) {
  const rect = acCaretRect(el);
  const pad = 8;
  acPopEl.style.visibility = 'hidden';
  acPopEl.hidden = false;
  acPopEl.style.left = '0px';
  acPopEl.style.top = '0px';
  const w = acPopEl.offsetWidth, h = acPopEl.offsetHeight;
  const left = clamp(rect.left, pad, Math.max(pad, window.innerWidth - w - pad));
  let top = rect.bottom + 4;
  if (top + h > window.innerHeight - pad) {
    const above = rect.top - 4 - h;
    top = above >= pad ? above : Math.max(pad, window.innerHeight - h - pad);
  }
  acPopEl.style.left = left + 'px';
  acPopEl.style.top = top + 'px';
  acPopEl.style.visibility = '';
}

/* --- open / refresh / close --- */
function acClose() {
  if (acPopEl.hidden) return;
  acPopEl.hidden = true;
  acPopEl.textContent = '';
  acEl = null;
  acStart = -1;
  acShown = [];
  acItems = [];
}
function acUpdate() {
  const el = acEditable(document.activeElement);
  if (!el) { acClose(); return; }
  const probe = acProbe(el);
  if (!probe) { acClose(); return; }
  // entering a different region: take a fresh candidate snapshot
  if (el !== acEl || probe.start !== acStart || probe.kind !== acKind) {
    acItems = probe.kind === 'mirror'
      ? acMirrorIndex(acStructuralId(el))
      : acIndex(acOwnerId(el));
  }
  acEl = el;
  acStart = probe.start;
  acKind = probe.kind;
  acRender(probe.query);
  acPlace(el);
}
function acAccept(i) {
  const r = acShown[i];
  if (!r || !acEl) return;
  if (acKind === 'mirror') {
    // node surgery, not text insertion: the item becomes a live mirror and
    // setMirror clears the leftover "((query" text as part of the same undo step
    const id = acStructuralId(acEl);
    acClose();
    if (id && store.setMirror(id, r.id)) focusNodeTitle(id, 'end');
    return;
  }
  const el = acEl, start = acStart;
  const text = acText(el);
  const caret = acCaret(el);
  const closed = text.slice(caret, caret + 2) === ']]';
  const next = text.slice(0, start) + r.title + (closed ? '' : ']]') + text.slice(caret);
  acClose();
  el.focus();
  acWrite(el, next, start + r.title.length + 2, true);
}

/* --- wiring ---------------------------------------------------------- */

/* Auto-pair the closing brackets, then refresh. This runs after the editing
   handlers in 06 have already pushed the keystroke into the store, so writing
   the paired text here simply coalesces into the same typing burst. */
document.addEventListener('input', e => {
  const el = acEditable(e.target);
  if (!el) return;
  // e.data is null for deletions; it can carry more than one character when the
  // insertion came from a paste or an IME, so test its tail rather than equality
  if (e.data && e.data.endsWith('[')) {
    const caret = acCaret(el), text = acText(el);
    if (text.slice(caret - 2, caret) === '[[' && text.slice(caret, caret + 2) !== ']]') {
      acWrite(el, text.slice(0, caret) + ']]' + text.slice(caret), caret, false);
    }
  }
  // '((' pairs the same way, but only where a mirror could actually happen
  if (e.data && e.data.endsWith('(') && !acIsTextarea(el)) {
    const caret = acCaret(el), text = acText(el);
    if (text.slice(caret - 2, caret) === '((' && text.slice(caret, caret + 2) !== '))') {
      acWrite(el, text.slice(0, caret) + '))' + text.slice(caret), caret, false);
    }
  }
  acUpdate();
});

/* Capture phase: while the popup is open these keys belong to it, not to the
   outline (Enter would split the item, Tab would indent it, Esc close the note). */
document.addEventListener('keydown', e => {
  const el = acEl;
  if (acPopEl.hidden || e.target !== el) return;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
  const take = () => { e.preventDefault(); e.stopPropagation(); };
  switch (e.key) {
    case 'ArrowDown': if (!plain || !acShown.length) return; take(); acSetSel(acSel + 1); return;
    case 'ArrowUp':   if (!plain || !acShown.length) return; take(); acSetSel(acSel - 1); return;
    case 'Enter':
    case 'Tab':
      if (!plain || !acShown.length) return; // nothing to insert: let it through
      take();
      acAccept(acSel);
      return;
    case 'Escape':
      e.preventDefault();
      e.stopPropagation();
      acClose();
      return;
    case 'Backspace': {
      // backspacing the opening pair takes the auto-inserted closing pair with
      // it, so changing your mind never leaves a stray ']]' / '))' behind
      const text = acText(el), caret = acCaret(el);
      if (!plain || !acCollapsed(el)) return;
      const pair = [['[[', ']]'], ['((', '))']].find(([o, c]) =>
        text.slice(caret - 2, caret) === o && text.slice(caret, caret + 2) === c);
      if (!pair) return;
      take();
      acClose();
      el.focus();
      acWrite(el, text.slice(0, caret - 2) + text.slice(caret + 2), caret - 2, false);
      return;
    }
  }
}, true);

// caret moves that keydown didn't already handle
const AC_CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);
document.addEventListener('keyup', e => {
  if (!acPopEl.hidden && AC_CARET_KEYS.has(e.key)) acUpdate();
});
document.addEventListener('mouseup', e => {
  if (!acPopEl.hidden && !acPopEl.contains(e.target)) acUpdate();
});
document.addEventListener('focusout', e => {
  if (e.target === acEl) acClose();
});
acPopEl.addEventListener('mousedown', e => e.preventDefault()); // keep the caret put
acPopEl.addEventListener('click', e => {
  const row = e.target.closest('.pal-item');
  if (row) acAccept(parseInt(row.dataset.idx, 10));
});
acPopEl.addEventListener('mousemove', e => {
  const row = e.target.closest('.pal-item');
  if (row) acSetSel(parseInt(row.dataset.idx, 10));
});
// the popup is viewport-positioned: follow the caret rather than drift from it
window.addEventListener('scroll', () => { if (acEl) acPlace(acEl); }, true);
window.addEventListener('resize', () => { if (acEl) acPlace(acEl); });
