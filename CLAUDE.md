# 37nodes — orientation for Claude

A local-first outliner (Workflowy-shaped) that ships as **one HTML file with no
dependencies and no network**. It must keep working when double-clicked from
`file://`. That constraint decides most of the architecture below: no bundler,
no framework, no CDN, no fetch.

- `README.md` — user-facing feature tour.
- `PRD.md` — **the behavioural spec**, numbered `F1…F52`. It is the source of
  truth for what the app does and why. When you add or change behaviour, add or
  amend an F-item in the matching section.
- This file — how the code is put together, and the traps in it.

## Build

Source lives in `src/`. The shipped file is generated — **never edit
`37nodes.html` or `index.html` by hand**; they are build output and are
overwritten.

```bash
powershell -File build.ps1
```

`build.ps1` reads `src/shell.html`, substitutes `/*__CSS__*/` with `src/app.css`
and `/*__JS__*/` with every `src/js/*.js` concatenated **in filename order**,
stamps `__BUILD__`/`__BUILT__`, bumps `build-number.txt`, and writes the result
to both `37nodes.html` and `index.html` (byte-identical; `index.html` exists so
a web host serves it by default). The build number shows at the bottom of the ☰
menu — handy for confirming a browser is looking at your build.

`.gitattributes` forces LF everywhere. Don't let an editor rewrite line endings.

### One script, one scope

All JS is concatenated into a single `<script>` wrapped in one IIFE with
`'use strict'` (see the bottom of `src/shell.html`). Consequences:

- Modules share one lexical scope. There is no import/export — a function
  defined in `04-view.js` is simply callable from `06-keyboard.js`.
- **Nothing is on `window`.** You cannot poke `store` or `view` from a browser
  console or `javascript_tool`. To test behaviour, drive the real DOM: dispatch
  `mousedown` (the capture handler turns on `contentEditable`), `focus()`, set a
  Range, then `document.execCommand('insertText', …)` or dispatch a
  `KeyboardEvent`, and read back from the DOM.
- File order matters at *runtime*, not definition time. Function declarations
  hoist across the whole bundle, so cross-references are fine. But top-level
  `let`/`const` (e.g. `prefs` in `09-main.js`) are in TDZ until their file's
  line executes — code in `01`–`08` may reference them only from callbacks that
  run after boot.

### Modules

| File | Owns |
| --- | --- |
| `01-util.js` | `$`/`$$`, `uid`, `debounce` (with `.flush()`), caret helpers for single-line contenteditable, indented-text → tree parsing |
| `02-markdown.js` | Safe markdown subset rendered by **DOM construction only** — no `innerHTML` anywhere, so raw HTML in a note shows as literal text |
| `02b-idb.js` | IndexedDB plumbing: one cached connection, stores `doc` + `kv` |
| `03-store.js` | Document state, node index, ops-based undo, persistence, schema migrations, cross-tab guard, seed document |
| `04-view.js` | All rendering: keyed reconciliation, search filter, note editors, banner, save indicator |
| `05-search.js` | Search box wiring, tag-chip click filter |
| `06-keyboard.js` | Every title/note event, delegated at `document` level |
| `07-dnd.js` | Drag & drop by bullet |
| `08-io.js` | JSON/Markdown export, import flow, File System Access file mirror |
| `09-main.js` | Prefs, themes, zoom-via-hash, ☰ menu, backup reminder, `boot()` |
| `10-palette.js` | `Ctrl+K` fuzzy jump palette |
| `11-linkauto.js` | `[[` autocomplete in titles and note textareas |
| `12-tour.js` | First-run guided tour (declarative steps + spotlight) |
| `13-tagline.js` | Rotating top-bar tagline with cipher-decode reveal |

`app.css` is CSS-variable driven: `:root` holds the token set, each
`[data-theme=…]` block overrides it. `--motion:0` and `--glow` let a theme opt
out of animation or add CRT glow. Themes should never need new selectors.

## Data model

```js
{ id, title, note, children: [], collapsed, completed, createdAt, updatedAt }
```

One tree under `doc.root` (`id === ROOT_ID === 'root'`). `nodeIndex` is a
`Map<id, {node, parent}>` maintained by every structural op, so `getNode` /
`getParent` / `ancestorsOf` are O(1)/O(depth) — never walk the tree to find a
node.

Titles are one line. Notes are markdown, rendered when not focused.

## Storage

| Where | Key | What |
| --- | --- | --- |
| IndexedDB `37nodes` v2, store `doc` | `current` | The whole document, one record |
| IndexedDB `37nodes` v2, store `kv` | `backupHandle` | `FileSystemFileHandle` for the file mirror |
| localStorage | `37nodes:prefs` | UI prefs — **always** localStorage, never IDB |
| localStorage | `37nodes:doc` | Fallback backend when IDB is blocked; also the pre-migration location |
| localStorage | `37nodes:doc:pre-idb` | Frozen copy left behind by the one-time IDB migration |

