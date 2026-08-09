/* ===== 06 keyboard & editing events =====
   All title/note events are delegated at the document level so the
   focus-header title and tree titles share one code path.            */

function onTitleInput(el) {
  const id = contentIdOfTitle(el); // a mirror row's text lives on its target
  if (!id) return;
  // contenteditable can sneak in <br>/newlines via some IME paths; flatten
  const v = el.textContent.replace(/\n/g, ' ');
  store.setTitle(id, v);
}

/* the mirror-expansion suffix of the row a title sits in ('' elsewhere) */
function sfxOfTitle(el) {
  const nd = el.closest?.('.node');
  return nd ? suffixOf(nd) : '';
}

function navRelative(el, dir, off) {
  const t = siblingTitle(el, dir);
  if (!t) return false;
  activateTitle(t, off);
  return true;
}

function handleEnter(el, id) {
  const n = store.getNode(id);
  const content = store.mirrorContent(n) || n; // mirror rows: text/children live on the target
  const off = caretOffset(el);
  const text = el.textContent;
  const sfx = sfxOfTitle(el);
  if (el === focusTitleEl) {
    const nn = store.create(id, 0, {});
    keepInFilter(nn.id);
    focusNodeTitle(nn.id, 0);
    return;
  }
  const parent = store.getParent(id);
  const idx = parent.children.indexOf(n);
  let focusAfter = null, focusOff = 0, focusSfx = sfx;
  const touched = []; // ids that must survive an active search filter
  store.group(() => {
    if (off >= text.length) {
      // at end: into expanded children, else sibling after
      if (content.children.length && !n.collapsed && !view.filter) {
        focusAfter = store.create(content.id, 0).id;
        // the child renders inside this row's expansion when it's a mirror
        if (n.mirrorOf) focusSfx = sfx + '@' + n.id;
      } else {
        focusAfter = store.create(parent.id, idx + 1).id;
      }
      touched.push(focusAfter);
    } else if (off === 0 && text.length) {
      // at start: empty item above, caret stays on current text
      touched.push(store.create(parent.id, idx, {}).id);
      focusAfter = id;
    } else {
      // split at caret
      store.setTitleImmediate(content.id, text.slice(0, off));
      focusAfter = store.create(parent.id, idx + 1, { title: text.slice(off) }).id;
      // the half left behind may no longer match the search that found it
      touched.push(id, focusAfter);
    }
  });
  keepInFilter(touched);
  focusNodeTitle(focusAfter, focusOff, focusSfx);
}

function handleBackspace(e, el, id) {
  if (el === focusTitleEl) return; // focus header: never delete via backspace
  if (caretOffset(el) !== 0 || !selectionCollapsedIn(el)) return;
  if (el.textContent.length > 0) return; // only empty items die by backspace
  e.preventDefault();
  const prevT = siblingTitle(el, -1);
  const nextT = siblingTitle(el, 1);
  const prevId = prevT && idOfTitle(prevT);
  const nextId = nextT && idOfTitle(nextT);
  store.deletePromote(id);
  const target = (prevId && store.getNode(prevId)) ? prevId
    : (nextId && store.getNode(nextId)) ? nextId : null;
  if (target) focusNodeTitle(target, target === prevId ? 'end' : 0);
}

function handleDeleteSubtree(e, el, id) {
  if (el === focusTitleEl) return;
  e.preventDefault();
  const prevT = siblingTitle(el, -1);
  const prevId = prevT && idOfTitle(prevT);
  store.deleteSubtree(id);
  if (prevId && store.getNode(prevId)) focusNodeTitle(prevId, 'end');
  else {
    const first = visibleTitles()[0];
    if (first) activateTitle(first, 0);
  }
}

