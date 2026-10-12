## v2.5 · 2026-10-12

- **A Help Center.** This window: topic pages, search, a full keyboard reference and this list. `?` still jumps straight to the shortcuts.
- **`Alt+C` shows or hides completed items.** It is the same switch as ☰ → Hide completed, and it now governs more: the jump palette, the panel's backlinks and mirrors, and its tag counts.
- **Jump palette: `Parent/Child`.** Type `Projects/Log` to pick the right "Log" when several items share a name. Completed items are left out while they are hidden.
- **Tag counts ignore hidden completed items.** A tag used only on finished work leaves the panel list (not the `#` suggester).
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
