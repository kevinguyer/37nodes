# Finding and moving around

Zoom, jump, search and file things away without leaving the keyboard.

## Zoom

Click a bullet, or press `Alt+→` on an item, to zoom into it. `Alt+←` zooms out one level and `Alt+Shift+←` goes all the way to the top. The zoom lives in the page address, so your browser's back and forward buttons walk your zoom history, and you can bookmark any item.

## The jump palette

`Ctrl+K` opens a fuzzy finder over every item title. It works from anywhere, including while you are typing.

- Type a few letters; they need not be contiguous. Matches at word starts rank higher.
- With nothing typed it shows what you **edited most recently**, so `Ctrl+K` then `Enter` returns you to where you were.
- **Same name in several places?** Type the path: `Projects/Log` finds the item called "Log" under an ancestor containing "Projects". `>` and `›` work as separators too, and `Projects/` lists everything inside a match. If a title really contains a slash, a query that finds nothing falls back to a literal search.
- With **Hide completed** on, finished items are left out of the list.

## Move to…

`Alt+M` uses the same picker to choose a *destination*: the current item, with everything under it, becomes the last child of the one you pick. It is one undo step, and the caret follows the item. Choose **Top level** to file something back out to the root.

## Search

`Ctrl+F` focuses the search box and filters the outline as you type, within the current zoom.

- It matches titles **and** notes, ignoring case.
- Matches are shown with their ancestors dimmed for context.
- A search made only of a single `#tag` matches that whole tag: `#todo` does not match `#todos`. Click any tag chip to search for it, and click it again to clear.
- Completed items hidden by `Alt+C` are not results, and neither is anything beneath them.
- Items you create while a search is active stay visible until you change the search.
- `Esc` clears the search.