function onTitleKeydown(e, el) {
  const id = idOfTitle(el);
  if (!id) return;
  const n = store.getNode(id);
  if (!n) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key;

  // --- undo/redo ---
  if (mod && !e.altKey && (key === 'z' || key === 'Z')) {
    e.preventDefault();
    const fid = e.shiftKey ? store.redo() : store.undo();
    if (fid) focusNodeTitle(fid, 'end');
    return;
  }
  if (mod && !e.shiftKey && (key === 'y' || key === 'Y')) {
    e.preventDefault();
    const fid = store.redo();
    if (fid) focusNodeTitle(fid, 'end');
    return;
  }
  // --- copy subtree as markdown ---
  if (mod && e.shiftKey && (key === 'c' || key === 'C')) {
    e.preventDefault();
    copySubtreeMarkdown(id);
    return;
  }
  // --- item menu (headings, colors, actions) ---
  if (mod && key === '.') {
    e.preventDefault();
    if (el !== focusTitleEl) openNodeMenu(id, { viaKeyboard: true });
    return;
  }
  // --- inline formatting (claimed from the browser, which would insert
  //     <b>/<i>/<u> elements into what must stay a plain-text editor) ---
  if (mod && !e.altKey && !e.shiftKey && 'biuBIU'.includes(key)) {
    e.preventDefault();
    fmtShortcut(el, key.toLowerCase());
    return;
  }

  switch (key) {
    case 'Enter':
      if (e.shiftKey) {
        e.preventDefault();
        openNoteEditor(contentIdOfTitle(el), el.closest('.node'));
        return;
      }
      if (mod) {
        e.preventDefault();
        if (el === focusTitleEl) return;
        store.toggleCompleted(contentIdOfTitle(el));
        // if hide-completed just swallowed the row, land somewhere sensible
        if (el.offsetParent === null) {
          const t = siblingTitle(el, 1) || siblingTitle(el, -1);
          if (t) activateTitle(t, 0);
        }
        return;
      }
      e.preventDefault();
      handleEnter(el, id);
      return;

    case 'Tab': {
      e.preventDefault();
      if (el === focusTitleEl) return;
      const off = caretOffset(el);
      const sfx = sfxOfTitle(el);
      const ok = e.shiftKey ? store.outdent(id, view.focusId) : store.indent(id);
      if (ok) focusNodeTitle(id, off, sfx);
      return;
    }

    case 'Backspace':
      if (mod && e.shiftKey) { handleDeleteSubtree(e, el, id); return; }
      handleBackspace(e, el, id);
      return;

    case 'ArrowUp':
    case 'ArrowDown': {
      const dir = key === 'ArrowDown' ? 1 : -1;
      if (e.altKey && !mod) {
        e.preventDefault();
        if (el === focusTitleEl) return;
        const off = caretOffset(el);
        const sfx = sfxOfTitle(el);
        if (store.moveSibling(id, dir)) focusNodeTitle(id, off, sfx);
        return;
      }
      if (mod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (el !== focusTitleEl && n.children.length) {
          store.setCollapsed(id, key === 'ArrowUp');
        }
        return;
      }
      if (!mod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        navRelative(el, dir, caretOffset(el));
      }
      return;
    }

    case 'ArrowLeft':
      if (e.altKey && !mod) {
        e.preventDefault();
        if (e.shiftKey) zoomRoot(); else zoomOut();
        return;
      }
      if (!mod && !e.shiftKey && caretOffset(el) === 0 && selectionCollapsedIn(el)) {
        e.preventDefault();
        navRelative(el, -1, 'end');
      }
      return;

    case 'ArrowRight':
      if (e.altKey && !mod) {
        e.preventDefault();
        // zooming a mirror goes to the original — a mirror has no view of its own
        if (el !== focusTitleEl) location.hash = '#' + contentIdOfTitle(el);
        return;
      }
      if (!mod && !e.shiftKey && selectionCollapsedIn(el)
          && caretOffset(el) >= el.textContent.length) {
        e.preventDefault();
        navRelative(el, 1, 0);
      }
      return;

    case 'Escape':
      if (view.query) { e.preventDefault(); clearSearch(); }
      return;
  }
}

function zoomOut() {
  if (view.focusId === ROOT_ID) return;
  const parent = store.getParent(view.focusId);
  location.hash = (!parent || parent.id === ROOT_ID) ? '' : '#' + parent.id;
}

/* all the way out: the master node, caret on the first item, scrolled to the top */
function zoomRoot() {
  const wasRoot = view.focusId === ROOT_ID;
  if (!wasRoot) location.hash = '';
  const land = () => {
    const first = visibleTitles()[0];
    if (first) activateTitle(first, 0);
    window.scrollTo(0, 0);
  };
  // hashchange → applyFocusFromHash → renderAll runs after this task
  if (wasRoot) land(); else setTimeout(land, 0);
}

/* --- multi-line paste → structure --- */
function insertPlainText(text) {
  document.execCommand('insertText', false, text);
}
function onTitlePaste(e, el) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
  if (!/\n/.test(text.trim())) {
    insertPlainText(text.replace(/\s*\n\s*/g, ' '));
    return;
  }
  const trees = parseOutlineText(text);
  if (!trees.length) return;
  const id = idOfTitle(el);
  let last = null;
  const touched = [];
  store.group(() => {
    if (el === focusTitleEl) {
      trees.forEach((t, k) => { last = store.createTree(view.focusId, k, t); touched.push(last.id); });
    } else {
      const p = store.getParent(id);
      const idx = p.children.indexOf(store.getNode(id));
      trees.forEach((t, k) => { last = store.createTree(p.id, idx + 1 + k, t); touched.push(last.id); });
    }
  });
  keepInFilter(touched);
  if (last) focusNodeTitle(last.id, 'end');
}

