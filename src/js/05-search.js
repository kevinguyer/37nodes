/* ===== 05 search ===== */

const applySearch = debounce(() => {
  const q = searchEl.value;
  if (q === view.query) return;
  view.query = q;
  renderAll();
}, 150);

function setSearch(q) {
  searchEl.value = q;
  applySearch();
  applySearch.flush();
}
function toggleTagFilter(tag) {
  if (view.query.trim().toLowerCase() === tag.toLowerCase()) clearSearch();
  else setSearch(tag);
}
/* tag chips: clicking one filters by that tag; clicking it again clears */
document.addEventListener('click', e => {
  const tag = e.target.closest?.('.title .tag');
  if (!tag) return;
  e.preventDefault();
  toggleTagFilter(tag.textContent);
});

function clearSearch(refocusOutline = true) {
  searchEl.value = '';
  if (view.query) {
    view.query = '';
    renderAll();
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
