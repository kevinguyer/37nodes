/* ===== 03 store =====
   Document state, ops-based undo/redo, persistence.
   All mutations flow through recorded ops so undo is exact and cheap.
   Collapse state is deliberately NOT undoable (it's view state, but persisted). */

const ROOT_ID = 'root';
const SCHEMA_VERSION = 1;
const DOC_KEY = '37nodes:doc';
const PREFS_KEY = '37nodes:prefs';
const UNDO_LIMIT = 200;

let doc = null;
let loadWarning = null;
let seeded = false; // true when this session started from the seed (a genuine first run)
const nodeIndex = new Map(); // id -> {node, parent}
const listeners = [];
const undoStack = [];
const redoStack = [];
let groupRec = null;  // open op group (one undo step)
let typingRec = null; // last record if it was a coalescible typing burst

function subscribe(fn) { listeners.push(fn); }
function emit(ev) { for (const fn of listeners) fn(ev); }

function newNode(props = {}) {
  const t = nowISO();
  return Object.assign({
    id: uid(), title: '', note: '', children: [],
    collapsed: false, completed: false, createdAt: t, updatedAt: t,
  }, props);
}

function getNode(id) { const e = nodeIndex.get(id); return e ? e.node : null; }
function getParent(id) { const e = nodeIndex.get(id); return e ? e.parent : null; }
function ancestorsOf(id) { // [root, ..., parent]
  const out = [];
  let p = getParent(id);
  while (p) { out.unshift(p); p = getParent(p.id); }
  return out;
}
function isDescendant(id, ancestorId) {
  let p = getParent(id);
  while (p) { if (p.id === ancestorId) return true; p = getParent(p.id); }
  return false;
}
function countNodes(n) { return 1 + n.children.reduce((s, c) => s + countNodes(c), 0); }

function indexSubtree(n, parent) {
  nodeIndex.set(n.id, { node: n, parent });
  for (const c of n.children) indexSubtree(c, n);
}
function unindexSubtree(n) {
  nodeIndex.delete(n.id);
  for (const c of n.children) unindexSubtree(c);
}

/* --- op primitives ------------------------------------------------ */
function rawInsert(parentId, index, node) {
  const p = getNode(parentId);
  if (!p) return;
  p.children.splice(clamp(index, 0, p.children.length), 0, node);
  indexSubtree(node, p);
}
function rawRemove(id) {
  const e = nodeIndex.get(id);
  if (!e || !e.parent) return;
  const arr = e.parent.children;
  const i = arr.indexOf(e.node);
  if (i >= 0) arr.splice(i, 1);
  unindexSubtree(e.node);
}
function rawMove(id, parentId, index) {
  const e = nodeIndex.get(id);
  const p = getNode(parentId);
  if (!e || !e.parent || !p) return;
  const fi = e.parent.children.indexOf(e.node);
  e.parent.children.splice(fi, 1);
  p.children.splice(clamp(index, 0, p.children.length), 0, e.node);
  nodeIndex.set(id, { node: e.node, parent: p });
  e.node.updatedAt = nowISO();
}
function applyOp(op, dir) { // dir: 1 = forward, -1 = inverse
  switch (op.t) {
    case 'text': {
      const n = getNode(op.id);
      if (n) { n[op.field] = dir > 0 ? op.b : op.a; n.updatedAt = nowISO(); }
      break;
    }
    case 'flag': {
      const n = getNode(op.id);
      if (n) n[op.key] = dir > 0 ? op.b : op.a;
      break;
    }
    case 'ins':
      if (dir > 0) rawInsert(op.parentId, op.index, op.node);
      else rawRemove(op.node.id);
      break;
    case 'del':
      if (dir > 0) rawRemove(op.node.id);
      else rawInsert(op.parentId, op.index, op.node);
      break;
    case 'mv':
      if (dir > 0) rawMove(op.id, op.tp, op.ti);
      else rawMove(op.id, op.fp, op.fi);
      break;
  }
}