/* --- note editor keys --- */
function onNoteKeydown(e, ta) {
  if (e.key === 'Escape') {
    e.preventDefault();
    const container = ta.parentElement;
    const id = container === focusNoteEl
      ? view.focusId
      : (ta.closest('.node') || {}).dataset?.id;
    ta.blur();
    if (id) focusNodeTitle(id, 'end');
  } else if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/* --- delegated wiring ------------------------------------------------ */
document.addEventListener('keydown', e => {
  const title = e.target.closest?.('.title');
  if (title) { onTitleKeydown(e, title); return; }
  const ta = e.target.closest?.('.note-edit');
  if (ta) { onNoteKeydown(e, ta); return; }

  // global shortcuts (outside editors)
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey && e.shiftKey && !mod && e.key === 'ArrowLeft') {
    e.preventDefault();
    zoomRoot();
    return;
  }
  if (mod && (e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
    return;
  }
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (!inField) {
    if (e.key === '?' && !mod) { e.preventDefault(); $('#help-dialog').showModal(); return; }
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      const fid = e.shiftKey ? store.redo() : store.undo();
      if (fid) focusNodeTitle(fid, 'end');
    }
  }
});
// Ctrl+F must win even while typing in a title/note
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.altKey && !e.defaultPrevented) {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
}, true);

document.addEventListener('input', e => {
  const title = e.target.closest?.('.title');
  if (title) { onTitleInput(title); return; }
  const ta = e.target.closest?.('.note-edit');
  if (ta) {
    autoGrow(ta);
    const host = ta.closest('.node');
    const id = ta.parentElement === focusNoteEl
      ? view.focusId
      : host && (host.dataset.mirror || host.dataset.id); // mirror rows: the target's note
    if (id) store.setNote(id, ta.value);
  }
});

document.addEventListener('paste', e => {
  const title = e.target.closest?.('.title');
  if (title) onTitlePaste(e, title);
});

// enable editing just-in-time, before the browser's focus/caret placement
document.addEventListener('mousedown', e => {
  // tag chips, wikilinks, and external links are controls, not text: don't
  // start editing, don't move focus (focusin would flatten them away before
  // their click lands)
  if (e.target.closest?.('.title .tag, .title .wikilink, .title .tlink')) { e.preventDefault(); return; }
  const t = e.target.closest?.('.title');
  if (t && t.contentEditable !== 'true') t.contentEditable = 'true';
}, true);

document.addEventListener('focusin', e => {
  const title = e.target.closest?.('.title');
  if (title && title.firstElementChild) {
    // editing a rendered title (formatting, chips, marks): swap to raw text,
    // mapping the caret from rendered space to raw space (formatting hides
    // its delimiters, so the two no longer line up — titleRawOffset knows)
    const off = titleRawOffset(title, caretOffset(title));
    const id = contentIdOfTitle(title); // mirror rows edit their target's text
    const n = id && store.getNode(id);
    if (n) { title.textContent = n.title; setCaret(title, off); }
  }
});
document.addEventListener('focusout', e => {
  const title = e.target.closest?.('.title');
  if (title) {
    store.breakTyping();
    if (title !== focusTitleEl) {
      title.contentEditable = 'false';
      // restore decorations (tag chips, search marks) the flatten removed
      const id = idOfTitle(title);
      const n = id && store.getNode(id);
      if (n) setTitleContent(title, n);
    }
  }
  const ta = e.target.closest?.('.note-edit');
  if (ta) { store.breakTyping(); closeNoteEditor(ta); }
});

/* --- mouse wiring ------------------------------------------------ */
treeEl.addEventListener('click', e => {
  const tg = e.target.closest('.toggle');
  if (tg) {
    const el = tg.closest('.node');
    const n = store.getNode(el.dataset.id);
    if (n) store.setCollapsed(n.id, !n.collapsed);
    return;
  }
  const noteWrap = e.target.closest('.note');
  if (noteWrap && !e.target.closest('a') && !e.target.closest('.note-edit')) {
    const el = noteWrap.closest('.node');
    if (el) openNoteEditor(el.dataset.mirror || el.dataset.id, el);
  }
});
focusNoteEl.addEventListener('click', e => {
  if (!e.target.closest('a') && !e.target.closest('.note-edit')) openNoteEditor(view.focusId);
});
emptyHintEl.addEventListener('click', () => {
  if (view.filter) return;
  const nn = store.create(view.focusId, 0, {});
  focusNodeTitle(nn.id, 0);
});