`load()` picks a backend once: `idb` → `local` → `memory`. Prefs stay in
localStorage because they must be readable **synchronously before first paint**
(the theme has to land before the page draws); the document does not.

Saved and exported payloads carry `schemaVersion`. Format changes go in
`DOC_MIGRATIONS` in `03-store.js` as `v → v+1` steps that take and return a
whole payload; the framework stamps the new version. Migrations run on load
**and** on import, always before `normalizeNode`, so they see the historical
shape.

Every successful save is announced on a `BroadcastChannel`, which is how a
second tab raises the "open in another tab" banner. It is warn-only — last write
wins.

## The event bus is the mental model

`store.subscribe(fn)` receives every mutation. The event type decides how much
of the view is rebuilt, and getting this wrong is the usual cause of "my change
didn't show up":

| Event | Emitted by | View response |
| --- | --- | --- |
| `node` | `setTitle`/`setNote`/`toggleCompleted` | `updateRow(id)` — one row. **Does not recompute the search filter.** |
| `children` | `create`/`delete*`/`move`/`indent`/`outdent` | `renderChildrenOf(id)` — recomputes the filter, then reconciles one container (or rebuilds the whole filtered tree if a search is active) |
| `collapse` | `setCollapsed` | Lazily fills that node's children container |
| `doc` | `undo`/`redo`/`importReplace` | `renderAll()` |
| `save` | every save attempt | Save indicator, error banner |
| `remote-save` | another tab's save | Multi-tab banner |

Undo is ops-based (`{t:'text'|'flag'|'ins'|'del'|'mv'}`), each op reversible.
`store.group(fn)` collapses everything inside into one undo step; typing
coalesces into a burst until `breakTyping()`. Collapse state is deliberately
**not** undoable — it's view state that happens to be persisted.

## Rendering

- `elMap` is `Map<id, element>`, validated with `isConnected` on read. Never
  `querySelector` for a node by id.
- `reconcileChildren` reuses rows by `data-id` and moves them, so pressing Enter
  in a 20k-node outline stays cheap. Nodes removed from one parent and re-homed
  under another are left alone; the new parent's own `children` event moves the
  element.
- Titles are **not** `contenteditable` at rest (focusing one of 20k editable
  roots costs ~100 ms in Chrome). `mousedown` (capture) and `activateTitle()`
  turn it on; `focusout` turns it off.
- Title decorations — `#tag` chips, `[[wikilinks]]`, search `<mark>`s — are
  render-time only. `focusin` flattens the title back to `store` text and
  `focusout` rebuilds the decorations. This is why `[[ ]]` brackets stay visible
  in rendered links: raw and rendered text must have the same length or caret
  offsets break on the flatten.

### Search filter

`computeFilter()` walks the current zoom scope once and produces:

- `matched` — nodes that hit the query (drives highlighting and the Enter-in-
  search-box jump)
- `anc` — ancestors of matches, rendered dimmed for context
- `under` — matches and everything beneath them; **this set is "visible"**
- `filterExempt` — ids kept visible even though they don't match

A pure `#tag` query matches whole tags only; anything else is a case-insensitive
substring over title *and* note.

## Traps worth knowing

- **`hide completed` is a CSS rule**, not a data filter:
  `body.hide-completed .node.completed{display:none}` — which takes the whole
  completed *subtree* off screen. Any code reasoning about what the user can
  actually see must consult that body class (`completedRowsHidden()` in
  `04-view.js`). Toggling the checkbox does not emit a store event, so anything
  derived from it needs an explicit re-render.
- **A search filter forces every node expanded** (`view.filter ? true :
  !n.collapsed`), so "is it expanded" is not the same question in search view.
- **Text edits don't re-filter, structural edits do.** A title edited out of
  matching stays on screen until something emits `children`.
- **`store.create()` emits before it returns.** The filtered rebuild triggered
  by the creation runs before you hold the new id, so anything the view needs to
  know about a brand-new node has to be applied afterwards with an explicit
  re-render — that's what `keepInFilter()` exists for. Without it a new node
  isn't rendered at all, and `focusNodeTitle` silently no-ops.
- **`renderChildrenOf` short-circuits to a full `renderTree()` while filtering**,
  which clears `elMap`. Don't hold element references across a store mutation.
- Everything user-visible flows through `store`; nothing writes `doc` directly.

## Dev loop

`.claude/launch.json` defines a static server (`python -m http.server 8137`).
Build first, then load `http://localhost:8137/37nodes.html` — the server has no
knowledge of `src/`, so an unbuilt change simply won't be there. Check the build
number in the ☰ menu if behaviour looks stale.

Testing is manual: there is no test suite. Verify in the browser, and remember
that the preview's IndexedDB is real persisted data — undo or clean up any
document edits you make while poking at it.
