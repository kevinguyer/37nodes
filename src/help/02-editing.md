# Editing and structure

Everything you do to an item's text and place in the outline.

## Titles and notes

A title is one line. A note is free-form markdown under it: `Shift+Enter` opens it, and it renders when you click away. Notes support bold, italic, `code`, links, lists, quotes and headings.

Pasting several lines at once turns them into structure: indentation becomes nesting, and `-`, `*` and `1.` list markers are stripped.

## Moving things

- `Tab` / `Shift+Tab` indent and outdent, bringing the item's children with it.
- `Alt+↑` / `Alt+↓` move an item up or down among its siblings.
- Drag an item by its **bullet** to reorder it, or drop it onto another item to nest it inside.
- `Alt+M` files the item inside another one you pick by name. See [Finding and moving around](#help/navigating).

## Completing, collapsing, deleting

- `Ctrl+Enter` marks an item done. Completed items are struck through; a parent shows a `done/total` count of its children once any are checked.
- `Alt+C` hides or shows completed items everywhere. It is one switch: search, the jump palette and the panel all follow it.
- `Ctrl+↑` / `Ctrl+↓` collapse and expand. A ringed bullet means something is folded inside.
- `Backspace` on an empty item deletes it and keeps its children. `Ctrl+Shift+Backspace` deletes the item *and everything under it*; undo is the safety net.

## Making things stand out

Select text in a title and a small bar appears: bold, italic, underline, code, link, text colour and highlight. `Ctrl+B`, `Ctrl+I` and `Ctrl+U` do the first three directly.

The **≡ handle** that appears beside a row, or `Ctrl+.`, opens the item menu: heading size (H1–H3), bullet colour, duplicate, zoom in, copy as markdown, mirror and more.
