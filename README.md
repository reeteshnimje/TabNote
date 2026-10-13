# 📌 TabNote

> Know why every tab is open — at a glance, right from the tab strip.

TabNote is a Chrome extension (Manifest V3) that lets you attach a short note to any open tab — why you opened it, what's pending, what to do next. The note shows up in the tab itself and when you hover over it, and every closed tab keeps its note in a 14-day archive.

## Why

The browser is where work happens, but Chrome has no native concept of tasks. Every tab is opened with an intent, yet the only memory Chrome keeps of that intent is the page title — which is rarely enough. Multiply that by a dozen parallel tabs and you get the familiar 15-minutes-later moment: *why did I open this?*

Tab Groups answer "what category is this?" — not "why is this open?". TabNote answers the second question.

## How it works

| Moment | What TabNote does |
| --- | --- |
| **Capture** | Click the extension icon (or a keyboard shortcut) on any tab and jot a one-line note: *why did you open this tab?* |
| **Recall** | The note is written into the tab's title — glanceable in the tab strip, and visible in full in the native tooltip when you hover the tab. |
| **Triage** | A dashboard table lists every open tab across windows — title, note, domain, opened-at — so it doubles as your actual task list. |
| **Archive** | When a tab closes, its note moves to a 14-day archive. "What was that article I closed yesterday?" is now searchable. |

## Features

- One-line note per tab, captured in ~5 seconds (popup or keyboard shortcut)
- Note surfaced in the tab strip and in Chrome's native tab tooltip
- Central dashboard: open tabs + 14-day archive, with search and one-click "focus tab"
- Humanized timestamps ("opened 12 minutes ago")
- Notes survive Chrome restarts (re-linked by URL; orphans are preserved in the archive)
- 100% local — no account, no sync, no analytics

## Usage

- **Note a tab:** click the TabNote icon (or press the shortcut) → type why you opened it → `Enter`. The tab's title now carries the note.
- **Recall:** hover any tab — Chrome's native tooltip shows the full title, note included.
- **Dashboard:** click *Open dashboard* in the popup to see every open tab across windows (search, "unannotated only" filter, one-click *Focus*) plus the 14-day archive of closed tabs.
- **Shortcut:** `Ctrl+Shift+Y` (Windows/Linux) / `Cmd+Shift+Y` (Mac) — editable at `chrome://extensions/shortcuts`.
- **First note on a tab:** pages opened *before* installing the extension show the note in the dashboard immediately; the title prefix appears after you reload that page.

## Privacy

- Notes are stored in `chrome.storage.local`, on your machine. Nothing is transmitted, ever.
- Incognito windows are ignored.
- Archive entries auto-purge after 14 days.
- Permissions used: `tabs` (read titles/URLs of your tabs), `storage`, `alarms` (archive cleanup), plus a content script that writes the note into the page title. Nothing else.

## Install (from source)

1. Clone or download this repo
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the repo folder

## Tech

Vanilla HTML/CSS/JS on Chrome's Manifest V3 — no frameworks, no build step, no dependencies.

## Roadmap

- [ ] Note suggestions drafted from page content (you confirm before saving)
- [ ] Duplicate-tab detection ("this is already open with a note")
- [ ] Side panel mode for a persistent list
- [ ] CSV export of the archive

## Development

Load the repo as an unpacked extension (see *Install*) and reload from `chrome://extensions` after edits. Icons are generated pixel-by-pixel with a zero-dependency script:

```
node tools/gen-icons.js
```

<!-- TODO: add screenshots (popup composer, dashboard, annotated tab strip) -->

## License

[MIT](LICENSE)