/* ===== 01 util ===== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const nowISO = () => new Date().toISOString();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

function debounce(fn, ms) {
  let t = null;
  const wrap = (...a) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...a); }, ms);
  };
  wrap.flush = () => { if (t) { clearTimeout(t); t = null; fn(); } };
  return wrap;
}

function formatAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 60000) return 'just now';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

/* --- caret helpers for single-line contenteditable titles --- */
function caretOffset(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return 0;
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function selectionCollapsedIn(el) {
  const sel = window.getSelection();
  return sel.rangeCount > 0 && sel.isCollapsed && el.contains(sel.getRangeAt(0).startContainer);
}
function setCaret(el, offset) {
  const sel = window.getSelection();
  const r = document.createRange();
  let remaining = clamp(offset, 0, el.textContent.length);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  if (!node) {
    r.selectNodeContents(el);
    r.collapse(false);
  } else {
    for (;;) {
      if (remaining <= node.length) { r.setStart(node, remaining); break; }
      remaining -= node.length;
      const next = walker.nextNode();
      if (!next) { r.setStart(node, node.length); break; }
      node = next;
    }
    r.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(r);
}

/* parse pasted plain text (possibly indented / bulleted) into item trees */
function parseOutlineText(text) {
  const lines = text.replace(/\r/g, '').split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim());
  const items = lines.map(l => {
    const m = l.match(/^(\s*)(?:[-*+]\s+|\d+\.\s+)?(.*)$/);
    return { indent: m[1].replace(/\t/g, '  ').length, text: m[2] };
  });
  const rootItems = [];
  const stack = [{ indent: -1, children: rootItems }];
  for (const it of items) {
    while (stack.length > 1 && it.indent <= stack[stack.length - 1].indent) stack.pop();
    const node = { text: it.text, children: [], indent: it.indent };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return rootItems;
}

/* Dismiss a modal <dialog> by clicking its backdrop.
   A modal dialog is a box painted over a backdrop that is part of the same
   element, so a backdrop click reports the dialog as its target. Testing the
   pointer against the box — rather than trusting `e.target === dialog` alone —
   matters because the dialog's own padding belongs to the element too: the
   target test by itself also fires on a click just inside the edge, which
   reads to the user as the dialog closing itself for no reason. */
function closeOnBackdropClick(dialogEl) {
  dialogEl.addEventListener('mousedown', e => {
    if (e.target !== dialogEl) return; // landed on real content inside
    const r = dialogEl.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right
        || e.clientY < r.top || e.clientY > r.bottom) dialogEl.close();
  });
}
