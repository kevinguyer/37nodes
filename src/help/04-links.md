# Links, backlinks and mirrors

Connect items to each other, and show one item in several places.

## Links

Type `[[` in a title or note and pick an item from the list; `Enter` or `Tab` inserts its exact title. The link jumps to that item when clicked.

Links are matched by **title**, ignoring case. If two items share a title the link goes to the first one in document order. A link whose target does not exist is shown as broken until an item with that title appears.

To see only what an item is connected to, press `Alt+L` on it: the outline narrows to the item, everything that links to it, and everything it links to. Press it again to go back.

If you rename an item that others link to, 37nodes offers to update those links, so they do not quietly stop working.

## Backlinks

The [info panel](#help/panel) lists every item that links to the one you are on, from titles and notes alike. Click a row to go there. With **Hide completed** on, completed sources are not listed, since there would be nothing to jump to.

## Mirrors

A **mirror** is a live view of an item shown somewhere else. Edit it in either place and both change, because there is only one item. Completing it, formatting it and its notes all follow.

- Type `((` in an empty item and pick the original from the list, or use **Mirror this item** in the ≡ menu.
- To show an item somewhere else without moving it, press `Alt+Shift+M` (or **Mirror to…** in the ≡ menu) and pick the destination by name. The original stays where it is; a mirror appears as the last item inside the one you pick.
- The mirror's *position* and its collapsed state are its own, so you can fold it away in one place and not the other.
- An item that has mirrors shows a **filled diamond** for its bullet, and each mirror shows a **hollow diamond**, so you can tell the original from its reflections at a glance. The info panel's "Mirrored in" list shows every place an item appears.
- Deleting the original does not lose the content: the first mirror is promoted to hold it.
