# 37nodes — user feedback tracker

Feature requests and bug reports from real users, each with an id and a status,
so decisions can be made (and looked up) out of band. This file is the queue;
`PRD.md` stays the spec — when an item ships it gets an F-number there and a
"Done" row here.

**Statuses:** `Discuss` (needs a decision) · `Approved` · `In progress` ·
`Done (build N, Fxx)` · `Deferred` · `Declined`.
**Size:** S = an hour or two, contained · M = a day, touches two or three
modules · L = several days, new subsystem · XL = its own release.
**Risk:** how likely the change is to disturb behaviour that works today.

Source: first batch from a heavy daily user, received 2026-09-02; second
batch from the same user, received 2026-10-12 (FR-13…FR-22, and an extension
of FR-12).

---

## Bugs

| ID | Title | Status | Size | Priority |
|---|---|---|---|---|
| BUG-1 | "Move to…" leaves a ghost copy of the moved item in its old list | Done (build 47, F67) | S | High |
| BUG-2 | Jumping (Ctrl+K) while the caret is in the zoom header leaves the old title in the header | Done (build 46, F41) | S | **Highest** — can corrupt a title |
| BUG-3 | Cannot link to an item whose title itself contains a `[[link]]` | Declined (by design) | — | — |

### BUG-1 — ghost row after "Move to…"

**Reported as:** "When I create a mirror and then move it, a third copy of the
mirror gets placed at the bottom of the list where the original is located."

**Reproduced (build 46).** It is not mirror-specific: any item moved with
`Alt+M` into a destination that is **collapsed** (or not rendered at all) is
drawn twice — once, correctly, inside the destination, and once as a stale row
at the *bottom* of the list it came from. The stale row is dead DOM: it is no
longer in `elMap`, so the caret and later renders ignore it, but it stays on
screen until something rebuilds that container. Mirrors are simply where he
noticed it, because a fresh mirror sits right after its original and gets
moved soon after.

**Root cause:** `reconcileChildren` in `04-view.js` deliberately leaves a
removed element alone when the node still exists under another parent, on the
assumption that the destination's own `children` event will re-home it. That
holds when the destination is rendered and expanded. When it is collapsed,
`renderChildrenOf` clears the destination's container instead of reconciling,
and nothing ever claims the old element. The valid siblings get inserted ahead
of it during the reconcile, which is why it ends up last.

**Fix sketch:** in the removal pass, keep the element only if the new parent
has a live, expanded instance that will actually reconcile; otherwise remove
it. Alternatively `paletteMove` could pass the destination through
`revealNode` *before* the move, so the destination is always expanded when its
event fires — cheaper, but it only patches the palette path (drag-and-drop
already expands its target; dnd is fine today).

### BUG-2 — stale zoom header after a Ctrl+K jump

**Reported as:** "Zoomed into a node and switching via Jump to: the app
navigates but the title still shows the node I was just on. Maybe only when
the target has no child items."

**Reproduced (build 46).** The trigger is where the caret *was*, not where it
goes: when you are zoomed into an item with no children, the caret lives in the
zoom header (there is no row to land on). `paletteGo` changes the hash and
re-renders, but `renderFocusHead` skips rewriting the header text while the
header is focused — a guard meant to protect in-progress typing — and the
`<dialog>` hands focus straight back to that header when it closes. Result:
URL, breadcrumbs and tree show the destination, the header still shows the
origin's title, and the caret is in it.

**Why it is the top priority:** the header edits whatever `view.focusId`
points at. Typing a character there now stores *the old item's title plus the
keystroke* as the destination's title. Undo recovers it, but it is silent data
damage.

**Fix sketch:** `renderFocusHead` must always rewrite the text when the zoom
target changed (track the id the header currently shows), and `paletteGo` /
`jumpToNode` should blur the active editor before changing the hash. Both are
a few lines.

### BUG-3 — linking to an item that contains a link

**Reported as:** "Unable to link to a node that contains a link. Mostly
experimentation."

**Not a bug.** Links are `[[title]]`, matched by title text, and the grammar
has no nesting: `[[A [[B]]]]` cannot be parsed, so `11-linkauto.js` deliberately
never offers a bracketed title in the `[[` picker. Making this work means
either links-by-id (a much bigger change with its own trade-offs — F44 chose
title matching on purpose) or an escaping syntax nobody would type.
**Recommendation:** decline, and add one sentence to F44 in the PRD saying
so. Revisit only if he has a real use for it.

