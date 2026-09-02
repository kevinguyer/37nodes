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

Source: first batch from a heavy daily user, received 2026-09-02.

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

## Feature requests

| ID | Title | Status | Size | Risk | Recommendation |
|---|---|---|---|---|---|
| FR-1 | Filter by several tags at once | Discuss | S–M | Low | Yes; decide AND vs OR and the chip gesture |
| FR-2 | Resizable side panel | Done (build 51, F61) | S | Low | Yes |
| FR-3 | Richer backlinks view (context, collapsible children) | Discuss | M–L | Low | Yes in two phases; need a concrete picture of phase 2 |
| FR-4 | Option: don't jump after "Move to…" | Discuss | S | Low | Yes; decide pref vs modifier key |
| FR-5 | Hide completed items in the backlinks list | Discuss | S | Low | Yes; propose following the existing Hide-completed toggle |
| FR-6 | "Mirror to…" command | Approved | S–M | Low | Yes; rides on the Move-to picker |
| FR-7 | Multi-line (multi-item) selection | Discuss | XL | Medium | Yes, but as its own release, scoped to sibling ranges |
| FR-8 | On a mirror, show every other place it appears | Discuss | S | Low | Yes; confirm what he is seeing today |
| FR-9 | Ctrl+Home / Ctrl+End: first / last item in view | Done (build 48, F68) | S | Low | Yes |
| FR-10 | Panel section for the zoomed-into item as well as the selected one | Approved | S–M | Low | Yes |
| FR-11 | Keep the caret on the item you zoomed out of (and into) | Done (build 49, F12) | S | Low | Yes, for every zoom path |
| FR-12 | Keep collapse state while a tag filter is active | Discuss | M | Medium | Yes, with a different rule than asked for; touches a documented invariant |

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

---

## Suggested batches

1. **Bug fixes first**, one small commit each: BUG-2, then BUG-1.
2. **Small wins**, same branch as the fixes: FR-9, FR-11, FR-2, FR-5, FR-10,
   FR-8, FR-4 → ship as v2.5.
3. **Picker and filter work**: FR-6, FR-1, FR-12, FR-3 phase 1 → v2.5.x.
4. **Selection** FR-7 → v2.6, its own branch and PRD section.
5. FR-3 phase 2 after that, once phase 1 has been lived with.

## Changelog

| Date | Change |
|---|---|
| 2026-09-02 | File created from the first user batch; BUG-1 and BUG-2 reproduced on build 46. |
| 2026-09-02 | BUG-2 fixed: every zoom ends the edit in progress first, and the header always re-renders when the zoomed item changes. |
| 2026-09-02 | BUG-1 fixed: the reconciler drops a re-homed row unless a destination instance will actually claim it. |
| 2026-09-02 | FR-9 shipped: Ctrl+Home / Ctrl+End. |
| 2026-09-02 | FR-11 shipped: the caret survives every zoom. |
| 2026-09-02 | FR-2 shipped: drag the panel's left edge; double-click resets. |
