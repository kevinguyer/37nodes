# Your data, backups and themes

Where your outline lives, and how to keep it safe.

## Where it is stored

Your outline is saved in this browser's built-in database (IndexedDB), on this device. Nothing is uploaded; the app makes no network requests at all.

Browsers can still clear site data under disk pressure, or when you clear it yourself. **An export is your real backup.**

## Export and import

- **☰ → Export JSON** writes everything, losslessly, including colours, stars and mirrors. This is the one to keep.
- **☰ → Export Markdown** writes the current view, or the whole outline, as plain nested text.
- **☰ → Import JSON…** reads a JSON export back in. To bring in plain text, paste it: indented or bulleted lines become items. `Ctrl+Shift+C` copies the item you are on, with everything under it, as markdown.

A gentle reminder appears when your last JSON export is more than 14 days old; you can change or turn it off in the menu.

## What an export does not contain

Your **saved searches**, theme, panel layout and other preferences belong to this browser, not to the outline, so they are not in an export and do not follow you to another browser. Everything in the outline itself is.

## Mirror to a file

In Chromium browsers (Chrome, Edge), **☰ → Mirror to a file on disk…** keeps a JSON file continuously up to date on every save: a live backup that survives cleared browser data. After a restart the browser may ask you to click **Resume** once.

## More than one tab

Opening the outline in two tabs at once raises a warning banner. The last save wins between tabs, so it is best to use one.

## Themes and layout

**☰ → View** has the themes: Nordic, Light, Dark, E-ink, Parchment, Evergreen, and three terminal tributes (green CRT, IBM 5151 sepia and Wyse 60 white phosphor, with glow and scanlines). **Wide layout** lets the outline follow the window instead of a fixed reading column.