---

## Documentation

| ID | Title | Status | Size | Risk |
|---|---|---|---|---|
| DOC-1 | In-app Help Center with a What's new list | Done (build 61, F72, F73) | M | Low |

### DOC-1 — Help Center

**Raised 2026-10-12** by the maintainer, as features outgrew the single `?`
shortcut dialog and the feature list no longer fit in a README. Decisions:
in-app only (the single-file, no-network model stays whole); What's new
included; `?` opens the shortcut reference, and the ☰ menu row (now **Help…**)
opens the overview. Authoring is markdown in `src/help/`, with the shortcut
table as data in `18-help.js`. The "definition of done" in `CLAUDE.md` is the
mechanism that keeps it current.

---

## Feature requests

| ID | Title | Status | Size | Risk | Recommendation |
|---|---|---|---|---|---|
| FR-1 | Filter by several tags at once | Approved (as part of FR-18) | S–M | Low | AND, `Shift`+click chip; specified in F75/F77 |
| FR-2 | Resizable side panel | Done (build 51, F61) | S | Low | Yes |
| FR-3 | Richer backlinks view (context, collapsible children) | Discuss | M–L | Low | Yes in two phases; need a concrete picture of phase 2 |
| FR-4 | Option: don't jump after "Move to…" | Discuss | S | Low | Yes; decide pref vs modifier key |
| FR-5 | Hide completed items in the backlinks list | Done (build 60, F69) | S | Low | Yes; follows the global Hide-completed toggle |
| FR-6 | "Mirror to…" command | Approved | S–M | Low | Yes; rides on the Move-to picker |
| FR-7 | Multi-line (multi-item) selection | Discuss | XL | Medium | Yes, but as its own release, scoped to sibling ranges |
| FR-8 | On a mirror, show every other place it appears | Discuss | S | Low | Yes; confirm what he is seeing today |
| FR-9 | Ctrl+Home / Ctrl+End: first / last item in view | Done (build 48, F68) | S | Low | Yes |
| FR-10 | Panel section for the zoomed-into item as well as the selected one | Done (build 52, F61) | S–M | Low | Yes |
| FR-11 | Keep the caret on the item you zoomed out of (and into) | Done (build 49, F12) | S | Low | Yes, for every zoom path |
| FR-12 | Keep collapse state while a filter is active (and let ▸ work inside it) | Done (build 62, F74) | M | Medium | Yes, with a different rule than asked for; touches a documented invariant |
| FR-13 | Keyboard shortcut to toggle Hide completed | Done (build 60, F69) | S | Low | `Alt+C`; one global switch |
| FR-14 | Hide completed items in the Ctrl+K jump palette | Done (build 60, F70) | S | Low | Follows the global toggle |
| FR-15 | Jump palette: `Parent/Log` path syntax to disambiguate | Done (build 60, F70) | S–M | Low | Palette-only; shared matcher untouched |
| FR-16 | One-key filter to items linked to/from the selected item | Discuss | M | Medium | Yes, but as an operator of FR-18's grammar, not a one-off |
| FR-17 | Saved searches | Approved | M | Medium | Stored **in the document** and carried by export/import (decided 2026-10-12); after FR-18 |
| FR-18 | Chained / multi-term search with operators | In design (spec: PRD F75–F77) | M–L | Medium | Same-item AND **and** scoped `>` (decided 2026-10-12); grammar into the PRD before code |
| FR-19 | Filter by starred / unstarred | Approved (as part of FR-18) | S | Low | `is:starred` / `-is:starred`; specified in F75 |
| FR-20 | Distinct glyph for mirrors (diamond) | Discuss | S | Low | Yes, CSS only; confirm what he sees today |
| FR-21 | Tag counts exclude completed items; hide zero-count tags | Done (build 60, F71) | S | Low | Panel only; follows the global toggle |
| FR-22 | Starred / backlink click zooms into the item | Discuss | S | Low | Yes, as a pref; decide leaf behaviour |

### FR-1 — several tags at once