/* --- recording ---------------------------------------------------- */
function pushRecord(rec) {
  undoStack.push(rec);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  if (!rec.typing) typingRec = null;
}
function record(op) {
  applyOp(op, 1);
  if (groupRec) groupRec.ops.push(op);
  else pushRecord({ ops: [op] });
}
function group(fn) {
  const isOuter = !groupRec;
  if (isOuter) groupRec = { ops: [] };
  try { fn(); }
  finally {
    if (isOuter) {
      const rec = groupRec;
      groupRec = null;
      typingRec = null;
      if (rec.ops.length) pushRecord(rec);
    }
  }
}
function breakTyping() { typingRec = null; }

/* --- text (typing, coalesced per burst) ---------------------------- */
function setText(id, field, value) {
  const n = getNode(id);
  if (!n || n[field] === value) return;
  const op = { t: 'text', id, field, a: n[field], b: value };
  if (groupRec) {
    groupRec.ops.push(op);
  } else if (typingRec && typingRec.id === id && typingRec.field === field) {
    typingRec.ops[0].b = value;
  } else {
    const rec = { ops: [op], typing: true, id, field };
    pushRecord(rec);
    typingRec = rec;
  }
  n[field] = value;
  n.updatedAt = nowISO();
  scheduleSave();
  emit({ type: 'node', id, typing: true });
}
const setTitle = (id, v) => setText(id, 'title', v);
const setNote = (id, v) => setText(id, 'note', v);

function setTitleImmediate(id, value) {
  const n = getNode(id);
  if (!n || n.title === value) return;
  group(() => record({ t: 'text', id, field: 'title', a: n.title, b: value }));
  scheduleSave();
  emit({ type: 'node', id });
}

/* --- structural actions -------------------------------------------- */
function create(parentId, index, props = {}) {
  const node = newNode(props);
  group(() => record({ t: 'ins', parentId, index, node }));
  scheduleSave();
  emit({ type: 'children', id: parentId });
  return node;
}

function createTree(parentId, index, spec) {
  const build = s => {
    const n = newNode({ title: s.text || '' });
    n.children = (s.children || []).map(build);
    return n;
  };
  const node = build(spec);
  group(() => record({ t: 'ins', parentId, index, node }));
  scheduleSave();
  emit({ type: 'children', id: parentId });
  return node;
}

function deletePromote(id) {
  const n = getNode(id), p = getParent(id);
  if (!n || !p) return;
  const idx = p.children.indexOf(n);
  const kids = [...n.children];
  group(() => {
    kids.forEach((c, k) => record({ t: 'mv', id: c.id, fp: n.id, fi: 0, tp: p.id, ti: idx + k }));
    record({ t: 'del', parentId: p.id, index: idx + kids.length, node: n });
  });
  scheduleSave();
  emit({ type: 'children', id: p.id });
}

function deleteSubtree(id) {
  const n = getNode(id), p = getParent(id);
  if (!n || !p) return;
  const idx = p.children.indexOf(n);
  group(() => record({ t: 'del', parentId: p.id, index: idx, node: n }));
  scheduleSave();
  emit({ type: 'children', id: p.id });
}

function move(id, toParentId, toIndex) {
  const n = getNode(id), p = getParent(id), tp = getNode(toParentId);
  if (!n || !p || !tp) return false;
  if (id === toParentId || isDescendant(toParentId, id)) return false;
  const fi = p.children.indexOf(n);
  let ti = toIndex;
  if (tp === p && fi < toIndex) ti = toIndex - 1; // index after removal
  if (tp === p && ti === fi) return false;
  group(() => record({ t: 'mv', id, fp: p.id, fi, tp: toParentId, ti }));
  scheduleSave();
  emit({ type: 'children', id: p.id });
  if (toParentId !== p.id) emit({ type: 'children', id: toParentId });
  return true;
}

function indent(id) {
  const p = getParent(id);
  if (!p) return false;
  const i = p.children.indexOf(getNode(id));
  if (i <= 0) return false;
  const prev = p.children[i - 1];
  if (prev.collapsed) { prev.collapsed = false; } // view state, not undoable
  group(() => record({ t: 'mv', id, fp: p.id, fi: i, tp: prev.id, ti: prev.children.length }));
  scheduleSave();
  emit({ type: 'children', id: p.id });
  emit({ type: 'children', id: prev.id });
  return true;
}

