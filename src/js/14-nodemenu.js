/* ===== 14 node menu =====
   The per-item ≡ handle popover: heading format, bullet color, and one-click
   actions. One shared panel (#node-menu), repositioned to whichever row
   opened it. Never holds an element reference across a store mutation —
   filtered rebuilds clear elMap — so it closes on any structural event. */

const nodeMenuEl = $('#node-menu');
let nmId = null;          // node the open menu acts on; null = closed
let nmViaKeyboard = false;

function nodeMenuOpen() { return nmId !== null; }

function closeNodeMenu({ refocus = false } = {}) {
  if (!nodeMenuOpen()) return;
  const id = nmId;
  nmId = null;
  nodeMenuEl.hidden = true;
  if (refocus && store.getNode(id)) focusNodeTitle(id, 'end');
}

function syncNodeMenu(n) {
  const c = store.mirrorContent(n) || n; // a mirror row shows its target's state
  for (const b of nodeMenuEl.querySelectorAll('.nm-fmt')) {
    b.classList.toggle('active', (c.format || '') === b.dataset.format);
  }
  for (const b of nodeMenuEl.querySelectorAll('.nm-color')) {
    b.classList.toggle('active', (c.color || '') === b.dataset.color);
  }
  $('#nm-star').textContent = c.starred ? 'Unstar this item' : 'Star this item';
  $('#nm-complete').textContent = c.completed ? 'Un-complete' : 'Complete';
  $('#nm-note').textContent = c.note ? 'Edit note' : 'Add note';
  $('#nm-mirror').textContent = n.mirrorOf ? 'Mirror the original again' : 'Mirror this item';
}

function openNodeMenu(id, { viaKeyboard = false } = {}) {
  const n = store.getNode(id);
  const el = nodeEl(id);
  if (!n || !el) return;
  if (nmId === id) { closeNodeMenu(); return; } // same handle again: toggle
  nmId = id;
  nmViaKeyboard = viaKeyboard;
  syncNodeMenu(n);
  // position: below the row's gutter, clamped to the viewport
  const row = el.querySelector(':scope > .row');
  const r = row.getBoundingClientRect();
  nodeMenuEl.hidden = false;
  const mw = nodeMenuEl.offsetWidth, mh = nodeMenuEl.offsetHeight;
  nodeMenuEl.style.left = clamp(r.left - 18, 8, window.innerWidth - mw - 8) + 'px';
  nodeMenuEl.style.top = clamp(
    r.bottom + 2 + mh <= window.innerHeight - 8 ? r.bottom + 2 : r.top - mh - 2,
    8, window.innerHeight - mh - 8) + 'px';
  if (viaKeyboard) nodeMenuEl.querySelector('.nm-fmt').focus();
}

/* --- actions ---------------------------------------------------------- */
/* Every handler re-reads the node: the id may have died since open (another
   tab, an undo). Actions close the menu; the store-event guard below would
   anyway, this just also covers non-emitting paths like openNoteEditor. */
function nmNode() { return nmId !== null ? store.getNode(nmId) : null; }

nodeMenuEl.addEventListener('click', e => {
  e.stopPropagation();
  const id = nmId;
  const n = nmNode();
  if (!n) { closeNodeMenu(); return; }
  // content actions act on the target when the row is a mirror;
  // structural actions (duplicate, delete) act on the row's own node
  const cid = (store.mirrorContent(n) || n).id;
  const host = nodeEl(id);
  const fmt = e.target.closest('.nm-fmt');
  if (fmt) { store.setFormat(cid, fmt.dataset.format); closeNodeMenu({ refocus: nmViaKeyboard }); return; }
  const col = e.target.closest('.nm-color');
  if (col) { store.setColor(cid, col.dataset.color); closeNodeMenu({ refocus: nmViaKeyboard }); return; }
  switch (e.target.closest('button')?.id) {
    case 'nm-star':
      store.toggleStarred(cid);
      closeNodeMenu({ refocus: nmViaKeyboard });
      break;
    case 'nm-complete':
      store.toggleCompleted(cid);
      closeNodeMenu({ refocus: nmViaKeyboard });
      break;
    case 'nm-zoom':
      closeNodeMenu();
      location.hash = '#' + cid;
      break;
    case 'nm-note':
      closeNodeMenu();
      openNoteEditor(cid, host);
      break;
    case 'nm-mirror': {
      const copy = store.createMirror(id);
      closeNodeMenu();
      if (copy) {
        keepInFilter(copy.id);
        focusNodeTitle(copy.id, 'end');
      }
      break;
    }
    case 'nm-duplicate': {
      const copy = store.duplicate(id);
      closeNodeMenu();
      if (copy) {
        keepInFilter(copy.id); // a copy made mid-search matches nothing yet
        focusNodeTitle(copy.id, 'end');
      }
      break;
    }
    case 'nm-copy':
      copySubtreeMarkdown(cid); // a mirror copies what it shows
      closeNodeMenu({ refocus: nmViaKeyboard });
      break;
    case 'nm-delete': {
      // land the caret on the previous visible row, like Ctrl+Shift+Backspace
      const el = nodeEl(id);
      const prevT = el && siblingTitle(el.querySelector(':scope > .row > .title'), -1);
      const prevId = prevT && idOfTitle(prevT);
      closeNodeMenu();
      store.deleteSubtree(id);
      if (prevId && store.getNode(prevId)) focusNodeTitle(prevId, 'end');
      break;
    }
  }
});

/* --- open triggers ---------------------------------------------------- */
treeEl.addEventListener('click', e => {
  const h = e.target.closest('.handle');
  if (!h) return;
  e.stopPropagation();
  const el = h.closest('.node');
  if (el) openNodeMenu(el.dataset.id);
});
treeEl.addEventListener('contextmenu', e => {
  const b = e.target.closest('.bullet, .handle');
  if (!b) return;
  e.preventDefault();
  const el = b.closest('.node');
  if (el) openNodeMenu(el.dataset.id);
});

/* --- close triggers --------------------------------------------------- */
document.addEventListener('click', e => {
  if (nodeMenuOpen() && !e.target.closest('#node-menu') && !e.target.closest('.handle')) closeNodeMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && nodeMenuOpen()) {
    e.preventDefault();
    closeNodeMenu({ refocus: true });
  }
});
window.addEventListener('blur', () => closeNodeMenu());
// the panel is position:fixed; scrolling would leave it hanging mid-air
window.addEventListener('scroll', () => closeNodeMenu(), { passive: true });
/* any mutation can rebuild the tree (and, mid-search, clear elMap), so an
   open menu's anchor row may no longer exist: close rather than drift */
store.subscribe(ev => {
  if (!nodeMenuOpen()) return;
  if (ev.type === 'children' || ev.type === 'doc' || ev.type === 'collapse') closeNodeMenu();
});
