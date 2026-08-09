# 37nodes — Product Requirements Document

**A local-first, single-file outliner in the spirit of Workflowy.**
*Tagline: "Infinite depth. Zero chaos." — shown in the top bar, tab title, help dialog, and seed document.*

| | |
|---|---|
| Status | v1.0 (shipped); renamed from "Holon", then "Holarchy" |
| Date | 2026-07-15 |
| Owner | Kevin |
| Deliverable | One self-contained `37nodes.html` file |

---

## 1. Overview

37nodes is a nested-outline note-taking app that runs entirely in the browser from a single local HTML file. Every item in the outline is a **node** with a one-line **title** and an optional multi-line **note** written in Markdown. Nodes nest infinitely; any node can be "zoomed into" to become the temporary root of the page — the signature Workflowy interaction.

Every node is a complete document and a fragment of a larger one.

**Core constraints (non-negotiable):**

- **Single file.** One `.html` file containing all markup, CSS, and JavaScript. Opens via double-click (`file://`) with no server, no build step, no network access, and no external dependencies.
- **Local-first.** All data lives in the browser (IndexedDB, with a localStorage fallback where IDB is unavailable). Nothing ever leaves the machine.
- **Vanilla JS.** No frameworks. Modern browser APIs only.

## 2. Goals and non-goals

### Goals

1. Frictionless outlining: capturing and restructuring thoughts should feel as fast as typing.
2. Full keyboard operability — a power user should never need the mouse.
3. Markdown notes on any node, rendered cleanly, edited as raw text.
4. Data safety within the limits of browser storage: autosave, export/import, and undo.
5. A calm, text-forward visual design with swappable CSS themes.

### Non-goals (v1)

- Multi-device sync, collaboration, or accounts.
- Mobile-optimized UI (must not be broken on mobile, but desktop is the target).
- Attachments, images, or embedded files.
- Multiple separate documents (one outline per browser profile; zoom + export cover most multi-doc needs).
- Plugins/extensibility API.

## 3. Core concepts

### Node

The single data primitive.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Random, stable, unique (e.g. `crypto.randomUUID()`). |
| `title` | string | Single line of plain text. Empty allowed. |
| `note` | string | Raw Markdown source. Empty = no note UI shown. |
| `children` | Node[] | Ordered list. |
| `collapsed` | boolean | Whether children are hidden in the outline view. |
| `completed` | boolean | Checked-off state (rendered struck-through, filterable). |
| `createdAt` / `updatedAt` | ISO timestamp | For future features; cheap to record now. |

A hidden virtual root node holds the top-level items; it is never displayed or deletable.

### Zoom

At any time the view has a **focus node** (default: root). Only the focus node's subtree renders. A breadcrumb trail of ancestors renders above it; clicking a crumb re-focuses there. Zoom state is part of the URL hash (`#node-id`) so browser back/forward navigate zoom history and a reload restores position.

## 4. Functional requirements

### 4.1 Outline editing

- **F1.** Click a title to edit it in place. The outline is always directly editable — there is no separate "edit mode."
- **F2.** `Enter` at end of a title creates a sibling below (or first child, if the node has visible children). `Enter` mid-title splits the title at the caret.
- **F3.** `Backspace` at the start of an empty-titled node deletes it and moves the caret to the end of the previous visible node. Deleting a node with children requires the children to be handled: children are promoted to the deleted node's position (no silent subtree deletion via Backspace).
- **F4.** Explicit delete (context menu or `Ctrl+Shift+Backspace`) removes a node *and its subtree*, with undo as the safety net.
- **F5.** `Tab` indents (node becomes last child of its previous sibling); `Shift+Tab` outdents. Both preserve the subtree and caret position.
- **F6.** `Alt+↑` / `Alt+↓` move a node (with subtree) up/down among its siblings.
- **F7.** Click the bullet's collapse toggle — or `Ctrl+↑`/`Ctrl+↓` (collapse/expand) — to hide/show children. Collapsed nodes show a visual cue (filled/ringed bullet) indicating hidden children.
- **F8.** `Ctrl+Enter` toggles `completed`. Completed nodes render struck-through and dimmed; a view toggle hides/shows completed items.
- **F9.** Drag-and-drop reordering with a drop indicator line, including dropping *into* a node (as child) vs *between* nodes (as sibling). Keyboard equivalents exist for everything drag can do (F5/F6).