function outdent(id, boundaryId) {
  const p = getParent(id);
  if (!p || p.id === boundaryId) return false;
  const g = getParent(p.id);
  if (!g) return false;
  const gi = g.children.indexOf(p);
  const i = p.children.indexOf(getNode(id));
  group(() => record({ t: 'mv', id, fp: p.id, fi: i, tp: g.id, ti: gi + 1 }));
  scheduleSave();
  emit({ type: 'children', id: g.id });
  emit({ type: 'children', id: p.id });
  return true;
}

function moveSibling(id, dir) {
  const p = getParent(id);
  if (!p) return false;
  const i = p.children.indexOf(getNode(id));
  const j = i + dir;
  if (j < 0 || j >= p.children.length) return false;
  group(() => record({ t: 'mv', id, fp: p.id, fi: i, tp: p.id, ti: j }));
  scheduleSave();
  emit({ type: 'children', id: p.id });
  return true;
}

function setCollapsed(id, val) { // not undoable: collapse is view state
  const n = getNode(id);
  if (!n || n.collapsed === val) return;
  n.collapsed = val;
  scheduleSave();
  emit({ type: 'collapse', id });
}

function toggleCompleted(id) {
  const n = getNode(id);
  if (!n) return;
  group(() => record({ t: 'flag', id, key: 'completed', a: n.completed, b: !n.completed }));
  scheduleSave();
  emit({ type: 'node', id });
}

/* --- undo / redo ---------------------------------------------------- */
function focusHintFor(rec) {
  for (const op of rec.ops) {
    const id = (op.t === 'ins' || op.t === 'del') ? op.node.id : op.id;
    if (getNode(id)) return id;
  }
  for (const op of rec.ops) {
    const pid = op.parentId || op.fp || op.tp;
    if (pid && getNode(pid)) return pid;
  }
  return null;
}
function undo() {
  breakTyping();
  const rec = undoStack.pop();
  if (!rec) return null;
  for (let k = rec.ops.length - 1; k >= 0; k--) applyOp(rec.ops[k], -1);
  redoStack.push(rec);
  scheduleSave();
  emit({ type: 'doc' });
  return focusHintFor(rec);
}
function redo() {
  breakTyping();
  const rec = redoStack.pop();
  if (!rec) return null;
  for (const op of rec.ops) applyOp(op, 1);
  undoStack.push(rec);
  scheduleSave();
  emit({ type: 'doc' });
  return focusHintFor(rec);
}

/* --- persistence ----------------------------------------------------- */
let saveErrored = false;
function saveNow() {
  if (!doc) return;
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      savedAt: nowISO(),
      focusId: doc.focusId,
      root: doc.root,
    }));
    emit({ type: 'save', state: 'saved', recovered: saveErrored });
    saveErrored = false;
  } catch (err) {
    saveErrored = true;
    emit({ type: 'save', state: 'error', error: err });
  }
}
const saveDebounced = debounce(saveNow, 300);
function scheduleSave() {
  emit({ type: 'save', state: 'saving' });
  saveDebounced();
}

function normalizeNode(n) {
  const t = nowISO();
  n = (n && typeof n === 'object') ? n : {};
  return {
    id: (typeof n.id === 'string' && n.id) ? n.id : uid(),
    title: typeof n.title === 'string' ? n.title : '',
    note: typeof n.note === 'string' ? n.note : '',
    collapsed: !!n.collapsed,
    completed: !!n.completed,
    createdAt: typeof n.createdAt === 'string' ? n.createdAt : t,
    updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : t,
    children: Array.isArray(n.children) ? n.children.map(normalizeNode) : [],
  };
}
function regenIds(n) {
  n.id = uid();
  n.children.forEach(regenIds);
  return n;
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(DOC_KEY); }
  catch (e) { loadWarning = 'Local storage is not available in this browser context, so nothing will be saved.'; }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data && data.root) {
        if ((data.schemaVersion || 1) > SCHEMA_VERSION) {
          loadWarning = 'This outline was saved by a newer version of 37nodes. It has been loaded as-is; some data may not round-trip.';
        }
        doc = {
          schemaVersion: SCHEMA_VERSION,
          savedAt: data.savedAt || nowISO(),
          focusId: typeof data.focusId === 'string' ? data.focusId : ROOT_ID,
          root: normalizeNode(data.root),
        };
      }
    } catch (e) {
      loadWarning = 'Saved data could not be read (corrupted JSON). Starting fresh. The broken payload was left in place.';
    }
  }
  if (!doc) {
    doc = { schemaVersion: SCHEMA_VERSION, savedAt: nowISO(), focusId: ROOT_ID, root: seedRoot() };
    seeded = true;
  }
  doc.root.id = ROOT_ID;
  nodeIndex.clear();
  indexSubtree(doc.root, null);
  return doc;
}
function setSavedFocus(id) {
  if (doc && doc.focusId !== id) { doc.focusId = id; scheduleSave(); }
}

