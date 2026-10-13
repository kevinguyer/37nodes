# 37nodes — orientation for Claude

A local-first outliner (Workflowy-shaped) that ships as **one HTML file with no
dependencies and no network**. It must keep working when double-clicked from
`file://`. That constraint decides most of the architecture below: no bundler,
no framework, no CDN, no fetch.

- `README.md` — user-facing feature tour.
- `FEEDBACK.md` — the user-feedback queue: bug reports and feature requests
  with ids (`BUG-n`, `FR-n`), status, sizing, and the decision each one
  needs. Check it before starting new work; move an item to Done when it
  ships and gets its F-number in the PRD.
- `PRD.md` — **the behavioural spec**, numbered `F1`, `F2`, … in order of
  creation, not by section: new items take the next free number and sit beside
  the items they relate to, so the highest number is the newest (grep for it
  before adding one). It is the source of truth for what the app does and
  why. When you add or change behaviour, add or amend an F-item in the
  matching section.
- This file — how the code is put together, and the traps in it.

## Definition of done

A change to behaviour is not finished until all of these exist:

1. an F-item in `PRD.md` (new or amended),
2. a line in `src/help/whatsnew.md` under the current release, and a topic
   page edit in `src/help/` if the behaviour changes how something is used,
3. a row in `HELP_KEYS` (`18-help.js`) if it adds or changes a key, plus the
   `<kbd>` hint on whatever menu row or tooltip exposes it,
4. its `FEEDBACK.md` item moved to Done with the build and F-number.

The Help Center is only as good as this list: it has no other way of learning
that something shipped.

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

`build.ps1` also bundles `src/help/` into the file: `NN-slug.md` are the Help
Center's topic pages (filename order is nav order, the slug is the topic id)
and `whatsnew.md` is the release list, newest `##` section first. It replaces
the `/*__HELP__*/` marker in `18-help.js`. Help text is rendered by the same
DOM-only markdown renderer as notes; write `[[` and `((` inside code spans or
they will be resolved as wikilinks against the *user's* document.

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
| `04b-query.js` | The search language: tokenizer, parser, per-item matcher, highlight ranges. **Pure** — no DOM or store, so it can be run under Node on its own |
| `05-search.js` | Search box wiring, tag-chip click filter |
| `06-keyboard.js` | Every title/note event, delegated at `document` level |
| `07-dnd.js` | Drag & drop by bullet |
| `08-io.js` | JSON/Markdown export, import flow, File System Access file mirror |
| `09-main.js` | Prefs, themes, zoom-via-hash, ☰ menu, backup reminder, `boot()` |
| `10-palette.js` | `Ctrl+K` fuzzy jump palette |
| `11-linkauto.js` | `[[` link autocomplete in titles and notes; `((` mirror conversion in titles |
| `12-tour.js` | First-run guided tour (declarative steps + spotlight) |
| `13-tagline.js` | Rotating top-bar tagline with cipher-decode reveal |
| `14-nodemenu.js` | Per-item ≡ handle popover: heading format, bullet color, row actions |
| `15-toolbar.js` | Floating format bar over a selection in an editing title; wrap/unwrap of inline syntax |
| `16-panel.js` | Backlink index, right-hand info panel (collapsible sections: item / starred / tags), rename-rewrite offer |
| `17-stars-tags.js` | Starred index + star gestures (row ★, `Alt+S`), tag vocabulary index |
| `18-help.js` | Help Center dialog: overview, topic pages, keyboard table, What's new + its dot. Content is `src/help/*.md`, bundled at build |
| `19-saved.js` | Saved + recent searches, the ☆ button and the search box dropdown. Local-only: lives in prefs, not the document |

`app.css` is CSS-variable driven: `:root` holds the token set, each
`[data-theme=…]` block overrides it. `--motion:0` and `--glow` let a theme opt
out of animation or add CRT glow. Themes should never need new selectors.

## Data model

```js
{ id, title, note, children: [], collapsed, completed, createdAt, updatedAt,
  format?, color?,  // optional: 'h1'|'h2'|'h3'; palette slot — absent when unset
  mirrorOf?,        // optional: this node is a live mirror of another item
  starred? }        // optional: on the shortlist in the panel's Starred section
```

A node with `mirrorOf` is a **mirror**: childless, no text of its own — all
content resolves through the target (`store.mirrorContent`). Only its id,
position, and `collapsed` state are its own. Deleting a mirrored original
promotes the first surviving mirror into the real subtree (`deleteSubtree`).

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
| localStorage | `37nodes:prefs` | UI prefs — **always** localStorage, never IDB. Also holds `savedSearches`, `recentSearches` and `whatsNewSeen`: none of it is in exports |
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

