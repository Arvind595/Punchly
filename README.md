# Punchly

Punchly is a browser-based time tracker and weekly time-card calculator. It uses no account or backend; your records remain in the browser's local storage unless you export a backup.

## Features

- Punch opens first and guides you through one punch at a time. Each punch is saved locally, so reloading or returning later resumes the next step. The final punch saves the shift to History.
- Countryside Punch backgrounds follow local time and switch to a festive illustration on holidays. The mobile navigation bar follows the selected theme. See **Settings → What’s New** for recent changes.
- A Today view that shows net work, the target clock-out time, and extra time as it accrues. Pick today or an earlier date for the start of a shift. An overnight clock-out can fall on the next day.
- Full day shifts deduct the entire recorded lunch break. The lunch limit defaults to 45 minutes and drives the pre-lunch estimate and over-limit indicator.
- Half day shifts use a start and end punch and half the full day target, rounded up to the next minute if needed. Leave and holidays can be saved with notes without adding work hours.
- Weekly time cards show daily shifts since Monday, including drafts. Edit an existing entry or log a new shift from the time card.
- Daily punches and drafts are stored locally. Previously saved weekly reports are available in History and exports.
- India’s national holidays recur automatically each year. Republic Day is January 26, Independence Day is August 15, and Gandhi Jayanti is October 2. The app adds the holiday name to the day’s notes. [Government of India holiday calendar](https://www.iirs.gov.in/holidaycalender/)
- The attendance calendar distinguishes completed shifts, unpunched dates, leave, holidays, half days, and each regular Saturday holiday. The first and third Saturdays are holidays unless you enter punches. Working either date adds a note to the shift automatically.
- History supports date or notes search plus filters for leave, holidays, incomplete shifts, overtime, long lunches, and unpunched dates. Statistics offers bars, lines, an attendance pie chart, and a classic log.
- The Export tab downloads PDF timesheets, PNG charts, Excel, and CSV on mobile and desktop. Excel uses sortable date cells. JSON backup and restore are available in Settings.
- Settings with AMOLED Black, thirteen app fonts, five illustrated profile avatars, tracking defaults, and Compact mode. New profiles start with the light theme, Manrope, and Monday through Saturday as workdays.
- Reminders for individual punches and the work target while Punchly is open. Device alerts need permission and a browser that supports them.
- Mobile bottom navigation, touch-friendly forms, keyboard-accessible tabs, and offline PWA support when served from localhost or HTTPS. Press Alt + 1 through Alt + 4 to enter the four punches.
- Mobile tap feedback is enabled by default on supported devices and can be disabled in Appearance. The desktop mini timer stays above other windows when Document Picture-in-Picture is supported, and floats inside Punchly otherwise.
- Automatic import of weekly records saved by the former `Punchly.html` app.

## How to use

### Record a shift

1. Open **Punch** and tap the center of the dial to record the next step. The button color follows the device’s local time, and its icon shows the next punch action. The ring moves clockwise from morning in. Dotted outer ticks mark the planned punches, solid ticks mark the recorded punches, and the dashed inner tick shows estimated checkout. The plan starts at your first punch and places the configured lunch break halfway through the work target. The checkout estimate adjusts as you record your break.
2. Each punch saves immediately to this browser. Open Punchly again to continue where you left off. The last punch saves the shift to **History**. Use **Punch out without lunch** if you skipped your break.
3. Use **Today** to enter or correct a time, edit a note, change the work target, set **Half day**, or mark **Leave** or **Holiday**. Choose **Save** to finish editing. For overnight work, use the start date and enter the clock-out time as it appears the next morning. Punch resumes an unfinished shift expected to cross midnight.
4. Open **Change log** in Today, Week, Dates, or History to see when changes were recorded. A punch value is the shift time you enter. The log records the actual date and time you entered or edited that value. Records created before v11 show timestamps for changes made since the upgrade.

### Review and export

- **Week** shows shifts since Monday. Use **Edit** on an existing entry or **Log** on an empty day.
- **Dates** shows a monthly calendar. Select a month and year and choose **Go** to jump there, or use **Today** to return to the current month. Future dates show scheduled holidays, and you can reserve, update, or cancel leave on a future date. Reserved leave is included in backups and counts toward attendance when the date arrives. The first and third Saturdays show as scheduled holidays until you log work. If you worked on a national holiday, choose **Full day** or **Half day** in **Today** before entering punches. The holiday name stays in the notes.
- **History** can search dates and notes or filter for leave, holidays, incomplete shifts, overtime, long lunches, and missing punches. **Stats** has bar, line, pie, and log views.
- In **Export**, choose a range or use the current History filters. The export prompt lets you review the profile name, employee ID, email, role, and department included in PDF, Excel, CSV, and PNG reports and full JSON backups. Edits in the prompt apply to that file. Reports also include the app version and export timestamp. PDF displays the change log, Excel includes a separate **Change log** sheet, and CSV includes punch-recording timestamps and a JSON change-log column. The PNG chart stores the structured change log in an embedded `Punchly Export` text field. Machine-readable timestamps are in UTC.

### Customize and get help

- Open **Settings → Profile** to set a name, employee ID, work email, role, and department. Pick an illustrated avatar or choose a local photo. Adjust zoom and position, then choose **Use photo** to save a square crop displayed as a circle.
- **Delete profile** in **Settings → Profile** removes your name, employee details, and picture while keeping shift records and tracking preferences. **Reset Punchly** under **Settings → Data & backups** erases local punches, drafts, reports, profile, and preferences. Both actions offer a backup before confirmation. To restore everything later, import that backup with **Replace**.
- **Settings → Data & backups → Export settings** downloads a JSON file containing your preferences and cropped photo, without the shift history. Use **Import backup** to apply that settings file on another device. Use **Export backup** for a complete copy of your records, drafts, and preferences.
- The launch screen loads the profile saved in this browser and shows the update check. A slow update check continues in the background. Punchly checks again when you come back on a new day or tap the refresh icon beside your profile. **Offline** means the server could not be reached. Your cached Punchly app and saved punches remain available offline after the first successful online visit.
- Tap **?** in the header for a short guide. To send feedback, use **Settings → Developer & Support**. Choose **Report an issue** or **Request a feature**, describe what you encountered, and open the email draft. You can preview and include browser version, viewport, and device model where available. The draft is yours to review and send.

## Run locally

No build step or package install is required. For PWA/offline support, serve the folder over localhost:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly also runs the app, but service-worker installation is unavailable from a `file:` URL.

## Data and privacy

Punches, settings, weekly drafts, and history are stored in this browser profile. Clearing site data removes them. Open **Settings → Data & backups** to export a portable JSON file. When restoring, choose **Merge** to add new records and drafts or **Replace** to restore the backup's records, drafts, and preferences. Browser storage is not synced between devices.

The change log and cropped profile photo are stored locally and travel with the corresponding backups. Review reports before sharing them, as a change log can include earlier versions of notes. Device details are only added to an email draft when you opt in.

When opening the app on the same browser origin, records from the previous weekly calculator's `timecard_calculator_history_v1` storage key are imported into History automatically.

## Deployment

Publish the repository root on GitHub Pages or another static host. `index.html` is the entry point. Serve `service-worker.js` from the same directory and allow the web manifest for offline support. To install, use **Settings → Install & shortcuts** or your browser's Install or Add to Home Screen menu. Open the app online once so it can cache its files.

When releasing changes to the app shell, update the release marker and asset query versions in `index.html` together with `RELEASE` in `service-worker.js`. Include new scripts in the service worker's asset list. Online navigation checks for fresh HTML, and the offline cache keeps a complete copy of a single release.

## License

GNU General Public License v3.0; see [LICENSE](LICENSE).

Bundled [Inter](assets/fonts/Inter-OFL.txt) and [Manrope](assets/fonts/Manrope-OFL.txt) fonts use the SIL Open Font License. [SheetJS Community Edition](vendor/SheetJS-LICENSE.txt) is distributed under Apache 2.0. Selecting [Satoshi](https://www.fontshare.com/fonts/satoshi) loads it from Fontshare. Inter and system fonts provide a fallback when Satoshi is unavailable.

[Playpen Sans](assets/fonts/PlaypenSans-OFL.txt), [Nunito](assets/fonts/Nunito-OFL.txt), and [Comic Neue](assets/fonts/ComicNeue-OFL.txt) are bundled in WOFF format under the SIL Open Font License.

Rounded [Material Symbols](https://fonts.google.com/icons) by Google are bundled under the [Apache 2.0 license](assets/Material-Symbols-LICENSE.txt). Profile avatars are original Punchly illustrations.
