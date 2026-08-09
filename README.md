# 37nodes

*Infinite depth. Zero chaos.*

A local-first, single-file outliner in the spirit of Workflowy. One HTML file,
no dependencies, no server, no network — your outline lives in your browser's
local storage and never leaves your machine.

**To use it:** open [37nodes.html](37nodes.html) in any modern browser
(double-clicking the file works — it runs fine from `file://`).

See [PRD.md](PRD.md) for the full product requirements.

> Data saved under the old `holon:*` and `holarchy:*` storage keys (this
> app's earlier names) is migrated automatically on first load.

## Features

- A **guided tour** on first run — a spotlight walkthrough of the real UI,
  about a minute long, re-launchable any time from **☰ → Take the guided
  tour** (or the help dialog). `←`/`→` step, `Esc` leaves.
- The top-bar **tagline rotates every minute**, each new line arriving as a
  cipher decode that scrambles, slows and settles. Add your own to the
  `TAGLINES` list in `src/js/13-tagline.js`.
- Infinitely nested outline; every item has a one-line title and an optional
  **markdown note** (edit raw, renders when you click away)
- **Zoom** into any node (click its bullet) with breadcrumbs back out; zoom is
  in the URL hash, so browser back/forward navigate your zoom history
- Full **keyboard operation** — press `?` in the app for the reference
- Live **search/filter** with match highlighting (`Ctrl+F`)
- **Jump palette** (`Ctrl+K`): fuzzy-match any item's title and zoom straight
  to it from anywhere
- **#tags**: `#word` tokens in titles render as clickable chips — click one to
  filter by that exact tag, click it again to clear
- **[[Internal links]]**: `[[Some title]]` in a title or note links to the item
  with that title (case-insensitive) — click to zoom there; unresolved links
  show as visibly broken until a matching item exists
- **Link autocomplete**: typing `[[` closes the brackets for you and opens a
  fuzzy-matched list of item titles at the caret — `Enter`/`Tab` inserts the
  exact title, so links land right instead of being retyped from memory
- **Checklist progress**: parents show a subtle `3/7` count once any direct
  child is checked off
- The jump palette opens onto your **recently edited** items — `Ctrl+K`,
  `Enter` gets you back to where you last worked
- **Undo/redo** (~200 steps), drag-and-drop, complete/hide-completed
- **Export/import**: JSON (lossless backup) and Markdown; multi-line paste
  becomes structure; `Ctrl+Shift+C` copies a subtree as markdown
- **Themes** (all CSS-variable driven): nordic (the default), light, dark,
  e-ink, parchment, evergreen — plus three terminal tributes: green CRT,
  IBM 5151 sepia, and Wyse 60 white phosphor, complete with glow and scanlines
- **Wide layout** (☰ menu): the default is a fixed ~700px reading column; the
  toggle lets the outline follow the window instead (86% of its width, capped
  at 1400px), so a large display isn't mostly margin
- Handles 20,000-node outlines (keyed DOM reconciliation, on-demand
  contenteditable, `content-visibility` pruning)

## Data safety

Everything is stored under the `37nodes:doc` key in `localStorage`. Browsers
can evict local storage when clearing site data — use **☰ → Export JSON** for
real backups. If a save ever fails (quota, private mode), a small toast appears
with a one-click export.

The ☰ menu shows how long it's been since your last JSON export, and a
**backup reminder** (default: 14 days, configurable, 0 = off) raises a gentle
toast when you're overdue — so backups don't slip through the cracks.

**File mirroring** (Chromium browsers): **☰ → Mirror to a file on disk…**
picks a JSON file once, then keeps it continuously up to date on every save
via the File System Access API — a live backup that survives cleared browser
data, still with zero network. After a browser restart you may need to click
**Resume** once (the browser re-asks permission to write). While a mirror is
active the backup reminder stays quiet.

## Development

Source lives in `src/` and is concatenated into the single shippable file:

```
src/shell.html      page skeleton (CSS/JS injection markers)
src/app.css         tokens, themes, components
src/js/01-util.js   helpers, caret utilities, outline-text parsing
src/js/02-markdown.js  safe markdown subset → DOM renderer (no innerHTML)
src/js/03-store.js  document state, ops-based undo, persistence
src/js/04-view.js   incremental keyed rendering, notes, search filter
src/js/05-search.js search box wiring
src/js/06-keyboard.js  keyboard model + editing events
src/js/07-dnd.js    drag & drop
src/js/08-io.js     export/import/clipboard
src/js/09-main.js   storage migration, prefs, themes, zoom/hash, menu, boot
src/js/10-palette.js   Ctrl+K fuzzy jump palette
src/js/11-linkauto.js  [[link]] autocomplete
src/js/12-tour.js   first-run guided tour (spotlight + callout card)
src/js/13-tagline.js   rotating top-bar tagline, cipher-decode reveal
```

The logo is one traced `<path>` inside the `#logo-mark` symbol in
`src/shell.html`, drawn in `currentColor` so every theme re-inks it. The
favicon is generated from that same path at boot, so there is only ever one
copy of the mark in the file. `37nodes_logo_huge_raw.png` is the master
artwork it was vectorised from; the build does not read it.

Build (PowerShell):

```powershell
.\build.ps1   # writes 37nodes.html and index.html (identical)
```

Every build bumps the counter in `build-number.txt` and stamps it, with the
build date, into the `__BUILD__` / `__BUILT__` markers in `src/shell.html` —
the result shows at the bottom of the ☰ menu, so you can tell at a glance
which build a given copy of the file is.
