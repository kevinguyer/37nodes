/* ===== 07 drag & drop ===== */

let dragId = null;
let dropRow = null;

function clearDropMarks() {
  if (dropRow) {
    dropRow.classList.remove('drop-before', 'drop-after', 'drop-into');
    dropRow = null;
  }
}

treeEl.addEventListener('dragstart', e => {
  const bullet = e.target.closest('.bullet');
  if (!bullet) { e.preventDefault(); return; }
  const el = bullet.closest('.node');
  dragId = el.dataset.id;
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  const n = store.getNode(dragId);
  if (n) e.dataTransfer.setData('text/plain', nodeToMarkdownText(n));
});

treeEl.addEventListener('dragend', () => {
  clearDropMarks();
  const el = dragId && nodeEl(dragId);
  if (el) el.classList.remove('dragging');
  dragId = null;
});

treeEl.addEventListener('dragover', e => {
  if (!dragId) return;
  const row = e.target.closest('.row');
  if (!row) { clearDropMarks(); return; }
  const el = row.closest('.node');
  const tid = el.dataset.id;
  if (tid === dragId || store.isDescendant(tid, dragId)) { clearDropMarks(); return; }
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const r = row.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  const mode = y < 0.3 ? 'drop-before' : y > 0.7 ? 'drop-after' : 'drop-into';
  if (dropRow !== row || !row.classList.contains(mode)) {
    clearDropMarks();
    row.classList.add(mode);
    dropRow = row;
  }
});

treeEl.addEventListener('drop', e => {
  if (!dragId || !dropRow) return;
  e.preventDefault();
  const mode = ['drop-before', 'drop-after', 'drop-into'].find(m => dropRow.classList.contains(m));
  const targetEl = dropRow.closest('.node');
  const tid = targetEl.dataset.id;
  const movedId = dragId;
  clearDropMarks();
  const target = store.getNode(tid);
  if (!target) return;
  if (mode === 'drop-into') {
    store.setCollapsed(tid, false);
    store.move(movedId, tid, 0);
  } else {
    const parent = store.getParent(tid);
    if (!parent) return;
    const idx = parent.children.indexOf(target);
    store.move(movedId, parent.id, mode === 'drop-before' ? idx : idx + 1);
  }
  focusNodeTitle(movedId, 'end');
});