- Rendering is keyed by **instance id** (`data-iid`), not node id: mirrors
  make one node renderable in many places. `elMap` is `Map<iid, element>`
  (iid = node id, plus `@mirrorId…` inside a mirror expansion) and `instMap`
  maps a node id to every live element showing it — primary row, plus any
  mirror rows and expansion copies. All are validated with `isConnected` on
  read. Never `querySelector` for a node by id.
- Every row has two identities: `data-id` (structural — moves, deletes,
  collapse) and content (`data-mirror || data-id` — text, notes, completion,
  format). Keyboard, dnd, menu, and autocomplete code must pick the right
  one; `idOfTitle` vs `contentIdOfTitle` embody the split. For non-mirror
  rows they coincide.
- `reconcileChildren` reuses rows by `data-id` and moves them, so pressing Enter
  in a 20k-node outline stays cheap. Nodes removed from one parent and re-homed
  under another are left alone; the new parent's own `children` event moves the
  element.
- Titles are **not** `contenteditable` at rest (focusing one of 20k editable
  roots costs ~100 ms in Chrome). `mousedown` (capture) and `activateTitle()`
  turn it on; `focusout` turns it off.
- Title decorations and inline formatting are render-time only. `focusin`
  flattens the title back to `store` text (raw, delimiters visible) and
  `focusout` rebuilds the rendered form. Two offset regimes coexist: `#tag`
  chips, `[[wikilinks]]`, and search `<mark>`s keep raw and rendered text the
  same length, while inline formatting (`**b**`, `{red|…}`, …) **hides its
  delimiters** — caret positions cross the flatten via `titleSegs` (a WeakMap
  of rendered-text-node → raw-offset segments built by `setTitleContent`) and
  `titleRawOffset()`. Never assume a rendered title offset equals a raw one;
  a title being edited is plain raw text, so offsets there are trivially raw.
  `updateRow` deliberately leaves an actively-edited title's DOM alone on
  same-text `node` events — re-rendering formatting under the caret would
  make the next `input` store delimiter-less text (silent formatting loss).

### Backlinks

`16-panel.js` keeps a lazy `targetId → sources` index behind its own dirty
flag, scanning titles **and** notes. It resolves every `[[…]]` through
`resolveTitleLink` — the renderer's own resolver — deliberately: links match
by title and duplicates resolve to the first in document order, so any other
matching scheme would credit backlinks to an item the link doesn't point at.
Mirrors own no text and never source a backlink; self-links don't count.

Because links resolve by title, a rename breaks every inbound link (F44
keeps that visible rather than silently retargeting). The rewrite offer
therefore snapshots backlinks at `focusin` — by `focusout` the old title is
gone from the store and those links no longer resolve to the renamed item.

### Search filter

`computeFilter()` walks the current zoom scope once and produces:

- `matched` — nodes that hit the query (drives highlighting and the Enter-in-
  search-box jump)
- `anc` — ancestors of matches, rendered dimmed for context
- `under` — matches and everything beneath them; **this set is "visible"**
- `filterExempt` — ids kept visible even though they don't match

The query is parsed by `04b-query.js` (PRD F75–F77): terms are ANDed per item,
`-` negates, `is:starred`/`is:done` are flags, and a standalone `>` chains
groups down the ancestors. `computeFilter` carries a *stage* — how many
groups an ancestor has already satisfied — so it stays one linear pass.
`matched` holds results only; scope anchors land in `anc`, shown dimmed. The
filter also exposes `marks` (positive word/phrase terms, for highlighting) and
`tags` (positive `#tags`, for chip state) — read those, never re-parse the
query string in a view.

## Traps worth knowing

- **`hide completed` is a CSS rule**, not a data filter:
  `body.hide-completed .node.completed{display:none}` — which takes the whole
  completed *subtree* off screen. Any code reasoning about what the user can
  actually see must consult that body class (`completedRowsHidden()` in
  `04-view.js`). Toggling the checkbox does not emit a store event, so anything
  derived from it needs an explicit re-render.
- **"Is this row expanded?" has two answers.** Outside a filter it is
  `!own.collapsed`; under one it is `rowExpanded(own)` (`04-view.js`): a
  session override from `view.filterOpen` wins, then mirrors stay folded, then
  a row with a matching descendant is held open, else the stored flag. Never
  read `.collapsed` directly for display. User toggles go through
  `setRowCollapsed`, which routes to the override map in a filter and never
  writes the document there.
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

Testing is manual: there is no browser test suite. Verify in the browser, and
remember that the preview's IndexedDB is real persisted data — undo or clean up
any document edits you make while poking at it.

The one exception is `src/js/04b-query.js`, which is pure (strings in, plain
data out) and so can be loaded under Node: `node tests/query.test.js` runs its
grammar tests and exits non-zero on a failure. Run it after any change to the
search language, and add a case for every behaviour you add — it is the most
regression-prone logic in the app.