Today a query that is exactly one `#tag` is an exact-tag filter; anything else
is a substring search, so `#work #urgent` is looked up as the literal string.
`computeFilter` in `04-view.js` is the only place that decides this, and the
tag-chip `active` highlight (title chips and the panel's tag cloud) compares
against a single tag string.

- **Proposal:** a query made only of `#tag` tokens becomes an **AND** filter
  (item must carry all of them). His wording — "some of my nodes have more
  than one tag" — reads as narrowing, and AND is what a second click should
  mean. OR is what search already gives you by typing the tags one at a time.
- **Gesture:** plain click on a chip replaces the query (as now);
  **Shift+click** adds the tag to the current query. Typing `#a #b` in the
  search box works too.
- **Decision needed:** AND (recommended) or OR, or both with a syntax.

### FR-2 — resizable panel

The panel width is one CSS variable (`--panel-w`) that the body padding, the
banner and the menu all key off. A drag handle on the panel's left edge that
writes the width into that variable, clamped, and remembers it in prefs is
all this needs. No layout risk; the narrow-screen breakpoint already turns the
panel into an overlay and can ignore the pref.

### FR-3 — richer backlinks view

**Reported as:** something like Obsidian's "Better Search View" plugin, plus
the source item's nested bullets shown underneath, collapsible, collapsed by
default.

Backlinks are derived on demand (`16-panel.js`) and the panel only shows the
source's title and path. Two distinct asks are bundled here:

1. **Context** — show the line the link sits in (title, or the note line
   containing `[[…]]`) with the link highlighted. Small: the index already
   knows whether the hit is in the title or the note; it just needs to keep
   the surrounding text. **Do this first.**
2. **Children under each backlink** — a read-only mini-outline inside the
   panel, collapsed by default. This is a new renderer (the main tree
   renderer is tied to `elMap`/`instMap` and editing, and must not be reused
   for a second copy of the same nodes). Isolated and low-risk, but real
   work, and it needs a depth/count cap so a backlink from a 2,000-item
   subtree does not build 2,000 rows.

**Decision needed:** confirm phase 1 covers most of the value, and get one
sentence from him on what exactly he uses in Better Search View (the context
lines? the tree? the "show more" behaviour?) before sizing phase 2.

### FR-4 — don't jump after "Move to…"

`paletteMove` always calls `jumpToNode` after the move. Skipping it is
trivial; the question is where the caret goes, since the row it was in has
left the view. Proposal: land on the next visible sibling, else the previous
one — exactly what delete does.

- **Option A (asked for):** a pref in ☰ › View, "After Move to: follow the
  item / stay where I am".
- **Option B:** no pref; `Shift+Enter` in the picker means "move and stay".
- Both together cost nothing extra. **Decision needed.** FR-6 inherits
  whichever is chosen.

### FR-5 — hide completed items in the backlinks list

Simplest correct version: when the global **Hide completed** toggle is on,
the panel's backlink and mirror lists omit completed sources, because a click
on one would jump to a row that cannot be shown. That matches how search
already treats hidden completed rows (`completedRowsHidden`). A separate
panel-only toggle is possible but adds a second switch that means almost the
same thing.
**Decision needed:** follow the global toggle (recommended) or add a panel
toggle.

### FR-6 — "Mirror to…"

The picker in `10-palette.js` already has jump and move modes; a third mode
that creates a mirror of the current item as the last child of the chosen
destination is the same shape. `03-store.js` needs a `createMirrorIn(target,
parent, index)` next to `createMirror`. Destinations inside the item's own
subtree should be filtered out (a mirror inside its original renders as a
loop stub). Shortcut proposal: **Alt+Shift+M**; also an entry in the ≡ menu.
Follows FR-4's follow/stay behaviour.

### FR-7 — multi-item selection

**The big one.** Every editing primitive assumes one caret in one title:
titles are separate contenteditables switched on just in time, drag is by
bullet for one node, keyboard commands read `idOfTitle(activeElement)`.
Native text selection across rows is not achievable in this model and would
fight the browser.

What is achievable, and what Workflowy actually does, is **row selection of a
contiguous sibling range**: `Shift+↓`/`Shift+↑` from a title extends a
selection over neighbouring siblings (click, Shift+click too); the selected
rows highlight; and the structural commands act on the range as one undo
step: Tab / Shift+Tab, Alt+↑/↓, Ctrl+Enter, delete, Ctrl+Shift+C, drag,
Move to, Mirror to. Escape or any plain keystroke drops back to a caret.

- Not destabilising if built as a separate mode with its own module, but it
  touches keyboard, dnd, palette, node menu, and the view (highlight state
  that survives reconciles).
- **This should be its own release** (v2.6), after the small items ship, not
  mixed into the same branch. It is not a fork — the data model does not
  change.
- **Decision needed:** confirm sibling-range scope is what he wants, and ask
  which operations matter most so the first cut can be smaller.

### FR-8 — on a mirror, show the other mirrors

**Reported as:** "When a mirror is selected, show where the other mirrors are,
not just where the original version is."

Today the panel tracks the *content* id, so with the caret in a mirror row it
shows the original's details, including "Mirrored in N places" listing every
mirror — but it never says where the **original** lives, and it does not mark
which of the listed rows is the one you are in. The row tooltip and the ≡ menu
only offer "the original". Proposal: replace that block with **"Also appears
in"** — the original's path first, then every mirror, with the current
instance marked — shown whether the caret is on the original or a mirror.
Cheap, panel-only.
**Decision needed:** check this reading against what he sees; his wording
suggests he may be looking at the row tooltip rather than the panel.

### FR-9 — Ctrl+Home / Ctrl+End

In a title, jump to the first / last visible title in the current view
(`visibleTitles()` already exists). Leave the keys alone inside a note editor,
where they have their native meaning. Trivial.

### FR-10 — panel section for the zoomed-into item

When zoomed in and the tracked item differs from the zoom target, add a second
collapsible section ("Zoomed into: …") with the same body as "This item".
`ipItemBody` is already parameterised by id, so this is mostly a section and
a pref for its open/closed state.

### FR-11 — keep the caret across zoom

Every zoom path (Alt+←/→, breadcrumbs, bullet clicks, wikilinks, Home) goes
through `applyFocusFromHash`, which rebuilds the tree and drops focus. Change:
remember which item had the caret; after the render, if that item is visible
in the new scope put the caret back on it, otherwise (zoom **in**) put it on
the zoom header. One function, low risk.

### FR-12 — collapse state under a tag filter

**Reported as:** "Option to retain node collapse state when in the tag filter
view."

Today a search filter forces every node open (`04-view.js`, and CLAUDE.md
lists it as an invariant that other code relies on, e.g. `handleEnter`).
Honouring `collapsed` blindly would hide matches inside collapsed items, which
is worse than the current behaviour.

**Proposed rule instead of an option:** a node is forced open only while a
*descendant* matches; a node that matches keeps its own collapse state, since
its subtree is shown as context rather than as results. Nothing that matches
can ever be hidden, the outline looks the way he left it, and the ▸ toggles
work inside the filter. Applies to text search as well as tag filters — no
reason to special-case.

- Medium risk: it changes a documented invariant, so every place that asks
  "is it expanded" during a filter needs a look (`applyNodeState`,
  `renderNode`, the `collapse` event handler, `handleEnter`).
- **Decision needed:** default behaviour (recommended) or a pref.

**Amended 2026-10-12 (second batch):** he restated it as "preserve collapse
state when entering a filtered view, **while also allowing nodes to be
manually collapsed or expanded within that view**." Two consequences:

- It applies to every filter, not just tags — already the plan above.
- The second half collides with the proposed rule. A node forced open
  because a descendant matches can then be collapsed by hand, hiding that
  match. That is the user's choice and should be allowed, but it must not
  write `collapsed` into the document: exploring a search would silently
  re-fold the outline. **Proposal:** a session-local override map
  (`id → open|closed`) on `view`, consulted before the rule above and cleared
  whenever the query changes. Persisted collapse state is then only ever
  changed outside a filter, as today. This is what moves FR-12 from "S–M" to
  M: the override has to be honoured in the same four places the rule is.

### FR-13 — shortcut for Hide completed

**Decided 2026-10-12:** one global switch, no panel-only toggle. Shipped as
`Alt+C` (mnemonic *C*ompleted; `Alt+H` would open Firefox's Help menu, and
`Alt+S`/`Alt+M`/`Alt+I` are taken). FR-5, FR-14 and FR-21 all read it.

The checkbox in ☰ already drives everything (`09-main.js` change handler →
`prefs.hideCompleted` → `body.hide-completed`); a shortcut is a second caller
of that same handler, plus an entry in the shortcut list and the PRD key
table. The work is picking a key that does not collide with the existing
`Ctrl`/`Alt`/`Shift` combinations in `06-keyboard.js` and the browser's own.
**Reading to confirm:** his parenthetical "(distinct from hiding completed
items in the backlinks pane)" could mean (a) "this is a separate request from
FR-5", or (b) "the backlinks pane should have its own independent switch."
FR-5 recommended *following* the global toggle; (b) contradicts that.
**Decision needed:** (a) or (b). Recommendation: one authority — the global
toggle — with FR-5, FR-14 and FR-21 all obeying it, and FR-13 making it cheap
to flip.

