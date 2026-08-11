/* ===== 12 tour =====
   A guided walkthrough of the real UI: one enormous box-shadow paints the
   scrim around a "hole" positioned over the element being described, so the
   highlighted control keeps its own colours and the spotlight glides from
   step to step. Runs itself once on a genuine first run (seeded document);
   re-launchable from the ☰ menu and the help dialog.

   Steps are declarative: each names its target, where the card should sit,
   and the app state it wants (zoomed / menu open). tourApplyState() puts the
   app into that state on entry, which makes stepping backwards work without
   a single undo hook. */

const tourEl = $('#tour');
const tourVeilEl = $('#tour-veil');
const tourHoleEl = $('#tour-hole');
const tourCardEl = $('#tour-card');
const tourArrowEl = $('#tour-arrow');
const tourTitleEl = $('#tour-title');
const tourCountEl = $('#tour-count');
const tourBodyEl = $('#tour-body');
const tourDotsEl = $('#tour-dots');
const tourBackEl = $('#tour-back');
const tourNextEl = $('#tour-next');
const tourSkipEl = $('#tour-skip');

let tourSteps = [];
let tourAt = -1;
let tourActive = false;
let tourHoleRect = null; // current spotlight rect (viewport px), or null when centred
let tourReturn = null;   // app state to restore when the tour ends

/* --- copy: `code` → kbd, **bold** → strong, *text* → em, blank line → ¶ --- */
function tourRich(text) {
  const frag = document.createDocumentFragment();
  for (const para of text.split('\n\n')) {
    const p = document.createElement('p');
    const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
    let last = 0, m;
    while ((m = re.exec(para))) {
      if (m.index > last) p.append(para.slice(last, m.index));
      const el = document.createElement(m[1] ? 'kbd' : m[2] ? 'strong' : 'em');
      el.textContent = m[1] || m[2] || m[3];
      p.append(el);
      last = re.lastIndex;
    }
    if (last < para.length) p.append(para.slice(last));
    frag.append(p);
  }
  return frag;
}

/* --- step list ------------------------------------------------------- */
/* rect-based, not offsetParent: #menu-panel is position:fixed and would
   always look "hidden" by that test */
function tourVisible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
/* a tight cluster of sibling rows reads as "structure" far better than the
   first n rows of the outline, which straddle notes and top-level items */
function tourRows(n) {
  const nested = $$('#tree .children > .node > .row').filter(tourVisible);
  if (nested.length >= 2) {
    const home = nested[0].closest('.children'); // siblings only: one tidy block
    return nested.filter(r => r.closest('.children') === home).slice(0, n);
  }
  return $$('#tree .row').filter(tourVisible).slice(0, n);
}
function tourBranch() {
  // an item with children, under whatever the user is currently looking at:
  // the zoom demo needs somewhere to zoom to
  const focus = store.getNode(tourReturn ? tourReturn.focusId : ROOT_ID) || store.doc.root;
  return focus.children.find(c => c.children.length && nodeEl(c.id)) || null;
}

