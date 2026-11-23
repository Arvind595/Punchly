# Punchly

Punchly is a private time tracker for daily punches, weekly hours, and monthly attendance. It runs in your browser with no account.

[Open Punchly](https://arvind595.github.io/Punchly/) · [What’s new](CHANGELOG.md) · [Apache License 2.0](LICENSE)

## How to use

### Set up Punchly

- Choose **Get started** on the welcome screen. The eight steps cover offline installation, importing a `.json` backup, clock format, theme, profile, daily work target, lunch limit, and notification permissions.
- Choose **Install Punchly** to open your browser’s install prompt or see the browser menu instructions. From a local HTML file, the button opens the hosted app in a new tab. You can continue setup in the browser and install later from **Settings → Install & shortcuts**.
- Confirm **Skip setup** to keep the defaults or your imported preferences. You can configure the app manually in **Settings**. If you leave the display name blank, Punchly uses the available device model or a general device label.

### Record a shift

1. Open **Punch** and tap the dial. Before the day’s first punch, choose **Full day** or **Half day** and confirm to punch in. Choose **Leave**, **Holiday**, or a scheduled Saturday holiday to save the day without a punch.
2. Return to the dial for each remaining punch. Full days use morning in, lunch out, lunch return, and evening out. Use **Punch out without lunch** if you skipped your break. Half days use two punches and half the daily work target. Each punch saves locally, and the final punch saves the shift to **History**.
3. Open **Today** to enter or correct punches, change the day type, or edit notes. The work target excludes lunch. The lunch limit defaults to 45 minutes and drives the checkout estimate and long-break warning. For overnight work, use the shift’s start date. Punch can resume an unfinished overnight shift.
4. On desktop, **Alt + 1** through **Alt + 4** enter punches. The desktop mini timer shows elapsed work and estimated checkout. A separate always-on-top window is available in browsers that support Document Picture-in-Picture.

### Review attendance and export

- **Week** shows shifts and drafts from Monday. Use **Edit** on an entry or **Log** on an empty date.
- **Dates** shows a monthly attendance calendar. Tap the month heading, choose a year, and then choose a month. You can look ahead at holidays and reserve, update, or cancel future leave. Punchly marks the first and third Saturdays, plus Republic Day, Independence Day, and Gandhi Jayanti. Working on a scheduled Saturday adds a note automatically.
- **History** can search dates and notes and filter leave, holidays, incomplete shifts, overtime, long lunches, and unpunched dates. Expand a record’s **Change log** to see when punches or other details were entered or edited. **Stats** offers bars, lines, an attendance pie chart, and a classic log.
- **Export** offers PDF timesheets, PNG charts, Excel, and CSV. Reports include the export time, app version, and profile details you review before downloading. The **Include change logs** checkbox controls change history and recorded timestamps in reports; PNG stores them in image metadata. Excel uses native date cells and, when enabled, a separate **Change log** sheet. Full backups always include change logs.

### Customize Punchly

- **Appearance** includes light and dark themes, thirteen fonts, Compact mode, mobile haptics, and in-app sound. New setups start in Compact mode with the Punch artwork visible. Use **Show shift details** in Today to expand the form. Audio defaults to 70%, and typing sounds are optional.
- **Profile** stores your display name, employee ID, employee email, role, department, and avatar or cropped local photo.
- **Tracking defaults** controls the daily target, lunch limit, workdays, clock format, and default date range. By default, full days require a minimum lunch deduction: a shorter or skipped lunch deducts the configured limit, while a longer lunch deducts its full duration. You can turn this option off in setup or settings. Half days are unaffected. Existing completed shifts retain their saved calculation; the setting applies to current unfinished and new shifts. While a shift is in progress, the unused portion of the minimum is reserved from worked time. **Reminders** can prompt you to punch or tell you when you meet the target while Punchly is open. Device alerts require browser permission.
- Open **?** for help or use **Settings → Developer & Support** to report an issue, request a feature, or share the Punchly install link. Device details are optional in the email draft.

## Data and backups

Punchly stores records and settings in this browser. They stay on this device unless you export and transfer a backup. Clearing browser data can remove them.

- **Settings → Data & backups → Export backup** saves records, drafts, change logs, and preferences in a `.json` file. Export backups regularly.
- **Export settings** saves your preferences and profile without shift records. **Import backup** reads either kind of Punchly file. For a full backup, **Merge** adds entries and **Replace** restores the backup’s data and preferences.
- **Delete profile** removes saved profile details and its picture. **Reset Punchly** clears the app’s local data. Both actions offer a backup before confirmation.

## Run and build

Serve the repository root for PWA and offline support.

```sh
python -m http.server 8000
```

Open [localhost:8000](http://localhost:8000), or open `index.html` directly for a browser-only session. The PWA requires HTTPS or localhost and one successful online visit to cache its files.

The browser bundle is checked in so GitHub Pages can serve the repository root directly. To change or verify the sound bundle, use Node.js 24 or later.

```sh
npm ci
npm run format
npm run typecheck
npm test
npm run build
```

When releasing updates, change the release marker and asset query versions in `index.html` and `RELEASE` in `service-worker.js` together. Add new offline dependencies to the service worker’s asset list.

## License

Punchly is distributed under the [Apache License 2.0](LICENSE).

- [SheetJS Community Edition](vendor/SheetJS-LICENSE.txt) and [Google Material Symbols](assets/Material-Symbols-LICENSE.txt) use Apache 2.0.
- The UISFX runtime uses the [MIT license](vendor/UISFX-LICENSE.txt), and the sound library is [CC0](vendor/UISFX-LICENSE-AUDIO.txt).
- [Inter](assets/fonts/Inter-OFL.txt), [Manrope](assets/fonts/Manrope-OFL.txt), [Playpen Sans](assets/fonts/PlaypenSans-OFL.txt), [Nunito](assets/fonts/Nunito-OFL.txt), and [Comic Neue](assets/fonts/ComicNeue-OFL.txt) use the SIL Open Font License. [Satoshi](https://www.fontshare.com/fonts/satoshi) loads from Fontshare when selected.
