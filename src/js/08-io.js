/* ===== 08 import / export / clipboard ===== */

function dateStamp() {
  const d = new Date();
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function docPayload() {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    savedAt: nowISO(),
    focusId: store.doc.focusId,
    root: store.doc.root,
  }, null, 2);
}
function exportJSON() {
  store.saveNow(); // flush pending edits into doc timestamps
  downloadFile(`37nodes-backup-${dateStamp()}.json`, docPayload(), 'application/json');
  // JSON is the lossless backup, so it (alone) resets the reminder clock
  prefs.lastExportAt = nowISO();
  savePrefs();
  updateExportReadout();
  if (bannerKind === 'notice') hideBanner();
}

function mirrorMarkdownLine(c) {
  const t = store.getNode(c.mirrorOf);
  return `↪ mirror of "${t ? (t.title || 'Untitled') : '(deleted item)'}"`;
}
function childrenToMarkdown(n, depth, out) {
  for (const c of n.children) {
    if (c.mirrorOf) {
      // a single marker line: expanding the subtree here would duplicate it
      out.push(`${'  '.repeat(depth)}- ${mirrorMarkdownLine(c)}`);
      continue;
    }
    out.push(`${'  '.repeat(depth)}- ${c.title || ''}`);
    if (c.note) {
      for (const l of c.note.split('\n')) out.push(`${'  '.repeat(depth + 1)}${l}`);
    }
    childrenToMarkdown(c, depth + 1, out);
  }
}
function nodeToMarkdownText(n) {
  if (n.mirrorOf) return `- ${mirrorMarkdownLine(n)}`;
  const out = [`- ${n.title || ''}`];
  if (n.note) for (const l of n.note.split('\n')) out.push(`  ${l}`);
  childrenToMarkdown(n, 1, out);
  return out.join('\n');
}
function exportMarkdown(scopeId) {
  const n = store.getNode(scopeId);
  if (!n) return;
  const out = [];
  if (scopeId === ROOT_ID) {
    childrenToMarkdown(n, 0, out);
  } else {
    out.push(`# ${n.title || 'Untitled'}`);
    if (n.note) { out.push(''); out.push(n.note); }
    out.push('');
    childrenToMarkdown(n, 0, out);
  }
  downloadFile(`37nodes-${dateStamp()}.md`, out.join('\n') + '\n', 'text/markdown');
}