### FR-14 — hide completed in the jump palette

`paletteIndex()` snapshots every node on open. Skip completed nodes **and
their subtrees** (the CSS hides the whole subtree, so a jump into one lands on
a row that cannot be shown — `09-main.js` already has to handle that case).
Jump mode only: in Move mode a completed item is still a legitimate
destination. **Decision needed:** follow the global toggle (recommended, same
reasoning as FR-5) or a palette-only pref. Following it means the dialog
simply reads `completedRowsHidden()` when it opens.

### FR-15 — `Parent/Log` in the palette

**Reported as:** disambiguate identically named items under different
parents, e.g. `Parent/Log`.

`palItems` already carries each item's `path`, but only as a display string
with each label truncated to 30 characters, so it is not safe to match
against. Proposal: keep the ancestor titles as an array on each item; when
the query contains a separator, match the last segment against the item title
with the existing `fuzzyMatch` and require each earlier segment to fuzzy-match
some ancestor, in order. Rank by the title score.

- **Do not change `fuzzyMatch` itself** — `11-linkauto.js` shares it, and
  link autocomplete must keep treating `/` literally.
- **Separator:** `/` is fine, with a fallback: if the split query finds
  nothing, retry it as a literal string, so titles that really contain `/`
  ("and/or", dates) stay reachable. `›` (what the result path already shows)
  and `>` can be accepted as aliases at no cost.
