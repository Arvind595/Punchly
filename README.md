# Punchly

Punchly is a browser-based time tracker and weekly time-card calculator. It uses no account or backend; your records remain in the browser's local storage unless you export a backup.

## Features

- A Today view that shows net work, the target clock-out time, and extra time as it accrues. Pick today or an earlier date for the start of a shift. An overnight clock-out can fall on the next day.
- Full day shifts deduct the entire recorded lunch break. The lunch limit defaults to 45 minutes and drives the pre-lunch estimate and over-limit indicator.
- Half day shifts use a start and end punch and half the full day target, rounded up to the next minute if needed. Leave and holidays can be saved with notes without adding work hours.
- Weekly time cards show daily shifts entered since Monday, including drafts. Today’s Quick log shows the last seven days. The Week tab also offers a separate manual report with break deductions, rounding, and printing.
- Local persistence for current punches and weekly drafts. Daily and weekly history can be loaded, edited, or deleted.
- Weekly, monthly, yearly, or all-time history filters, colored daily bars, and a 7-day rolling average over logged workdays.
- Filtered CSV and Excel exports, chart PNG, browser print, and full JSON backup and restore. Excel uses sortable date cells.
- Settings with AMOLED Black, ten app fonts, five profile icons, tracking defaults, and Compact mode. New profiles start with the light theme, Manrope, and Monday through Saturday as workdays.
- Reminders for individual punches and the work target while Punchly is open. Device alerts need permission and a browser that supports them.
- Mobile bottom navigation, touch-friendly forms, keyboard-accessible tabs, and offline PWA support when served from localhost or HTTPS. Press Alt + 1 through Alt + 4 to enter the four punches.
- Automatic import of weekly records saved by the former `Punchly.html` app.

## Run locally

No build step or package install is required. For PWA/offline support, serve the folder over localhost:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly also runs the app, but service-worker installation is unavailable from a `file:` URL.

## Data and privacy

Punches, settings, weekly drafts, and history are stored in this browser profile. Clearing site data removes them. Open **Settings → Data & backups** to export a portable JSON file. When restoring, choose **Merge** to add new records and drafts or **Replace** to restore the backup's records, drafts, and preferences. Browser storage is not synced between devices.

When opening the app on the same browser origin, records from the previous weekly calculator's `timecard_calculator_history_v1` storage key are imported into History automatically.

## Deployment

Publish the repository root on GitHub Pages or another static host. `index.html` is the entry point. Serve `service-worker.js` from the same directory and allow the web manifest for offline support. To install, use **Settings → Install & shortcuts** or your browser's Install or Add to Home Screen menu. Open the app online once so it can cache its files.

When releasing changes to the app shell, update the release marker and asset query versions in `index.html` together with `RELEASE` in `service-worker.js`. Online navigation checks for fresh HTML, and the offline cache keeps a complete copy of a single release.

## License

GNU General Public License v3.0; see [LICENSE](LICENSE).

Bundled [Inter](assets/fonts/Inter-OFL.txt) and [Manrope](assets/fonts/Manrope-OFL.txt) fonts use the SIL Open Font License. [SheetJS Community Edition](vendor/SheetJS-LICENSE.txt) is distributed under Apache 2.0. Selecting [Satoshi](https://www.fontshare.com/fonts/satoshi) loads it from Fontshare. Inter and system fonts provide a fallback when Satoshi is unavailable.
