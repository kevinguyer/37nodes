/* ===== 15 inline-format toolbar =====
   Floating bar over a text selection inside a title that is being edited
   (titles are RAW text while edited, so every action here is plain string
   surgery: wrap or unwrap delimiter pairs around the selected range). Edits
   go through execCommand('insertText') so they ride the normal input →
   store.setTitle pipeline; breakTyping() on both sides makes each action
   its own undo step. Buttons preventDefault on mousedown so the title
   keeps focus and the selection survives the click. */

const fmtBarEl = $('#fmt-bar');
let fmtBarFor = null; // the title element the bar is acting on; null = hidden

/* --- selection plumbing ------------------------------------------------ */
function fmtTitleTarget() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const start = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  const t = start && start.closest && start.closest('.title');
  if (!t || !t.isContentEditable || !t.contains(r.endContainer)) return null;
  return t;
}
function pointOffset(el, node, nodeOff) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, nodeOff);
  return r.toString().length;
}
function selRawRange(el) {
  const sel = window.getSelection();
  const r = sel.getRangeAt(0);
  const a = pointOffset(el, r.startContainer, r.startOffset);
  const b = pointOffset(el, r.endContainer, r.endOffset);
  return [Math.min(a, b), Math.max(a, b)];
}
function setSelectionRange(el, a, b) {
  const locate = offset => {
    let remaining = clamp(offset, 0, el.textContent.length);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    if (!node) return [el, 0];
    for (;;) {
      if (remaining <= node.length) return [node, remaining];
      remaining -= node.length;
      const next = walker.nextNode();
      if (!next) return [node, node.length];
      node = next;
    }
  };
  const r = document.createRange();
  const [sn, so] = locate(a);
  const [en, eo] = locate(b);
  r.setStart(sn, so);
  r.setEnd(en, eo);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

/* --- string surgery ---------------------------------------------------- */
function fmtReplace(el, a, b, str, selA, selB) {
  store.breakTyping();
  setSelectionRange(el, a, b);
  if (str) document.execCommand('insertText', false, str);
  else document.execCommand('delete');
  store.breakTyping();
  setSelectionRange(el, selA, selB);
}
function fmtWrap(el, open, close) {
  const t = el.textContent;
  const [a, b] = selRawRange(el);
  const inner = t.slice(a, b);
  if (a === b) { // collapsed (shortcut path): open a pair, caret inside
    fmtReplace(el, a, a, open + close, a + open.length, a + open.length);
    return;
  }
  // selection includes the markers themselves → strip them
  if (inner.length >= open.length + close.length && inner.startsWith(open) && inner.endsWith(close)) {
    const mid = inner.slice(open.length, inner.length - close.length);
    fmtReplace(el, a, b, mid, a, a + mid.length);
    return;
  }
  // selection is exactly the marked text → strip the surrounding markers
  if (t.slice(Math.max(0, a - open.length), a) === open && t.slice(b, b + close.length) === close) {
    fmtReplace(el, a - open.length, b + close.length, inner, a - open.length, a - open.length + inner.length);
    return;
  }
  fmtReplace(el, a, b, open + inner + close, a + open.length, a + open.length + inner.length);
}
function fmtShortcut(el, kind) {
  if (kind === 'b') fmtWrap(el, '**', '**');
  else if (kind === 'i') fmtWrap(el, '*', '*');
  else if (kind === 'u') fmtWrap(el, '__', '__');
}
const COLOR_WRAP_RE = /^\{(bg:)?(red|orange|yellow|green|blue|purple)\|([\s\S]*)\}$/;
const COLOR_OPEN_RE = /\{(bg:)?(red|orange|yellow|green|blue|purple)\|$/;
function fmtColor(el, slot, bg) {
  const t = el.textContent;
  const [a, b] = selRawRange(el);
  const inner = t.slice(a, b);
  const open = '{' + (bg ? 'bg:' : '') + slot + '|';
  // selection covers a whole span of this kind → retarget the slot, or strip
  const wm = inner.match(COLOR_WRAP_RE);
  if (wm && !!wm[1] === bg) {
    const mid = wm[3];
    const lead = slot ? open.length : 0;
    fmtReplace(el, a, b, slot ? open + mid + '}' : mid, a + lead, a + lead + mid.length);
    return;
  }
  // selection sits inside a span of this kind → retarget the slot, or strip
  const pm = t.slice(0, a).match(COLOR_OPEN_RE);
  if (pm && !!pm[1] === bg && t[b] === '}') {
    const start = a - pm[0].length;
    const lead = slot ? open.length : 0;
    fmtReplace(el, start, b + 1, slot ? open + inner + '}' : inner, start + lead, start + lead + inner.length);
    return;
  }
  if (slot && a !== b) fmtWrap(el, open, '}');
}

/* --- the bar itself ----------------------------------------------------- */
function hideFmtBar() {
  if (!fmtBarFor) return;
  fmtBarFor = null;
  fmtBarEl.hidden = true;
}
function fmtBarSync(titleEl) {
  const id = idOfTitle(titleEl);
  const n = id && store.getNode(id);
  const fmt = (n && n.format) || '';
  for (const btn of fmtBarEl.querySelectorAll('[data-hfmt]')) {
    btn.classList.toggle('active', btn.dataset.hfmt === fmt);
  }
}
function showFmtBar(titleEl) {
  fmtBarFor = titleEl;
  fmtBarSync(titleEl);
  const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
  fmtBarEl.hidden = false;
  const w = fmtBarEl.offsetWidth, h = fmtBarEl.offsetHeight;
  fmtBarEl.style.left = clamp(rect.left + rect.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
  fmtBarEl.style.top = clamp(
    rect.top - h - 8 >= 8 ? rect.top - h - 8 : rect.bottom + 8,
    8, window.innerHeight - h - 8) + 'px';
}
const fmtBarUpdate = debounce(() => {
  const t = fmtTitleTarget();
  if (t) showFmtBar(t); else hideFmtBar();
}, 150);
document.addEventListener('selectionchange', fmtBarUpdate);

fmtBarEl.addEventListener('mousedown', e => e.preventDefault());
fmtBarEl.addEventListener('click', e => {
  const btn = e.target.closest('button');
  const el = fmtBarFor;
  if (!btn || !el || !el.isConnected) { hideFmtBar(); return; }
  if (btn.dataset.fmt) {
    switch (btn.dataset.fmt) {
      case 'bold': fmtWrap(el, '**', '**'); break;
      case 'italic': fmtWrap(el, '*', '*'); break;
      case 'underline': fmtWrap(el, '__', '__'); break;
      case 'code': fmtWrap(el, '`', '`'); break;
      case 'link': {
        const t = el.textContent;
        const [a, b] = selRawRange(el);
        const inner = t.slice(a, b);
        // caret lands between the ( ) ready for the URL to be typed/pasted
        const caret = a + 1 + inner.length + 2;
        fmtReplace(el, a, b, '[' + inner + ']()', caret, caret);
        break;
      }
    }
  } else if ('hfmt' in btn.dataset) {
    const id = idOfTitle(el);
    if (id) store.setFormat(id, btn.dataset.hfmt); // updateRow leaves an editing title alone
    fmtBarSync(el);
  } else if ('tc' in btn.dataset) {
    fmtColor(el, btn.dataset.tc, false);
  } else if ('th' in btn.dataset) {
    fmtColor(el, btn.dataset.th, true);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideFmtBar();
});
window.addEventListener('scroll', () => hideFmtBar(), { passive: true });
window.addEventListener('resize', () => hideFmtBar());
