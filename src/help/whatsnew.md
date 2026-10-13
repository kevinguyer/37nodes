## v2.5 · 2026-10-12

- **A Help Center.** This window: topic pages, search, a full keyboard reference and this list. `?` still jumps straight to the shortcuts.
- **`Alt+C` shows or hides completed items.** It is the same switch as ☰ → Hide completed, and it now governs more: the jump palette, the panel's backlinks and mirrors, and its tag counts.
- **Jump palette: `Parent/Child`.** Type `Projects/Log` to pick the right "Log" when several items share a name. Completed items are left out while they are hidden.
- **Tag counts ignore hidden completed items.** A tag used only on finished work leaves the panel list (not the `#` suggester).
- **A real search language.** Several words now all have to match, `"quotes"` make a phrase, `-` excludes, `is:starred` and `is:done` filter by flag, and `acme > #urgent` searches *inside* matches of `acme`. Shift+click a tag chip to add it to your search. **One change to know about:** `foo bar` used to look for that exact text; it now finds items with both words, so put it in quotes if you want the phrase. See Finding and moving around.
- **Show only linked items (`Alt+L`).** On any item, narrow the whole outline to it plus everything that links to it or from it. It is just a search (`links:"Title"`), so `Esc` clears it and you can combine it with other terms.
- **Saved and recent searches.** Click ☆ beside the search box to keep a search, then find it under **Saved searches** in the info panel (rename it with ✎). The search box also drops down your saved and recent searches. They stay in this browser: they are not part of an export.
- **Mirrors have their own symbols.** An item that has mirrors shows a filled diamond; each mirror shows a hollow one. `Ctrl+↑`/`Ctrl+↓` also fold a mirror's contents now.
- **Stay where you are after Move / Mirror to….** `Shift+Enter` in the picker does the opposite of the default for that one move, and **☰ → View → After Move / Mirror to…** sets the default, so filing a run of items no longer carries you away.
- **Mirror to… (`Alt+Shift+M`).** Show an item inside any other one as a live mirror, picked by name, without moving the original.
- **Searching keeps your folds.** A filter no longer opens every item: collapsed items stay collapsed unless something inside them matches, and the ▸ arrows work inside a search without changing your outline.
- **Move to… (`Alt+M`).** File an item inside any other one by name, with the caret following it there.
- **`Ctrl+Home` / `Ctrl+End`** jump to the first and last item in view.
- **The caret survives zooming**, whichever way you zoom, so you do not lose your place.
- **Resizable info panel**: drag its left edge. It also gained a **Zoomed into** section.
- **Fixes:** Move to… no longer leaves a ghost copy behind, and jumping with Ctrl+K from a zoom header no longer shows the old title.

## v2.4 · starred items and tags

- **Starred items** (`Alt+S`): a shortlist, listed in the panel.
- **Tag index** with counts, and **tag autocomplete** as you type `#`.
- A tidier, grouped ☰ menu.

## v2.0–v2.3 · foundations

- **Backlinks and the info panel** (v2.3), with an offer to update inbound links when you rename an item.
- **Mirrors** (v2.2): one item, shown in several places.
- **Item menu, headings, bullet colours and inline formatting** (v2.1).
- **A real database** (v2.0): IndexedDB storage and migration, so large outlines and future upgrades are safe.
