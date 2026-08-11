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
  const id = contentIdOfTitle(titleEl); // mirror rows show the target's format
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
      case 'link': openLinkDialog(el); break;
    }
  } else if ('hfmt' in btn.dataset) {
    const id = contentIdOfTitle(el); // heading lives on a mirror's target
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

/* --- the link prompt ----------------------------------------------------
   The link button used to drop `[text]()` and leave: raw syntax on screen,
   no hint about what goes where, and no way to tell an unfinished link from
   a broken one. It now opens a small prompt showing the text that will be
   linked and taking the address, then writes the markdown.

   The prompt takes focus, which ends the title's edit session — so the
   selection it was raised from is gone by the time Insert is pressed.
   Everything needed is captured up front (content id, raw range, the exact
   text that sat there) and the insertion goes through the store rather than
   execCommand, verified against that captured text so an edit underneath
   (another tab, an undo) can never be overwritten blind. */
const ldEl = $('#link-dialog');
const ldTextEl = $('#ld-text');
const ldUrlEl = $('#ld-url');
const ldHintEl = $('#ld-hint');
const ldRemoveEl = $('#ld-remove');
const ldOkEl = $('#ld-ok');
let ldCtx = null; // {id, a, b, text, was} — null = closed

/* the renderer's own link grammar (F56): http(s) only, and a ')' or a space
   inside the URL would end the markdown early */
const TITLE_LINK_RE = /\[([^\[\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
function linkAround(text, a, b) {
  TITLE_LINK_RE.lastIndex = 0;
  for (let m; (m = TITLE_LINK_RE.exec(text)); ) {
    const s = m.index, e = s + m[0].length;
    if (a >= s && b <= e) return { s, e, text: m[1], url: m[2] };
  }
  return null;
}
/* What gets pasted is rarely what the grammar accepts: assume https for a
   bare domain, and percent-encode the two characters that would truncate the
   link rather than rejecting an otherwise good URL over them. A URL that
   names some other scheme keeps it, and so fails the test below — the one
   place F56's http-only rule is enforced against user input. */
function ldNormalizeUrl(raw) {
  let u = String(raw).trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  return u.replace(/\s+/g, '%20').replace(/\)/g, '%29');
}
function ldValidUrl(u) { return /^https?:\/\/[^)\s]+$/.test(u); }

function ldSync() {
  if (!ldCtx) return;
  const typed = ldUrlEl.value.trim();
  const url = ldNormalizeUrl(typed);
  const bracketed = /[[\]]/.test(ldCtx.text); // unlinkable by the grammar
  const ok = !bracketed && ldValidUrl(url);
  ldOkEl.disabled = !ok;
  ldHintEl.textContent = bracketed ? 'Link text can’t contain [ or ].'
    : !typed ? 'Type or paste the address this text should point at.'
    : ok ? url            // show what will actually be written
    : 'Only http:// and https:// addresses can be linked.';
  ldHintEl.classList.toggle('bad', bracketed || (!!typed && !ok));
}

function openLinkDialog(el) {
  const id = contentIdOfTitle(el);
  const raw = el.textContent;
  const [a0, b0] = selRawRange(el);
  if (!id || a0 === b0) return;
  // a selection sitting in or on an existing link edits that link whole,
  // rather than nesting a second one inside it
  const hit = linkAround(raw, a0, b0);
  const a = hit ? hit.s : a0, b = hit ? hit.e : b0;
  ldCtx = { id, a, b, text: hit ? hit.text : raw.slice(a0, b0), was: raw.slice(a, b) };
  ldTextEl.textContent = ldCtx.text;
  ldUrlEl.value = hit ? hit.url : '';
  ldRemoveEl.hidden = !hit;
  // anchor to the selection while it is still on screen: focusing the field
  // ends the edit session and takes the highlight with it
  const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
  hideFmtBar();
  ldEl.hidden = false;
  const w = ldEl.offsetWidth, h = ldEl.offsetHeight, pad = 8;
  ldEl.style.left = clamp(rect.left + rect.width / 2 - w / 2, pad, window.innerWidth - w - pad) + 'px';
  ldEl.style.top = clamp(
    rect.bottom + pad + h <= window.innerHeight - pad ? rect.bottom + pad : rect.top - h - pad,
    pad, window.innerHeight - h - pad) + 'px';
  ldSync();
  ldUrlEl.focus();
  ldUrlEl.select();
}

function closeLinkDialog({ restore = false } = {}) {
  if (!ldCtx) return;
  const ctx = ldCtx;
  ldCtx = null;
  ldEl.hidden = true;
  if (restore) focusNodeTitle(ctx.id, ctx.b); // back where the selection ended
}

function ldApply(url) { // '' = unwrap, keeping the text
  if (!ldCtx) return;
  const ctx = ldCtx;
  const n = store.getNode(ctx.id);
  if (!n || n.title.slice(ctx.a, ctx.b) !== ctx.was) {
    ldHintEl.textContent = 'This item changed while the prompt was open — nothing was written.';
    ldHintEl.classList.add('bad');
    return;
  }
  const md = url ? '[' + ctx.text + '](' + url + ')' : ctx.text;
  ldCtx = null;
  ldEl.hidden = true;
  store.setTitleImmediate(ctx.id, n.title.slice(0, ctx.a) + md + n.title.slice(ctx.b));
  focusNodeTitle(ctx.id, ctx.a + md.length); // caret just past the link
}

ldUrlEl.addEventListener('input', ldSync);
ldEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (!ldOkEl.disabled) ldApply(ldNormalizeUrl(ldUrlEl.value));
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation(); // Esc belongs to the prompt, not to search or the note
    closeLinkDialog({ restore: true });
  }
});
ldOkEl.addEventListener('click', () => ldApply(ldNormalizeUrl(ldUrlEl.value)));
$('#ld-cancel').addEventListener('click', () => closeLinkDialog({ restore: true }));
ldRemoveEl.addEventListener('click', () => ldApply(''));
document.addEventListener('mousedown', e => {
  if (ldCtx && !e.target.closest('#link-dialog')) closeLinkDialog();
});
// position:fixed, anchored to a selection that scrolls away underneath it
window.addEventListener('scroll', () => closeLinkDialog(), { passive: true });
window.addEventListener('resize', () => closeLinkDialog());