function tourBuild(auto) {
  const branch = tourBranch();
  const steps = [
    {
      title: auto ? 'Welcome to 37nodes' : 'The 37nodes tour',
      body: 'An outliner where every line is an item, and every item can hold a whole world inside it.\n\nThis takes about a minute. Leave any time with `Esc`.',
      place: 'center', nextLabel: auto ? 'Show me around' : 'Start', noBack: true,
    },
    {
      title: 'One line, one item',
      body: '`Enter` starts a new item. `Tab` tucks it under the item above, `Shift`+`Tab` pulls it back out: simple, elegant, endless.\n\n`Alt`+`↑` / `Alt`+`↓` move an item and everything under it. Every bulleted node also doubles as a todo item, just use `Ctrl`+`Enter` to check it off.',
      target: () => tourRows(3), place: 'bottom', pad: 4,
    },
    {
      title: 'Notes carry the detail',
      body: 'Any item can hold a note. Press `Shift`+`Enter` to write one; click away and it renders as **markdown**: lists, links, quotes, code.\n\nNotes are searchable, so the real detail can live there instead of in a bloated title.',
      target: () => $('#tree .note'), place: 'bottom', pad: 6,
    },
    {
      title: 'Zoom into anything',
      body: 'Click a bullet to **zoom in**: that item becomes the page, and its children become the outline.\n\nIt is how a 20,000-item file stays calm: you only ever look at one branch. `Alt`+`→` does the same from the keyboard.',
      target: () => (branch && nodeEl(branch.id) ? nodeEl(branch.id).querySelector('.bullet') : $('#tree .bullet')),
      place: 'right', pad: 8,
    },
  ];
  if (branch) {
    steps.push({
      title: 'Breadcrumbs lead back',
      body: 'You are zoomed in now. The trail up here walks back out: click any ancestor, or press `Alt`+`←`. `Alt`+`Shift`+`←` goes straight back to the top from any depth.\n\nZoom lives in the URL, so the browser Back button retraces where you have been.',
      target: () => $('#breadcrumbs'), place: 'bottom', pad: 6,
      zoomTo: () => branch.id,
    });
  }
  steps.push(
    {
      title: 'Find it in a keystroke',
      body: '`Ctrl`+`F` filters the outline as you type, keeping every match in context under its parents. `Esc` clears it.\n\n`Ctrl`+`K` opens the jump palette: a few letters of any title and you are there. It opens onto what you edited most recently.',
      target: () => $('#search'), place: 'bottom', pad: 5,
    },
    {
      title: 'Tags and links',
      body: 'A `#tag` in a title becomes a chip: click it to filter by that tag, click again to clear. Typing `#` offers the tags you already use, so a vocabulary stays one.\n\nType `[[` to link to another item: a list of titles appears right at the cursor, and `Enter` inserts the one you mean.\n\n`Alt`+`I` opens a side panel with what links to an item, your starred items (`Alt`+`S`), and every tag in view.',
      target: () => $('#tree .title .tag') || $('#tree .wikilink'), place: 'bottom', pad: 5,
    },
    {
      title: 'Make it yours',
      body: 'The rest lives in this menu, in three groups: **View** (themes, including a few retro terminal tributes with the glow and scanlines to match), **Data & backup** (import, export, and a mirror to a file on disk), and **Help**.\n\nAnd this tour, whenever you want it again.',
      target: () => $('#menu-panel'), place: 'left', pad: 6, menu: true,
    },
    {
      title: 'Your data, your machine',
      body: 'The outline lives in this browser\'s built-in database (IndexedDB). Nothing is ever sent anywhere, so the data is yours outright: no account, no server, no third party to trust or be breached by.\n\nThat also means nothing is backed up for you. **Export JSON** is the real backup. On Chromium browsers, *Mirror to a file on disk* keeps a copy on disk current with every save; without a mirror running, the app nudges you every so often to export one.',
      target: () => $('#export-json'), place: 'left', pad: 4, menu: true,
    },
    {
      title: 'That\'s the tour',
      body: (auto
        ? 'Press `?` any time for the full keyboard reference.\n\nThe starter outline below is yours: edit it, or type straight over it.'
        : 'Press `?` any time for the full keyboard reference.\n\nThe tour is always in the ☰ menu if you want it again.'),
      place: 'center', nextLabel: 'Start outlining', noSkip: true,
    }
  );
  return steps;
}

/* --- app state a step wants (zoom, menu) ----------------------------- */
function tourZoomTo(id) {
  if (view.focusId === id) return;
  location.hash = id === ROOT_ID ? '' : '#' + id;
  applyFocusFromHash();
}
function tourApplyState(step) {
  const want = step.zoomTo ? step.zoomTo() : tourReturn.focusId;
  tourZoomTo(store.getNode(want) ? want : ROOT_ID);
  const wantMenu = !!step.menu;
  if (menuPanelEl.hidden === wantMenu) {
    menuPanelEl.hidden = !wantMenu;
    menuBtnEl.setAttribute('aria-expanded', String(wantMenu));
    if (wantMenu) { updateExportReadout(); updateFsUI(); }
  }
}

/* --- geometry -------------------------------------------------------- */
function tourTargets(step) {
  const t = step.target ? step.target() : null;
  return (Array.isArray(t) ? t : [t]).filter(tourVisible);
}
function tourUnion(els) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const el of els) {
    const c = el.getBoundingClientRect();
    l = Math.min(l, c.left); t = Math.min(t, c.top);
    r = Math.max(r, c.right); b = Math.max(b, c.bottom);
  }
  return { left: l, top: t, width: r - l, height: b - t };
}
function tourScrollTo(step) {
  const els = tourTargets(step);
  if (!els.length) return;
  const u = tourUnion(els);
  // instant, not smooth: the measurements below have to be final, and the
  // spotlight's own transition already supplies the motion
  if (u.top < 64 || u.top + u.height > innerHeight - 48) {
    els[0].scrollIntoView({ block: 'center' });
  }
}