- Related, not in scope: `[[wikilinks]]` cannot disambiguate duplicates either
  (F44, first in document order wins). Worth a line in the PRD if he asks.

### FR-16 — filter to what links to/from the selected item

**Reported as:** instantly filter the whole list to nodes linked to or from
the selected node; real references only, like Obsidian's *linked* (not
*unlinked*) mentions.

The semantic is already right: the backlink index in `16-panel.js` only knows
`[[…]]` links, resolved the renderer's way, and `linksOutOf` counts forward
links. The filter machinery can show a set of ids with dimmed ancestors
(`view.filter.matched/anc/under`).

The catch is that **the filter is driven by `view.query`, a string.** It
feeds the search box, highlight (`highlightFrag` assumes a substring), tag-chip
`active` state and the hash/clear logic. An id-set filter would be a second
source of truth beside it. That is the reason not to build this alone: add it
as an operator in FR-18's grammar (say `links:` evaluated against the
selected item when the filter is applied, shown as a removable chip in the
search box), and it inherits clear/escape/highlight behaviour for free.

- **Decision needed:** does "linked" include mirrors of the item, and
  both directions or a choice? Recommendation: both directions plus mirrors,
  as one filter, with the selected item itself kept in the results.

### FR-17 — saved searches

**Decided 2026-10-12:** saved searches live **in the document** and travel
with JSON export/import (so the prefs-first recommendation below is
superseded). That makes this a data-model change: a `schemaVersion` bump with
a `DOC_MIGRATIONS` step, the field in export and import (including the
file mirror), and a decision on markdown export (recommend: omit). Still
sequenced after FR-18, because what gets stored should be the grammar.

Once a search is a well-formed expression (FR-18), a saved search is just a
named string. The real decision is **where it lives**:

- **Prefs (localStorage):** trivial, no migration — but per browser, not in
  exports or the file mirror.
- **In the document:** survives export/backup/sync, but it is a data-model
  change: `schemaVersion` bump, a `DOC_MIGRATIONS` step, import/export and
  markdown export all learn about it. That is the destabilising option.

**Recommendation:** prefs first, listed as a "Saved searches" section in the
panel next to Starred (click = apply, ✕ = remove). Move into the document only
if he asks for it to travel. Do not build before FR-18 — saving today's
free-text query is easy, but a stored format should be the grammar's.

