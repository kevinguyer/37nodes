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

`Ctrl+F` focuses the search box and filters the outline as you type, within the current zoom. Every word you type must match, in any order, in an item's title or note.

- `budget q3` finds items containing both words; each may be in the title or the note.
- `"q3 budget"` finds that exact phrase, spaces included.
- `#urgent` finds items tagged `#urgent`: the whole tag, so `#todo` does not match `#todos`.
- `-draft` finds items that do **not** contain *draft*. It works on words, phrases, tags and flags: `-#later`, `-"to do"`.
- `is:starred` finds starred items; `-is:starred` finds the rest.
- `is:done` finds completed items (nothing shows while **Hide completed** is on).
- `links:"Project plan"` finds the item called *Project plan* and everything linked to or from it. Press `Alt+L` on any item (or use **Show linked items** in its ≡ menu, or the panel) to fill this in for you, and press it again to clear.
- `acme > #urgent` finds `#urgent` items somewhere inside an item matching *acme*. Chain it for more levels: `acme > launch > #urgent`.

- `>` must stand alone with spaces around it; the matches to its left are shown dimmed for context.
- To search for a word that begins with `-`, put it in quotes: `"-5"`. Inside quotes, `\"` is a literal quote mark.
- Matches are shown with their ancestors dimmed. Items keep their folds: a collapsed item stays collapsed, unless something inside it matches. Use ▸ to open or close items while searching; that changes only the search view, not your outline.
- **Click a tag chip** to search for just that tag, and click it again to clear. **Shift+click** a chip, in the outline or the panel, to add it to the search you already have, or to take it back out.
- Completed items hidden by `Alt+C` are not results, and neither is anything beneath them.
- Items you create while a search is active stay visible until you change the search.
- `Esc` clears the search.
