# The info panel

A side strip that follows your caret and answers "what is this connected to?".

Open it with the ◨ button in the top bar or `Alt+I`. Drag its left edge to resize it, and double-click the edge to reset.

## Sections

Each section collapses, and the panel remembers which are open.

- **This item** lists what links to the item you are on (each with the line it sits in, link highlighted), where it is mirrored, and its details: created, edited, how many items are inside and how many links go out.
- **Zoomed into** appears when your caret is on something inside the item you have zoomed into. It shows that parent's links and mirrors, which are the ones you came here for, without moving the caret.
- **Starred** is your shortlist. Click a row to go there; click its ★ to unstar it.
- **Tags** lists the tags in the current view with counts. Click a tag to filter, click it again to clear.

## Notes on behaviour

- The panel tracks the caret. With nothing focused it shows the item you are zoomed into.
- Clicking a **starred** or **linked-from** row zooms to that item. An item with things inside becomes the page; one without opens its parent with the item selected. Hold `Alt` while clicking to reveal it where it lives instead, without changing your zoom, or make that the default with **☰ → View → Panel links**. The places listed under **Also appears in** always just take you there.
- **Hide completed** (`Alt+C`) applies here too: completed sources and their tags are not counted.
