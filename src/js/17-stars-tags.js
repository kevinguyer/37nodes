/* ===== 17 stars and tags =====
   Two document-wide indexes and the gestures that feed them:

   - **Starred** items: an explicit shortlist the user curates. `starred` is a
     content flag like `completed`, so a star gesture on a mirror row lands on
     the original — the only node that could hold it.
   - The **tag vocabulary**: every `#tag` the document actually uses, with a
     count of the items using it. Derived, never stored, and rebuilt lazily
     behind a dirty flag — the same pattern as the backlink index in 16.

   The info panel reads both; the '#' suggester in 11 reads the tag one.
   Mirrors own no text, so they contribute no tags: the original already
   reports the usage, and counting the mirror would double it. */

let stDirty = true;
let starCache = null;      // [node] in document order
const tagCache = new Map(); // scope id -> Map(lowercased tag -> {tag, count})

function stSync() {
  if (!stDirty) return;
  stDirty = false;
  starCache = null;
  tagCache.clear();
}
store.subscribe(ev => {
  if (ev.type === 'node' || ev.type === 'children' || ev.type === 'doc') stDirty = true;
});

/* --- starred ----------------------------------------------------------- */
function starredItems() {
  stSync();
  if (starCache) return starCache;
  const out = [];
  (function walk(n) {
    for (const c of n.children) { if (c.starred) out.push(c); walk(c); }
  })(store.doc.root);
  return (starCache = out);
}
function isStarred(id) {
  const n = store.getNode(id);
  return !!(n && n.starred);
}

/* --- tags -------------------------------------------------------------- */
/* Same word-boundary rule as the renderer's chips (F43), so the index lists
   exactly the tokens that show up as chips and nothing else. */
const TAG_SCAN_RE = /(^|\s)(#[\w-]+)/g;
function scanTags(text, fn) {
  if (!text) return;
  TAG_SCAN_RE.lastIndex = 0;
  for (let m; (m = TAG_SCAN_RE.exec(text)); ) fn(m[2]);
}
/* Scoped to a subtree because search is (F24): a tag listed for the current
   zoom is one a click can actually find. Tags are matched case-insensitively,
   so casings collapse onto the first spelling seen. */
function tagIndex(scopeId) {
  stSync();
  const key = scopeId || ROOT_ID;
  const hit = tagCache.get(key);
  if (hit) return hit;
  const map = new Map();
  (function walk(n) {
    for (const c of n.children) {
      if (!c.mirrorOf) {
        const seen = new Set(); // an item using #todo twice is still one item
        const take = t => {
          const k = t.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k);
          const e = map.get(k);
          if (e) e.count++;
          else map.set(k, { tag: t, count: 1 });
        };
        scanTags(c.title, take);
        scanTags(c.note, take);
      }
      walk(c);
    }
  })(store.getNode(key) || store.doc.root);
  tagCache.set(key, map);
  return map;
}
function tagsAlphabetical(scopeId) {
  return [...tagIndex(scopeId).values()]
    .sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
}
function tagsByUse(scopeId) {
  return [...tagIndex(scopeId).values()]
    .sort((a, b) => b.count - a.count || a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
}

/* --- star gestures ------------------------------------------------------ */
/* What a keyboard star acts on: the item the caret is in, falling back to the
   one the panel is tracking (which is that same item, debounced, or the zoom
   target when nothing has focus). */
function starTargetId() {
  const a = document.activeElement;
  const t = a && a.closest?.('.title');
  if (t) return contentIdOfTitle(t);
  const ta = a && a.closest?.('.note-edit');
  if (ta) return contentIdOfNoteEditor(ta);
  const tracked = ipActiveId && store.getNode(ipActiveId) ? ipActiveId : view.focusId;
  return tracked === ROOT_ID ? null : tracked;
}

// the ★ badge on a row is an unstar button; the row underneath must not also
// take the click and start editing the title
treeEl.addEventListener('click', e => {
  const s = e.target.closest('.star');
  if (!s) return;
  e.preventDefault();
  e.stopPropagation();
  const el = s.closest('.node');
  if (el) store.toggleStarred(el.dataset.mirror || el.dataset.id);
});

// the zoom header stands in for the zoomed item's missing row
focusStarEl.addEventListener('click', () => {
  if (view.focusId !== ROOT_ID) store.toggleStarred(view.focusId);
});

document.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  // Alt+letter reports differently across keyboard layouts (some send a dead
  // key or an accented character as e.key), so match the physical key too
  if (e.code !== 'KeyS' && e.key !== 's' && e.key !== 'S') return;
  const id = starTargetId();
  if (!id) return;
  e.preventDefault();
  store.toggleStarred(id);
});
