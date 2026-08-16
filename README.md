# Google Calendar Time Tracker Helper

A Chrome extension that turns Google Calendar into a lightweight time tracker.

**No account. No backend. No subscription. No tracking, analytics, or telemetry of any kind.**

## Why I built this

I'm a consultant, so I need to know where my hours actually went. But every time tracking tool I tried was either overkill, or another subscription, or just one more app I'd forget to open. I already live in Google Calendar and I was already blocking out my work there — I just didn't want to retype the same project names a dozen times a day, or do arithmetic on my own week.

So I built this. It's a small utility: one-click buttons for the projects I track, and a running weekly total in the GCal sidebar. That's it.

It started as a fun vibe coding project, and it turned out small enough to read end-to-end in a sitting — plus it transmits no data outside my own Chrome and Google account. So I figured I'd open-source it in case it's useful to someone else.

## Demo

<!-- TODO: embed the walkthrough video here.
     GitHub renders MP4/MOV uploaded directly to a release or issue — drag the file into any
     GitHub comment box, then paste the resulting URL on its own line below.
     For a YouTube video, use a linked thumbnail instead:
     [![Watch the walkthrough](https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg)](https://youtu.be/VIDEO_ID) -->

*A short video walkthrough is coming — check back shortly.*

<!-- TODO: add a screenshot or GIF of the quick-create pills and the sidebar summary -->

## Features

**Quick-create buttons.** Click any empty slot on your calendar and the usual event popup appears with a "Time tracking" row added at the bottom. Click a project button and it fills in the event title and switches the event to your time-tracking calendar. Then hit Save as normal.

**Weekly summary.** A "Time tracking summary" section in the left sidebar (just above Time Insights) totals up the hours per project for the events currently on the grid. Designed for week view. It refreshes as you navigate between weeks and can be collapsed.

**Project groups.** Projects can be organized into named groups (e.g. "Client Work", "Internal") which are reflected in both the popup and the sidebar summary. Groups are optional — with a single group, everything renders as one flat list.

## Install

This extension isn't on the Chrome Web Store. Install it unpacked:

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the **`src/`** folder inside the repository — not the repository root.

The extension will stay installed. Chrome shows a "Developer mode extensions" warning on startup, which you can dismiss.

## Setup

Open the extension's options page (via `chrome://extensions` → Details → Extension options, or the ↗ icon in the "Time tracking" row on the calendar popup).

**1. Set your time-tracking calendar.** Enter the exact name of the Google Calendar you want time-tracking events created on. This is case-sensitive and must match the name in your calendar sidebar exactly. If you don't have a dedicated calendar yet, create one in Google Calendar first.

**2. Add your projects.** Each project you add becomes a button. Whatever you type is used verbatim as the event title, so bracketed prefixes like `[Research]` work well — they make events easy to scan and let you append detail after the fact (`[Research] competitor pricing`) without breaking the totals.

Optionally group projects by adding a group first, then dragging projects into it. Projects not in a named group land in "Other".

## How matching works

Worth understanding, because it determines whether your totals are right:

- Only events on your configured calendar are counted. The calendar is identified by **name**, read from each event's screen-reader label.
- An event counts toward a project if its title **contains** the project string. Matching is **case-sensitive**.
- **First match wins**, in the order projects are listed in options. If you have both `[Research]` and `[Research] deep`, order matters.
- Matching events on your calendar that hit no project are grouped under **Uncategorized**.
- All-day and multi-day events are ignored. Only timed events count.

## Privacy

**There is no backend, no analytics, no telemetry, no tracking, and no account to create.** There is no network code in this extension at all — you can verify that yourself in about a minute. It's roughly 1,500 lines of vanilla JavaScript with no dependencies and no build step, and `src/` contains no `fetch`, no `XMLHttpRequest`, no `sendBeacon`, and no third-party scripts. Nothing is sent to me, because there is nowhere for it to be sent.

What the extension does touch:

- **It reads the Google Calendar page.** The content script reads the rendered calendar DOM — including your event titles — to compute the weekly totals. This happens locally in the page and is never transmitted anywhere.
- **It stores your settings in `chrome.storage.sync`.** That means your project names, group names, and calendar name sync across Chrome profiles signed into **your own** Google account, the same way your bookmarks do. They go to Google, not to me or to any third party. If you'd rather they didn't sync at all, change `chrome.storage.sync` to `chrome.storage.local` in `src/content.js` and `src/options.js`.
- **Permissions.** The extension requests only `storage`, plus host access limited to `https://calendar.google.com/*`. **It cannot see any other site you visit.**

## Limitations

This extension works by reading and manipulating Google Calendar's rendered DOM — there's no Google Calendar API involved, which is exactly what keeps it free of OAuth, backends, and setup. The tradeoff is that **Google reships that UI regularly, and when they do, this will break.** Expect that.

If it stops working after a Google Calendar update, please open an issue with what broke, or send a PR — the DOM selectors are concentrated in `src/content.js`.

Other known limits:

- If multiple calendars share the same name, the first match in the sidebar is used.
- The summary reflects what's rendered in the current view, so it's built for week view.
- Case-sensitive matching means `[research]` and `[Research]` are different projects.

## Project structure

```
src/
  manifest.json    Manifest V3 config
  content.js       Injected into calendar.google.com — popup buttons + sidebar summary
  content.css      Styles for the injected UI
  options.html     Settings page
  options.js       Settings page logic — calendar name, projects, groups, drag-and-drop
  options.css      Settings page styles
  background.js    Service worker (opens the options page)
docs/              Design specs and implementation plans
```

No build step. Edit files in `src/`, then hit the reload icon on `chrome://extensions`.

## Contributing

Issues and pull requests are welcome, especially fixes for Google Calendar DOM changes. There's no test suite — please describe what you tested manually.

## Support this project

This is free and always will be — there's nothing to subscribe to and no paid tier. If it saved you some time and you feel like saying thanks, you can buy me a coffee:

<a href="https://www.buymeacoffee.com/allenjhyang"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=allenjhyang&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="40"></a>

Entirely optional. Bug reports and PRs are worth just as much.

## License

[MIT](LICENSE)

---

Not affiliated with, endorsed by, or sponsored by Google. Google Calendar is a trademark of Google LLC.