function copySubtreeMarkdown(id) {
  const n = store.getNode(id);
  if (!n) return;
  const text = nodeToMarkdownText(n);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
  else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/* --- import flow --- */
const importFileEl = $('#import-file');
const importDialogEl = $('#import-dialog');
let pendingImport = null;

$('#import-json').addEventListener('click', () => { importFileEl.value = ''; importFileEl.click(); });
importFileEl.addEventListener('change', async () => {
  const file = importFileEl.files[0];
  if (!file) return;
  let data = null;
  try { data = JSON.parse(await file.text()); }
  catch (e) {
    showBanner(`"${file.name}" is not valid JSON, so nothing was imported.`);
    return;
  }
  if (!data || typeof data !== 'object' || !data.root || !Array.isArray(data.root.children)) {
    showBanner(`"${file.name}" doesn't look like a 37nodes backup (missing root.children), so nothing was imported.`);
    return;
  }
  // Upcast older schema versions before anything reads the payload; a
  // newer-than-this-build backup still imports, with a warning.
  const migrated = store.migrateDoc(data);
  data = migrated.data;
  pendingImport = data;
  const count = store.countNodes(data.root) - 1;
  const when = data.savedAt ? ` saved ${String(data.savedAt).slice(0, 10)}` : '';
  const warn = migrated.warning ? ' ⚠ This backup was saved by a newer version of 37nodes; some data may not round-trip.' : '';
  $('#import-summary').textContent = `“${file.name}” contains ${count.toLocaleString()} item${count === 1 ? '' : 's'}${when}.${warn}`;
  importDialogEl.showModal();
});
$('#import-cancel').addEventListener('click', () => { pendingImport = null; importDialogEl.close(); });
$('#import-append').addEventListener('click', () => {
  if (pendingImport) store.importAppend(pendingImport.root.children);
  pendingImport = null;
  importDialogEl.close();
});
$('#import-replace').addEventListener('click', () => {
  if (pendingImport) {
    store.importReplace(pendingImport.root);
    location.hash = '';
    renderAll();
  }
  pendingImport = null;
  importDialogEl.close();
});

/* --- file mirror (File System Access API) ------------------------------
   Keeps a real .json file on disk continuously up to date, so browser
   storage eviction stops being a data-loss risk. Chromium-only; the handle
   persists in the shared IndexedDB 'kv' store (handles are
   structured-cloneable). After a reload the browser may demand a fresh
   user gesture before we can write again — that's the 'paused' state and
   the Resume flow. IDB plumbing lives in 02b-idb.js. */

const fsSupported = typeof window.showSaveFilePicker === 'function';
let fsHandle = null;
let fsState = 'off'; // 'off' | 'active' | 'paused' (needs permission) | 'error'
let fsLastWriteAt = null;
let fsWriting = false, fsDirty = false;

const fsReadoutEl = $('#fsbackup-readout');
const fsSetupEl = $('#fsbackup-setup');
const fsResumeEl = $('#fsbackup-resume');
const fsStopEl = $('#fsbackup-stop');

function updateFsUI() {
  if (!fsSupported) {
    fsReadoutEl.hidden = fsSetupEl.hidden = fsResumeEl.hidden = fsStopEl.hidden = true;
    return;
  }
  fsSetupEl.hidden = !!fsHandle;
  fsStopEl.hidden = !fsHandle;
  fsResumeEl.hidden = !(fsHandle && fsState !== 'active');
  fsReadoutEl.hidden = !fsHandle;
  if (fsHandle) {
    fsReadoutEl.textContent =
      fsState === 'active' ? `Mirroring to ${fsHandle.name}` + (fsLastWriteAt ? ` · written ${formatAgo(fsLastWriteAt)}` : '')
      : fsState === 'error' ? `Mirror write failed: ${fsHandle.name}`
      : `Mirror paused: ${fsHandle.name} needs permission`;
  }
}

async function fsWrite() {
  if (fsState !== 'active' || !fsHandle) return;
  if (fsWriting) { fsDirty = true; return; }
  fsWriting = true;
  try {
    const w = await fsHandle.createWritable();
    await w.write(docPayload());
    await w.close();
    fsLastWriteAt = nowISO();
  } catch (err) {
    fsState = 'error';
    showBanner(`Couldn't write the backup file "${fsHandle.name}", so mirroring is paused. Your outline is still saved in this browser.`,
      { kind: 'fsbackup', action: { label: 'Retry', onClick: fsResume } });
  } finally {
    fsWriting = false;
    updateFsUI();
    if (fsDirty) { fsDirty = false; fsWrite(); }
  }
}
const fsWriteDebounced = debounce(fsWrite, 1200);
function fsFlush() { fsWriteDebounced.flush(); }

async function fsSetup() { // must run from a user gesture
  try {
    const h = await showSaveFilePicker({
      suggestedName: '37nodes-backup.json',
      types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
    });
    fsHandle = h;
    fsState = 'active';
    try { await idbKvSet('backupHandle', h); } catch (e) { /* session-only mirror */ }
    await fsWrite();
  } catch (err) { /* picker cancelled */ }
  updateFsUI();
}
async function fsResume() { // must run from a user gesture
  if (!fsHandle) return;
  if (fsState === 'error') { fsState = 'active'; }
  else {
    try {
      if (await fsHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') { updateFsUI(); return; }
      fsState = 'active';
    } catch (e) { updateFsUI(); return; }
  }
  if (bannerKind === 'fsbackup') hideBanner();
  await fsWrite();
  updateFsUI();
}
async function fsStop() {
  fsHandle = null;
  fsState = 'off';
  fsLastWriteAt = null;
  try { await idbKvDel('backupHandle'); } catch (e) {}
  if (bannerKind === 'fsbackup') hideBanner();
  updateFsUI();
}
async function initFileBackup() {
  updateFsUI();
  if (!fsSupported) return;
  try { fsHandle = (await idbKvGet('backupHandle')) || null; } catch (e) { fsHandle = null; }
  if (!fsHandle) return;
  let p = 'prompt';
  try { p = fsHandle.queryPermission ? await fsHandle.queryPermission({ mode: 'readwrite' }) : 'prompt'; } catch (e) {}
  if (p === 'granted') {
    fsState = 'active';
    fsWrite();
    checkExportReminder(); // boot may have raised the export nag before we got here
  } else {
    fsState = 'paused';
    showBanner(`File mirroring is paused: the browser needs permission to keep writing "${fsHandle.name}".`,
      { kind: 'fsbackup', action: { label: 'Resume', onClick: fsResume } });
  }
  updateFsUI();
}

fsSetupEl.addEventListener('click', () => { closeMenu(); fsSetup(); });
fsResumeEl.addEventListener('click', () => { closeMenu(); fsResume(); });
fsStopEl.addEventListener('click', () => { fsStop(); });

// every successful document save also refreshes the mirror (debounced)
store.subscribe(ev => {
  if (ev.type === 'save' && ev.state === 'saved') fsWriteDebounced();
});