function importReplace(rootNode) {
  doc.root = normalizeNode(rootNode);
  doc.root.id = ROOT_ID;
  nodeIndex.clear();
  indexSubtree(doc.root, null);
  undoStack.length = 0;
  redoStack.length = 0;
  typingRec = null;
  saveNow();
  emit({ type: 'doc' });
}
function importAppend(children) {
  group(() => {
    for (const c of children) {
      const norm = regenIds(normalizeNode(c));
      record({ t: 'ins', parentId: ROOT_ID, index: doc.root.children.length, node: norm });
    }
  });
  scheduleSave();
  emit({ type: 'children', id: ROOT_ID });
}

/* --- seed document ---------------------------------------------------- */
function seedRoot() {
  const mk = (title, note = '', children = [], extra = {}) =>
    Object.assign(newNode({ title, note }), { children }, extra);
  return mk('', '', [
    mk('Welcome to 37nodes 👋',
      '**Infinite depth. Zero chaos.**\n\n37nodes is an outliner: every line is an item, and every item can hold a whole world inside it.\n\nThis starter outline is a mini-tutorial. Edit or delete anything.'),
    mk('Outlining basics', '', [
      mk('Press Enter to make a new item, right below this one'),
      mk('Press Tab to indent an item, Shift+Tab to outdent'),
      mk('Move items with Alt+↑ / Alt+↓, or drag them by the bullet'),
      mk('Check things off with Ctrl+Enter', '', [], { completed: true }),
      mk('Click a bullet (or press Alt+→) to zoom in: try it here', '', [
        mk('You zoomed! The breadcrumbs at the top lead back out.'),
        mk('Zooming works at any depth. Alt+← zooms back out.'),
      ]),
      mk('This item is collapsed: click its ▸ arrow or press Ctrl+↓ on it', '', [
        mk('Hidden treasure.'),
        mk('The ring around a bullet means something is inside.'),
      ], { collapsed: true }),
    ]),
    mk('Notes & markdown',
      'Any item can carry a note like this one. Notes speak **markdown**:\n\n- *emphasis* and **strong**\n- `inline code`\n- [links](https://en.wikipedia.org/wiki/Holarchy)\n\n> Blockquotes too.\n\nPress Shift+Enter on any item to add or edit its note; click away and it renders.',
      [mk('Press Shift+Enter here and write yourself a note')]),
    mk('Make it yours', '', [
      mk('Open the ☰ menu to pick a theme, try E-ink or Green CRT'),
      mk('Search everything with Ctrl+F'),
      mk('Jump straight to any item with Ctrl+K'),
      mk('Add #tags to any item, then click a tag to filter by it #demo'),
      mk('Link between items with [[Outlining basics]], click it to jump'),
      mk('Type [[ anywhere to pick the item you mean from a list'),
      mk('Press ? for the full keyboard reference'),
    ]),
    mk('About your data',
      'Everything lives in *this browser\'s* local storage, so nothing ever leaves your machine. Browsers can evict local storage when clearing site data, so use **Export JSON** in the ☰ menu for real backups.'),
  ]);
}

const store = {
  ROOT_ID, DOC_KEY, PREFS_KEY,
  subscribe, getNode, getParent, ancestorsOf, isDescendant, countNodes,
  group, breakTyping,
  setTitle, setNote, setTitleImmediate,
  create, createTree, deletePromote, deleteSubtree,
  move, indent, outdent, moveSibling,
  setCollapsed, toggleCompleted,
  undo, redo,
  load, saveNow, scheduleSave, setSavedFocus,
  importReplace, importAppend,
  get doc() { return doc; },
  get loadWarning() { return loadWarning; },
  get wasSeeded() { return seeded; },
};