### 4.2 Keyboard navigation

- **F10.** `↑`/`↓` move the caret across visible nodes (screen order) when at a title's first/last line boundary; `←`/`→` traverse across node boundaries at title edges.
- **F11.** A caret/focus model: exactly one node is "active" at a time; all shortcuts act on it.
- **F12.** `Alt+←` zooms out one level; `Alt+→` (or clicking a bullet) zooms into the active node; `Alt+Shift+←` zooms all the way out to the master node and lands the caret on the first item.
- **F13.** `Ctrl+Z` / `Ctrl+Shift+Z` — undo/redo (see F26).
- **F14.** `Ctrl+F` (capture, don't let the browser take it) focuses the search box; `Esc` clears search and returns focus to the outline.
- **F15.** A `?` shortcut (when not editing) or menu item shows a keyboard-reference overlay.

Mac equivalents (`Cmd` for `Ctrl`) are supported throughout.

### 4.3 Notes (Markdown)

- **F16.** Each node may have a note. `Shift+Enter` on a title opens/focuses the note editor beneath the title.
- **F17.** **Edit raw, render on blur:** while focused, the note is a plain `<textarea>` (auto-growing) showing raw Markdown. On blur, it renders as formatted HTML. Clicking rendered output returns to raw editing with the caret placed sensibly.
- **F18.** Supported Markdown subset (implemented in-house, ~150 lines — no library): bold, italic, inline code, code blocks, links, unordered/ordered lists, headings (h1–h3 rendered at modest sizes), blockquotes, horizontal rules. Line breaks within a note are honored.
- **F19.** Rendering is XSS-safe by construction: the renderer builds DOM via `textContent`/element creation, never `innerHTML` with unescaped input. Raw HTML in notes is displayed as literal text, not interpreted.
- **F20.** Links open in a new tab. In edit mode they are plain text.
- **F21.** Notes render slightly smaller and dimmer than titles, indented under the title, matching the Workflowy visual hierarchy.

### 4.4 Search and filter

- **F22.** A persistent search box (top bar). Typing filters the outline live (debounced ~150 ms) to nodes whose title *or note* matches, case-insensitive substring.
- **F23.** Matching nodes display with all ancestors (for context, dimmed) and all descendants. Matched substrings are highlighted.
- **F24.** Search operates within the current zoom scope.
- **F51.** **Hidden-completed items are not results.** While *hide completed* is on, a completed node and everything beneath it is off screen, so the filter skips that subtree entirely: it yields no matches and, crucially, pulls no ancestors into the results. Leaving a `#task` tag on an item after checking it off therefore stops surfacing that item *and* its parents, which is the whole point of hiding it. Toggling the setting while a search is active recomputes the results.
- **F52.** **Items created during a search stay put.** A new item made while the filter is on matches nothing, so the filtered re-render would otherwise erase it the instant it appeared — invisible in the outline and unreachable by the caret. Items created by `Enter` or by a structured paste are exempted from the active filter (as is the leftover half of a title split by `Enter`, which may no longer match the query that found it), so a line can be added and nested — `Enter`, then `Tab` — without leaving the results. The exemption is scoped to one query: changing or clearing the search starts over with a clean set of results.
- **F25.** `Esc` clears. Empty search restores the normal view, preserving prior collapse states.
- **F41.** **Jump palette:** `Ctrl+K` (anywhere, including mid-edit) opens a modal fuzzy finder over all node titles. Substring matches rank above subsequence matches; word-boundary and contiguous-run hits rank higher; matched characters are highlighted. `↑`/`↓` select, `Enter` zooms to the item (clearing any active search filter), `Esc` cancels. Results are capped at 50.
- **F43.** **Tags:** `#word` tokens in titles (preceded by start-of-title or whitespace; `[\w-]` characters) render as clickable chips when the title is at rest; while editing, the title is plain text. Clicking a chip filters by that tag; clicking the active chip clears the filter. A query that is exactly one tag matches whole tags only (`#todo` does not match `#todos`, but does match tags in notes); the active chip is visually distinguished in results. Any other query behaves as plain substring search.
- **F44.** **Internal links:** `[[Some title]]` in titles and notes renders as a link to the first item (document order) whose title matches, trimmed and case-insensitive, resolved at render time. The stored text is never rewritten — display keeps the `[[ ]]` brackets so raw and rendered text stay the same length (exact caret placement when a title enters edit mode). Clicking zooms to the target via the URL hash. An unresolved link renders in a visibly "broken" style with an explanatory tooltip; renaming a target breaks links to it on next render rather than silently retargeting.
- **F45.** **Checklist progress:** a node displays a `done/total` count of its *direct* children at the right edge of its row, only once at least one child is completed. Updates live with completion toggles, structure changes, and undo.
- **F46.** **Recently edited:** the jump palette (F41) opens showing the 12 most recently edited items (by `updatedAt`, the field F-series reserved for future features) ready for immediate keyboard selection; typing switches to fuzzy matching.
- **F47.** **Link autocomplete:** typing the second `[` of a `[[` inserts the closing `]]` and opens a suggester at the caret, in titles and in note editors alike. It lists item titles scored by the same fuzzy matcher as the palette (F41), with the item's path beneath and matched characters highlighted; an empty query lists the most recently edited items. `↑`/`↓` select, `Enter`/`Tab` insert the exact title and place the caret after the `]]`, `Esc` dismisses without touching the text, and `Backspace` on the empty `[[]]` removes the whole pair. A completion is a single undo step, distinct from the typing burst around it. Candidates exclude the item being edited (a self-link), titles containing brackets (unlinkable by F44), and later duplicates of a title — the one offered is the one F44 will actually resolve to, and a shared title says so in the row. Suggesting nothing is also an answer: an unmatched query says the link will render broken rather than silently completing to something else.

### 4.5 Undo / redo

- **F26.** In-memory undo stack (≥100 steps) covering all structural operations (create, delete, move, indent, complete-toggle) and text edits (coalesced per editing burst, not per keystroke). Redo stack cleared on new edit. Stack does not persist across reloads (v1).

### 4.6 Persistence

- **F27.** Autosave to IndexedDB (database `37nodes`, store `doc`, one whole-document record, structured-clone — no serialization on save) on every mutation, debounced ~300 ms, plus a flush on `visibilitychange(hidden)` (the reliable moment) and `beforeunload` (best-effort). Where IndexedDB is unavailable (some private modes), saving falls back to the legacy `localStorage` path transparently; edits made there are folded into IndexedDB on the next normal load.
- **F28.** Stored payload is versioned: `{ schemaVersion, savedAt, focusId, root }`. Loading a newer-than-known schema shows a warning instead of destroying data; older schemas migrate forward through a stepwise migration registry applied on load **and** on import (so old exported backups upcast too). Legacy chain: `holon:*` / `holarchy:*` keys → `37nodes:doc` (localStorage) → IndexedDB; the one-time move to IndexedDB is write-then-verified, and the last localStorage-era payload is left frozen under `37nodes:doc:pre-idb`.
- **F28a.** **Cross-tab guard:** each successful save is announced on a BroadcastChannel; another tab holding the outline shows a dismissible warning banner (last write wins — warn-only, saves are never blocked). Degrades silently where BroadcastChannel is unavailable.
- **F29.** UI preferences (theme, show-completed, pane widths if any) are stored under a separate key (`37nodes:prefs`) so document export/import never touches them.
- **F30.** Quota/failure handling: if a save throws (quota exceeded, private mode), show a persistent visible warning banner with a one-click "Export now" action. Never fail silently.
- **F31.** A subtle save-state indicator ("Saved" / "Saving…") in the top bar.

### 4.7 Export / import

- **F32.** **Export JSON:** downloads the full document (same versioned schema as storage) — the lossless backup format.
- **F33.** **Export Markdown:** downloads the outline as nested Markdown — titles as `-` list items indented by depth, notes as indented paragraph text under their item. Export honors current zoom (exports the focused subtree) with an option for full document.
- **F34.** **Import JSON:** file picker; validates shape and checks `schemaVersion` — older backups are migrated forward through the F28 registry before import; newer-than-this-build backups import with a visible round-trip warning in the confirmation dialog. Explicit choice between **Replace** (with confirmation) and **Append** (as new top-level children). A malformed file is rejected with a readable error and no data change.
- **F35.** **Copy as Markdown/plain text:** copying a selection or a node subtree to the clipboard produces sensible indented text for pasting into other apps. Pasting multi-line indented text creates a matching node structure.
- **F40.** **Backup reminder:** prefs record `lastExportAt` (set only by JSON export — the lossless format) and `firstUseAt`. The ☰ menu shows a "Last JSON export: N ago / never" readout and a configurable threshold in days (default 14; 0 = off). When elapsed time since the last export (or first use, if never exported) exceeds the threshold, a dismissible notice toast appears; checked at boot, hourly, and on tab wake. Exporting clears it immediately. Suppressed while a file mirror (F42) is active.
- **F42.** **File mirroring** (progressive enhancement, Chromium only): via the ☰ menu the user picks a JSON file once (File System Access API); thereafter every successful save also rewrites that file (debounced ~1.2 s, flushed on tab hide/unload). The handle persists in IndexedDB. If the browser requires a fresh permission grant after restart, the app enters a visible "paused" state with a one-click Resume (toast + menu). Write failures pause mirroring with a Retry action — the in-browser store remains primary and is never blocked by mirror state. Browsers without the API simply never show the menu entry.

### 4.8 Theming

- **F36.** All visual tokens (colors, fonts, spacing scale, bullet style, radii, shadows) are CSS custom properties on `:root`. A theme is a class on `<html>` overriding those variables — no theme-specific selectors elsewhere in the stylesheet.
- **F37.** Ships with nine themes: **Light** (default), **Dark**, **E-ink** (high-contrast grayscale, serif, no shadows/animation), **Parchment** (warm manuscript cream, brown ink, serif), **Nordic** (dark blue-slate, ice accent), **Evergreen** (deep spruce, sage accent), and three terminal tributes — **Green CRT**, **IBM 5151 sepia** (amber monochrome), **Wyse 60** (pale white phosphor) — each with monospace type, glow, and scanlines. Theme picker in the menu; choice persists (F29). All themes meet WCAG AA contrast (verified ≥9.9:1).
- **F38.** Ships defaulting to **Nordic** (no saved pref). The default is also written onto `<html data-theme>` in the markup so the first paint is already themed rather than flashing the light `:root` tokens. **Auto (system)** remains an option in the picker and follows `prefers-color-scheme`.
- **F39.** Themes may set `--motion-scale` to damp or disable animations (e-ink sets it to 0); all animation durations derive from it, and the app honors `prefers-reduced-motion` globally.
- **F49.** **Wide layout:** a ☰ menu toggle (persisted in prefs, default off) that swaps the content column's `--page-max` from the fixed ~700 px reading measure to `clamp(700px, 86vw, 1400px)`. It is fluid rather than a second fixed width, so the column tracks the window while always keeping a real margin on both sides; the cap keeps a line of text from spanning a 4K display end to end, and the floor means the wide setting is never *narrower* than the default on a small window. One custom property, no layout code.

### 4.9 Onboarding

- **F48.** **Guided tour:** a spotlight walkthrough of the real UI — a scrim with a cut-out over the element being described plus a callout card (title, copy, progress dots, Back / Skip / Next). It covers, in order: what the app is, item structure keys, notes and Markdown, zoom, breadcrumbs (demonstrated live by zooming in and back out), search and the jump palette, tags and internal links, the ☰ menu, and data safety. It runs itself **once**, on a genuine first run (nothing was loaded from storage, so the seed document is what the user is looking at) and never again — completion is recorded in prefs; a load warning suppresses it, since a data problem deserves the screen more than a tour does. It is re-launchable from the ☰ menu and from the help dialog. Steps are declarative about the app state they need (zoomed / menu open), so stepping backwards restores state without bespoke undo; the tour puts zoom, menu, and caret back where it found them on exit. While it is up, keys are captured ahead of the app's own handlers so nothing types into the outline behind the scrim: `←` / `→` step, `Enter` / `Space` advance, `Esc` leaves, `Tab` cycles the card's buttons. Clicking the spotlit element itself advances; clicking elsewhere on the scrim does nothing.

### 4.10 Top-bar tagline

- **F50.** **Rotating tagline:** the tagline beside the app name in the top bar (root view only) changes once a minute, drawn at random from a list of short lines in the app's voice, never repeating the one just shown. Each new line arrives as a **cipher decode**: every character except spaces and punctuation scrambles through a symbol alphabet at ~45 ms, each one flipping more slowly as it nears its own resolve time and then locking in. Resolve times are exponentially distributed (median under a second) with two or three deliberate holdouts around 3.5–4.3 s, so the line settles a straggler at a time rather than all at once. The schedule runs on elapsed wall-clock, not tick counts, so a throttled tab loses frames rather than stretching the reveal. `Infinite depth. Zero chaos.` remains the brand line: it is what the markup ships, what a fresh load shows, and one of the entries in the rotation. The decode is skipped (the line swaps silently) when there is nothing to watch: zoomed in, tagline hidden by viewport width, tab in the background, tour scrim up, or `--motion` at 0.

## 5. UX and visual design

- **Layout:** single centered column, `max-width` ~700 px, generous whitespace. Top bar contains the logo (click = back to root), breadcrumbs, search, save indicator, and a minimal menu (export/import, theme, show-completed, help).
- **Branding:** the logo is a "37" ligature — the 3 and the 7 sharing a stroke, the 7 terminating in a ring — vectorised from the master artwork into a single `<path>` (one `<symbol>`, `fill-rule="evenodd"` for the ring's counter) drawn in `currentColor`, so it re-inks itself per theme with no separate assets. It appears in the top bar, the help dialog and the tour card via `<use>`. The favicon is built at boot from that same path, so the mark exists exactly once in the file and the tab icon cannot drift from the one on screen; it is held at neutral gray rather than the theme colour, which has to stay legible against whatever chrome the browser puts behind it. Master art lives in `37nodes_logo_huge_raw.png` and is not part of the build.
- **Rows:** bullet + title on one line; note beneath, indented and dimmed. Child guides as subtle vertical lines on hover.
- **Motion:** collapse/expand animates height (~120 ms); zoom transitions with a brief fade/slide. All motion subtle and interruptible; obeys F39.
- **Empty states:** a fresh document seeds a short self-describing outline (a mini tutorial: keys, notes demo, theme pointer) that the user simply deletes. On that same first run the guided tour (F48) opens over it, so the seed outline doubles as the tour's subject matter.
- **Typography:** system font stack by default; themes may override (e-ink → serif, CRT → monospace).

## 6. Non-functional requirements

- **N1. Performance:** smooth (no perceptible input lag) with 5,000 nodes; usable at 20,000. Implies incremental DOM updates (re-render only mutated subtrees, never the whole tree on keystroke) and collapsed subtrees rendered lazily.
- **N2. Payload:** the single file stays under ~150 KB uncompressed — a discipline target, not a hard cap.
- **N3. Browser support:** current Chrome, Edge, Firefox, Safari. No transpilation; modern JS (modules-in-one-file via IIFE or inline `type="module"`).
- **N4. Accessibility:** full keyboard operability (already core), visible focus states, ARIA tree semantics (`role="tree"/"treeitem"`, `aria-expanded`, `aria-level`), WCAG AA contrast in all shipped themes.
- **N5. Data durability honesty:** the UI never overstates safety. The help/menu states plainly that browser-stored site data can be evicted and that JSON export is the real backup.
- **N6. No network:** zero external requests, ever. Works fully offline from `file://`.

## 7. Architecture

```
37nodes.html
├── <style>   – reset, tokens (custom props), components, theme blocks
├── <body>    – top bar, breadcrumb, search, outline container, dialogs/overlays
└── <script>  – single IIFE/module, organized as:
    ├── store.js-section     – document state, mutations, undo stack, persistence
    ├── markdown.js-section  – safe Markdown subset → DOM renderer
    ├── view.js-section      – incremental outline renderer, row lifecycle
    ├── keyboard.js-section  – key handling, focus/caret model
    ├── search.js-section    – filter computation + highlight
    └── io.js-section        – export/import, clipboard
```

**Key decisions:**

- **Unidirectional data flow:** all mutations go through named store actions (`insertNode`, `moveNode`, `setTitle`, …). Actions update state, push an undo entry, schedule a save, and notify the view with the minimal affected scope. No view code writes state directly.
- **Incremental rendering:** each node maps to one DOM row keyed by `id`. Mutations patch only affected rows/subtrees. This is the load-bearing choice for N1.
- **`contenteditable` scope:** titles use single-line `contenteditable` (plaintext-only where supported); notes use a `<textarea>`. Full-document contenteditable is explicitly avoided — it is the classic outliner tar pit.
- **IDs everywhere:** DOM ↔ state correlation is always by node id via `data-id`, never by index or DOM position.
- **Build stamp:** the build script bumps a counter in `build-number.txt` and stamps it, with the build date, into the page; the app shows it at the foot of the ☰ menu. A single-file app gets copied, emailed, and re-downloaded, so a copy has to be able to say which build it is.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Browser storage eviction | Primary store is IndexedDB (done post-v1 — removes the old ~5 MB localStorage quota). F30 warning banner, F32 one-click export, F42 file mirroring, N5 honest messaging. Residual: private modes fall back to localStorage (and its quota); multi-tab is last-write-wins, mitigated by the F28a guard. |
| `contenteditable` cross-browser quirks (caret placement, paste) | Keep editable regions single-line and tiny; normalize paste to plain text; test matrix across the four browsers early, not last. |
| Performance collapse on large outlines | N1 target tested with a generated 20k-node fixture from the first rendering milestone. |
| Markdown parser edge cases / XSS | Fixed small subset, DOM-construction rendering (F19), table-driven unit checks in a dev-only test harness. |
| Single-file DX (one giant file gets unwieldy) | Optional dev layout: source split into sections concatenated by a trivial build script, while the shipped artifact remains one file. Decide at milestone 1. |

## 9. Milestones

1. **M1 — Skeleton & rendering:** data model, store, incremental renderer, load/save, seed document. *Outline displays and persists.*
2. **M2 — Editing core:** title editing, Enter/Backspace/Tab semantics, collapse, undo/redo. *Daily-usable as a plain outliner.*
3. **M3 — Zoom & navigation:** focus node, breadcrumbs, URL hash, full keyboard nav, complete-toggle.
4. **M4 — Notes & Markdown:** note editor, safe renderer, edit-raw/render-on-blur cycle.
5. **M5 — Search, I/O:** live filter with highlights, JSON/Markdown export, JSON import, clipboard behaviors.
6. **M6 — Themes & polish:** token audit, four themes, motion pass, drag-and-drop, help overlay, a11y pass, 20k-node perf validation.

Each milestone ends in a working single file — the app is never broken between milestones.

## 10. Success criteria

- A 30-minute brainstorming session produces a 200-node outline without once touching the mouse or noticing lag.
- Close browser → reopen → everything is exactly as left, including zoom position and theme.
- Export JSON → wipe site data (IndexedDB + localStorage) → import → byte-identical document.
- A pasted `<script>` tag in a note renders as visible text and executes nothing.
- Switching to the CRT theme restyles every visible element with zero layout breakage.

## 11. Open questions (decide during build, defaults noted)

1. **Multiple top-level "pages"?** Default: no — one document, zoom is the organizing tool. Revisit post-v1.
2. **Tags/`@mentions` with click-to-search (Workflowy-style)?** Default: defer to v1.1; cheap once search exists.
3. **Persist undo history across reloads?** Default: no (F26); revisit if in-memory proves insufficient in practice.
4. **OPML export alongside Markdown/JSON?** Default: defer; JSON covers backup, Markdown covers interchange.
