/* ===== 05 search ===== */

const applySearch = debounce(() => {
  const q = searchEl.value;
  if (q === view.query) return;
  view.query = q;
  clearFilterExempt(); // a new query gets a clean set of results
  renderAll();
  ipRefresh(); // the query is view state, not a mutation: the panel's tag
               // chips have no store event to ride
  ssSync(); // the ☆ beside the box follows the query
}, 150);

function setSearch(q) {
  searchEl.value = q;
  applySearch();
  applySearch.flush();
}
/* A plain click replaces the query with the tag, or clears it when the tag is
   already the whole query. Shift+click edits the query instead (F77): the tag
   becomes one more term, or is taken back out — how a second tag narrows. */
function toggleTagFilter(tag, add = false) {
  if (add) {
    const q = queryToggleTag(view.query, tag);
    if (q.trim()) setSearch(q); else clearSearch();
  } else if (queryIsOnlyTag(view.query, tag)) clearSearch();
  else setSearch(tag);
}
/* tag chips: clicking one filters by that tag; clicking it again clears */
document.addEventListener('click', e => {
  const tag = e.target.closest?.('.title .tag');
  if (!tag) return;
  e.preventDefault();
  toggleTagFilter(tag.textContent, e.shiftKey);
});

/* "Show only what links to or from this item" (F78): types links:"Title" into
   the search box, so the filter is an ordinary query — visible, editable,
   clearable with Esc, savable. Run it again on the same item to clear.
   `links:` resolves by title, so the gesture is only honest when this item is
   the one its title resolves to; otherwise it would quietly filter around a
   different item, and it says so instead. */
function filterToLinked(id) {
  const n = store.getNode(id);
  if (!n || id === ROOT_ID) return;
  const title = (n.title || '').trim();
  const say = msg => showBanner(msg, { kind: 'notice', action: { label: 'OK', onClick: () => hideBanner() } });
  if (!title) { say('Give this item a title first — links are matched by title.'); return; }
  if (resolveTitleLink(title) !== id) {
    say(`Another item is also called “${truncate(title, 40)}”, and links resolve to the first one in the outline. Rename one of them to filter by this item's links.`);
    return;
  }
  if (queryIsOnlyLinks(view.query, title)) clearSearch(false);
  else setSearch('links:' + queryQuote(title));
  focusNodeTitle(id, 'end'); // a no-op when the item sits outside the zoom
}
document.addEventListener('keydown', e => {
  if (!altChord(e, 'KeyL')) return;
  const id = starTargetId(); // the item the caret is in, else the one the panel tracks
  if (!id) return;
  e.preventDefault();
  filterToLinked(id);
});

function clearSearch(refocusOutline = true) {
  searchEl.value = '';
  clearFilterExempt();
  if (view.query) {
    view.query = '';
    renderAll();
    ipRefresh();
    ssSync();
  }
  if (refocusOutline) {
    const first = visibleTitles()[0];
    if (first) activateTitle(first, 'end');
  }
}

searchEl.addEventListener('input', applySearch);
searchEl.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault();
    clearSearch();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    applySearch.flush();
    const f = view.filter;
    if (!f) return;
    const first = visibleTitles().find(t => {
      const id = idOfTitle(t);
      return id && f.matched.has(id);
    });
    if (first) activateTitle(first, 0);
  }
});