function tourPlaceCard(rect, step) {
  const vw = innerWidth, vh = innerHeight, gap = 14, edge = 12;
  const cw = tourCardEl.offsetWidth, ch = tourCardEl.offsetHeight;
  let side, left, top;
  if (!rect) {
    side = 'center';
    left = (vw - cw) / 2;
    top = clamp((vh - ch) / 2, edge, Math.max(edge, vh - ch - edge));
  } else if (vw < 520) {
    // narrow: park the card at whichever end of the screen the target is not
    side = 'sheet';
    left = (vw - cw) / 2;
    top = (rect.t + rect.h / 2 > vh / 2) ? edge : Math.max(edge, vh - ch - edge);
  } else {
    const room = {
      bottom: vh - (rect.t + rect.h) - gap - edge,
      top: rect.t - gap - edge,
      right: vw - (rect.l + rect.w) - gap - edge,
      left: rect.l - gap - edge,
    };
    const order = (step.place && step.place !== 'auto' ? [step.place] : [])
      .concat(['bottom', 'top', 'right', 'left']);
    side = order.find(s => room[s] >= (s === 'bottom' || s === 'top' ? ch : cw)) || 'bottom';
    if (side === 'bottom' || side === 'top') {
      left = rect.l + rect.w / 2 - cw / 2;
      top = side === 'bottom' ? rect.t + rect.h + gap : rect.t - gap - ch;
    } else {
      top = rect.t + rect.h / 2 - ch / 2;
      left = side === 'right' ? rect.l + rect.w + gap : rect.l - gap - cw;
    }
    left = clamp(left, edge, Math.max(edge, vw - cw - edge));
    top = clamp(top, edge, Math.max(edge, vh - ch - edge));
  }
  tourCardEl.dataset.side = side;
  tourCardEl.style.left = Math.round(left) + 'px';
  tourCardEl.style.top = Math.round(top) + 'px';
  if (rect && (side === 'bottom' || side === 'top')) {
    tourArrowEl.style.left = Math.round(clamp(rect.l + rect.w / 2 - left - 5.5, 14, cw - 25)) + 'px';
    tourArrowEl.style.top = '';
  } else if (rect && (side === 'left' || side === 'right')) {
    tourArrowEl.style.top = Math.round(clamp(rect.t + rect.h / 2 - top - 5.5, 14, ch - 25)) + 'px';
    tourArrowEl.style.left = '';
  }
}

function tourLayout({ instant = false } = {}) {
  if (!tourActive) return;
  const step = tourSteps[tourAt];
  const els = tourTargets(step);
  const vw = innerWidth, vh = innerHeight;
  let rect = null;
  if (els.length) {
    const u = tourUnion(els);
    const pad = step.pad == null ? 6 : step.pad;
    rect = { l: u.left - pad, t: u.top - pad, w: u.width + pad * 2, h: u.height + pad * 2 };
    if (step.maxH && rect.h > step.maxH) rect.h = step.maxH;
    rect.w = Math.min(rect.w, vw - 8);
    rect.h = Math.min(rect.h, vh - 8);
    rect.l = clamp(rect.l, 4, Math.max(4, vw - rect.w - 4));
    rect.t = clamp(rect.t, 4, Math.max(4, vh - rect.h - 4));
    if (rect.w <= 0 || rect.h <= 0) rect = null;
  }
  tourHoleRect = rect;
  tourEl.classList.toggle('spot', !!rect);
  if (instant) { tourHoleEl.style.transition = 'none'; tourCardEl.style.transition = 'none'; }
  tourHoleEl.style.left = (rect ? rect.l : vw / 2) + 'px';
  tourHoleEl.style.top = (rect ? rect.t : vh / 2) + 'px';
  tourHoleEl.style.width = (rect ? rect.w : 0) + 'px';
  tourHoleEl.style.height = (rect ? rect.h : 0) + 'px';
  tourPlaceCard(rect, step);
  if (instant) {
    void tourEl.offsetWidth; // flush, so the reset below doesn't animate the jump
    tourHoleEl.style.transition = '';
    tourCardEl.style.transition = '';
  }
}

/* --- stepping -------------------------------------------------------- */
function tourRenderDots() {
  tourDotsEl.textContent = '';
  tourSteps.forEach((s, i) => {
    const d = document.createElement('i');
    if (i === tourAt) d.className = 'now';
    else if (i < tourAt) d.className = 'done';
    tourDotsEl.append(d);
  });
}
function tourGo(i, { instant = false } = {}) {
  const step = tourSteps[i];
  if (!step) { tourEnd(); return; }
  tourAt = i;
  tourApplyState(step);

  tourTitleEl.textContent = step.title;
  tourBodyEl.textContent = '';
  tourBodyEl.append(tourRich(step.body));
  tourCountEl.textContent = `${i + 1} / ${tourSteps.length}`;
  tourRenderDots();
  tourBackEl.hidden = !!step.noBack || i === 0;
  tourSkipEl.hidden = !!step.noSkip;
  tourNextEl.textContent = step.nextLabel || 'Next';

  tourCardEl.classList.remove('step-in');
  void tourCardEl.offsetWidth;
  tourCardEl.classList.add('step-in');

  tourScrollTo(step);
  tourLayout({ instant });
  tourNextEl.focus({ preventScroll: true });
}
function tourNext() { if (tourAt >= tourSteps.length - 1) tourEnd(); else tourGo(tourAt + 1); }
function tourPrev() { if (tourAt > 0) tourGo(tourAt - 1); }