### FR-18 — chained / nested search

**Reported as:** search a project name, then narrow by tags, tag
combinations or text strings.

This is the one item in the batch that is a design problem rather than a
feature. `computeFilter` (`04-view.js`) knows exactly one special case today:
a query that is a single `#tag`; everything else is one substring.

**Two different meanings of "narrow", which must be chosen between:**

1. **Same-item AND** — an item matches only if it satisfies every term
   (`#work #urgent budget`). Simple, flat, predictable; subsumes FR-1.
2. **Scoped** — find items matching term 1, then show only items *beneath*
   them matching term 2 ("everything tagged #urgent inside the Acme
   project"). That is what "search a project name and then narrow" literally
   describes, and it is a different computation (`under` already exists: it is
   the set beneath a match).

A small grammar can offer both without ceremony: whitespace-separated terms
are same-item AND; a separator such as `>` means "inside": `acme > #urgent`.
Operators (`#tag`, `is:starred`, `is:done`, `links:`, `-term` for NOT) are
tokens with one evaluator each. Quoted phrases for literal spaces.

- **Risk: medium.** `computeFilter` is the hub of the view layer and
  everything keyed off `view.filter` (highlight, tag-chip active compare,
  Enter-in-search jump, FR-12's expansion rule). It is contained to one
  function plus those consumers, and no data changes — but it needs a written
  grammar (PRD section) before code, and the same hand-driven DOM testing as
  the previous filter changes.
- **Not "some day".** Everything else in the search cluster depends on it.
- **Decided 2026-10-12:** both — same-item AND *and* the scoped `>` operator.
- **Spec drafted 2026-10-12** as PRD F75–F77, awaiting review before any code.
  Shape: whitespace-separated terms (word, `"phrase"`, `#tag`, `is:starred`,
  `is:done`), each negatable with `-`, all ANDed per item; a standalone `>`
  chains scope groups down the ancestors (`acme > launch > #urgent`).
- **One deliberate behaviour change:** `foo bar` stops being one literal
  substring and becomes two ANDed words; quotes restore the phrase. This is
  the price of making multi-term search work without a mode switch, and it
  needs a What's-new line when it ships.
- **FR-16 and FR-17 fall out of it cheaply.** "Filter to links of this item"
  becomes the operator `links:"Item title"` — title-resolved exactly like a
  `[[link]]` (F44), so it is human-readable, savable and needs no ids; the
  gesture just writes it into the search box. A saved search (FR-17) is the
  query string and nothing more.
- **Known interaction:** `is:done` finds nothing while Hide completed is on
  (F51: hidden completed items are never results). The help page should say so.

### FR-19 — filter by starred

With FR-18, `is:starred` / `-is:starred` are two tokens. Standalone it is a
one-line predicate in `computeFilter`, but there is no good way to *type* it
today (it would be a magic string), which is why it should ride on the
grammar. A ★ toggle button in the panel's Starred header that fills the search
box with the operator is the discoverable form.

### FR-20 — a distinct glyph for mirrors

Mirror rows **and** originals that have mirrors already share a `⧉` badge
(`app.css`, `.node.mirror` / `.node.mirrored`). So "distinct" probably means
one or both of: the glyph is too similar to the normal bullet to spot at a
glance, or a mirror cannot be told from its original. **Check against what he
sees before sizing.**

Either way it is CSS only and themes pick it up through tokens. One concrete
improvement regardless: `⧉` is a font-fallback glyph and varies by platform; a
diamond drawn with CSS (a rotated square on the bullet) is identical
everywhere, and can be filled for the original-with-mirrors and hollow for the
mirror itself. Keep the existing per-colour overrides working.

### FR-21 — tag counts without completed items

`tagIndex` (`17-stars-tags.js`) counts every non-mirror item. Two traps:

- **The `#` suggester reads the same index.** If zero-count tags are dropped
  at the index, a tag used only on finished items disappears from
  autocomplete — you could no longer tag a new item with it. Apply the
  exclusion in the panel view only (`ipTagsBody`), keeping the full
  vocabulary for the suggester.
- **Count must agree with what a click shows.** The count says 3, the click
  filters to 5 if completed items are visible. That is the argument for the
  count following the global Hide completed toggle (see FR-13) rather than
  always excluding. If he wants it unconditional, the click should also drop
  completed hits so the two agree. Either way a completed subtree should
  count as completed (the CSS hides it), not only the flagged node.
  `toggleCompleted` already emits `node`, which dirties the tag cache; the
  hide-completed checkbox does not, so it needs an explicit panel re-render.

**Decision needed:** follow the toggle (recommended) or always exclude.

### FR-22 — starred / backlink click zooms in

Panel rows call `jumpToNode`, which deliberately *reveals in place* and only
changes zoom if the target is outside the current scope — hence "highlighting
it at the top level." A pref, "Panel links: reveal in place / zoom into item",
with the existing behaviour as the default, covers both of his asks (Starred
and backlinks, separately configurable if he likes). A modifier (Alt+click =
the other behaviour) is free.

**Decision needed:** what zooming into a **leaf** does. An empty page with
only a header is a poor landing. Options: zoom to the item anyway (matches the
zoom model), or zoom to its parent with the item focused (more context,
different from "zoom directly into that node"). Note FR-11's rule already puts
the caret on the zoom header when the item has no row — fine either way.
Mirrors zoom into the original's subtree; the breadcrumb should say so.

---

## Suggested batches

1. **Bug fixes first**, one small commit each: BUG-2, then BUG-1.
2. **Small wins**, same branch as the fixes: FR-9, FR-11, FR-2, FR-5, FR-10,
   FR-8, FR-4 → ship as v2.5.
3. **Picker and filter work**: FR-6, FR-1, FR-12, FR-3 phase 1 → v2.5.x.
4. **Selection** FR-7 → v2.6, its own branch and PRD section.
5. FR-3 phase 2 after that, once phase 1 has been lived with.

**Second batch (2026-10-12), proposed sequencing:**

6. **Small, independent, low risk** — one commit each, no ordering between
   them: FR-13, FR-14, FR-20, FR-21, FR-22. Settle FR-5's "follow the global
   toggle" decision first, because FR-13/14/21 all lean on it.
7. **FR-15** (palette path syntax) — palette-only, ship alongside batch 6.
8. **Filter core, in this order:** FR-12 (collapse rules) → FR-18 grammar
   (with FR-1 and FR-19 as its first operators) → FR-16 → FR-17. FR-12 goes
   first because it only changes expansion; FR-18 changes what matches, and
   the two should not land in one diff. Write the grammar into the PRD
   before touching `computeFilter`.
9. Nothing here needs to be parked as "someday". The only item with
   architectural weight is FR-18; FR-16 and FR-17 are what would go wrong if
   built ahead of it, so they are sequenced behind it rather than deferred.

## Changelog

| Date | Change |
|---|---|
| 2026-09-02 | File created from the first user batch; BUG-1 and BUG-2 reproduced on build 46. |
| 2026-09-02 | BUG-2 fixed: every zoom ends the edit in progress first, and the header always re-renders when the zoomed item changes. |
| 2026-09-02 | BUG-1 fixed: the reconciler drops a re-homed row unless a destination instance will actually claim it. |
| 2026-09-02 | FR-9 shipped: Ctrl+Home / Ctrl+End. |
| 2026-09-02 | FR-11 shipped: the caret survives every zoom. |
| 2026-09-02 | FR-2 shipped: drag the panel's left edge; double-click resets. |
| 2026-09-02 | FR-10 shipped: a "Zoomed into" panel section while the caret is elsewhere in the zoomed item. |
| 2026-10-12 | Second user batch triaged: FR-13…FR-22 added; his collapse-state request merged into FR-12 (amended with a session-local override). FR-16/17/19 sequenced behind FR-18's grammar. |
| 2026-10-12 | Decisions: one global Hide-completed switch (FR-13); FR-18 does AND and scoped `>`; FR-17 saved searches live in the document and ride export/import. |
| 2026-10-12 | FR-13 shipped (`Alt+C`), FR-5, FR-14, FR-15 (`Parent/Log`), FR-21 shipped. FR-20 and FR-22 held for answers on what he sees. |
| 2026-10-12 | DOC-1 shipped: the Help Center (overview, topics, keyboard reference, What's new). |
| 2026-10-12 | FR-12 shipped: filters keep collapse state; ▸ works inside a search as a session override (F74). |