function tourStart({ auto = false } = {}) {
  if (tourActive) return;
  closeMenu();
  for (const d of $$('dialog[open]')) d.close();
  clearSearch(false);
  tourReturn = { focusId: view.focusId };
  tourSteps = tourBuild(auto);
  tourActive = true;
  tourAt = -1;
  tourEl.hidden = false;
  tourGo(0, { instant: true });
  requestAnimationFrame(() => { if (tourActive) tourEl.classList.add('in'); });
}

function tourEnd() {
  if (!tourActive) return;
  tourActive = false;
  tourEl.classList.remove('in', 'spot');
  setTimeout(() => { if (!tourActive) tourEl.hidden = true; }, 220);

  menuPanelEl.hidden = true;
  menuBtnEl.setAttribute('aria-expanded', 'false');
  tourZoomTo(store.getNode(tourReturn.focusId) ? tourReturn.focusId : ROOT_ID);
  prefs.tourDoneAt = nowISO();
  savePrefs();

  // hand the outline back with a live caret, ready to type
  const first = visibleTitles()[0];
  if (first) activateTitle(first, 'end');
}

/* --- input ----------------------------------------------------------- */
tourNextEl.addEventListener('click', tourNext);
tourBackEl.addEventListener('click', tourPrev);
tourSkipEl.addEventListener('click', () => tourEnd());
// the card sits outside the veil: keep its clicks from reaching the document
// handler that closes the ☰ menu behind us
tourCardEl.addEventListener('mousedown', e => e.stopPropagation());
tourCardEl.addEventListener('click', e => e.stopPropagation());
tourVeilEl.addEventListener('mousedown', e => e.stopPropagation());
tourVeilEl.addEventListener('click', e => {
  e.stopPropagation();
  const r = tourHoleRect; // clicking the spotlit thing itself moves on
  if (r && e.clientX >= r.l && e.clientX <= r.l + r.w && e.clientY >= r.t && e.clientY <= r.t + r.h) tourNext();
});

/* Keys are captured on window — ahead of every document-level handler in the
   app — so nothing types into the outline behind the scrim. */
window.addEventListener('keydown', e => {
  if (!tourActive) return;
  const k = e.key;
  const onButton = e.target.tagName === 'BUTTON' && tourCardEl.contains(e.target);
  if (k === 'Tab') { // simple focus trap across the card's buttons
    const btns = $$('button:not([hidden])', tourCardEl);
    if (!btns.length) return;
    const i = btns.indexOf(e.target);
    if (i < 0) { e.preventDefault(); btns[0].focus(); return; }
    if (e.shiftKey && i === 0) { e.preventDefault(); btns[btns.length - 1].focus(); }
    else if (!e.shiftKey && i === btns.length - 1) { e.preventDefault(); btns[0].focus(); }
    return;
  }
  e.stopPropagation();
  if (onButton && (k === 'Enter' || k === ' ')) return; // let the focused button act
  if (k === 'Escape') { e.preventDefault(); tourEnd(); }
  else if (k === 'ArrowRight' || k === 'PageDown' || k === 'Enter' || k === ' ') { e.preventDefault(); tourNext(); }
  else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); tourPrev(); }
  else if (k.length === 1 || k === 'Backspace') { e.preventDefault(); }
}, true);

/* the spotlight tracks its target through scrolls and resizes — without the
   step transition, which would smear a frame behind the page */
let tourRaf = 0;
function tourReflow() {
  if (!tourActive || tourRaf) return;
  tourRaf = requestAnimationFrame(() => { tourRaf = 0; tourLayout({ instant: true }); });
}
window.addEventListener('resize', tourReflow);
window.addEventListener('scroll', tourReflow, true);

/* --- entry points ---------------------------------------------------- */
$('#show-tour').addEventListener('click', () => { closeMenu(); tourStart(); });
$('#help-tour').addEventListener('click', () => { $('#help-dialog').close(); tourStart(); });

/* First run only: a seeded document means there was nothing saved to load.
   A load warning means something is wrong with the user's data — that
   deserves the screen more than a tour does. Waits for bootReady because
   the document now loads asynchronously (IndexedDB). */
bootReady.then(() => {
  if (!prefs.tourDoneAt && store.wasSeeded && !store.loadWarning) {
    requestAnimationFrame(() => tourStart({ auto: true }));
  }
});
