# Punchly

Punchly is a private time tracker for daily punches, weekly hours, and monthly attendance. It runs in your browser with no account.

[Open Punchly](https://arvind595.github.io/Punchly/) · [What’s new](CHANGELOG.md) · [Version history](#version-history) · [Maintainer handoff](docs/HANDOFF.md) · [Apache License 2.0](LICENSE)

## How to use

### Set up Punchly

- Choose **Get started** on the welcome screen. The eight steps cover offline installation, importing a `.json` backup, clock format, theme, profile, daily work target, lunch limit, and notification permissions.
- Choose **Install Punchly** to open your browser’s install prompt or see the browser menu instructions. From a local HTML file, the button opens the hosted app in a new tab. You can continue setup in the browser and install later from **Settings → Install & shortcuts**.
- Confirm **Skip setup** to keep the defaults or your imported preferences. You can configure the app manually in **Settings**. If you leave the display name blank, Punchly uses the available device model or a general device label.

### Record a shift

1. Open **Punch** and tap the dial. Before the day’s first punch, choose **Full day** or **Half day** and confirm to punch in. Choose **Leave**, **Holiday**, or a scheduled Saturday holiday to save the day without a punch.
2. Return to the dial for each remaining punch. Full days use morning in, lunch out, lunch return, and evening out. Use **Punch out without lunch** if you skipped your break. Half days use two punches and half the daily work target. Each punch saves locally, and the final punch saves the shift to **History**. Choose **Undo** within 12 seconds to reverse a punch, including checkout.
3. Open **Today** to enter or correct punches, change the day type, or edit notes. The work target excludes lunch. The lunch limit defaults to 45 minutes and drives the checkout estimate and long-break warning. For overnight work, use the shift’s start date. Punch can resume an unfinished overnight shift.
4. On desktop, **Alt + 1** through **Alt + 4** enter punches. The desktop mini timer shows elapsed work, estimated checkout, and a live countdown or overtime counter in the selected theme. Desktop Settings has controls for opacity and an always-on-top window on browsers with Document Picture-in-Picture support.

### Review attendance and export

- **Week** shows shifts and drafts from Monday. Use **Edit** on an entry or **Log** on an empty date.
- **Dates** shows a monthly attendance calendar. Tap the month heading, choose a year, and then choose a month. You can look ahead at holidays and reserve, update, or cancel future leave. Punchly marks unscheduled Sundays without punches, the first and third Saturdays, and the built-in national holidays. Working on a scheduled Saturday adds a note automatically.
- **History** can search dates and notes and filter leave, holidays, incomplete shifts, overtime, long lunches, and unpunched dates. Expand a record’s **Change log** to see when punches or other details were entered or edited. **Stats** shows worked-hour charts, an attendance breakdown, previous-period comparisons, and work insights. Choose **Custom dates**, enter **From** and **To**, and select **Apply dates** to review an exact period.
- **Export** offers PDF timesheets, PNG charts, Excel, and CSV. Reports include the export time, app version, and saved profile details. If the profile has no name or uses an automatic device name, Punchly asks for a name and saves it for later exports. Filenames include the app version, export type, and local date. The **Include change logs** checkbox controls change history and recorded timestamps in reports; PNG stores them in image metadata. Excel uses native date cells and, when enabled, a separate **Change log** sheet. Full backups always include change logs.

### Customize Punchly

- **Appearance** includes light and dark themes with vector color previews, thirteen fonts, Compact mode, mobile haptics, and in-app sound. New setups start in Compact mode with the Punch artwork visible. Use **Show shift details** in Today to expand the form. Audio defaults to 70%, and typing sounds are optional.
- **Profile** stores your display name, employee ID, employee email, role, department, and avatar or cropped local photo.
- **Tracking defaults** controls the daily target, lunch limit, workdays, clock format, and default date range. By default, full days require a minimum lunch deduction: a shorter or skipped lunch deducts the configured limit, while a longer lunch deducts its full duration. You can turn this option off in setup or settings. Half days are unaffected. Existing completed shifts retain their saved calculation; the setting applies to current unfinished and new shifts. While a shift is in progress, the unused portion of the minimum is reserved from worked time. **Reminders** can prompt you to punch or tell you when you meet the target while Punchly is open. Device alerts require browser permission.
- Open **?** for help or use **Settings → Developer & Support** to report an issue, request a feature, or share the Punchly install link. Device details are optional in the email draft.

## Data and backups

Punchly stores records and settings in this browser. They stay on this device unless you export and transfer a backup. Clearing browser data can remove them.

- **Settings → Data & backups → Export backup** saves records, drafts, change logs, and preferences in a `.json` file. Punchly shows a weekly reminder in the open app when there are records to back up.
- The last backup timestamp records when the browser started the download; check your downloads to confirm the file was saved. If damaged data or an interrupted import is detected, **Data & backups** offers recovery diagnostics and a download of the original stored data.
- **Export settings** saves your preferences and profile without shift records. **Import backup** reads either kind of Punchly file. For a full backup, **Merge** adds entries and **Replace** restores the backup’s data and preferences.
- Imports validate the backup and flag duplicate attendance dates. Merge keeps existing dates; Replace creates a temporary recovery copy before changing data. An import cannot proceed if the browser cannot store that recovery copy.
- **Delete profile** removes saved profile details and its picture. **Reset Punchly** clears the app’s local data after you type `CONFIRM` and choose **Yes, reset**. Both actions offer a backup before confirmation.

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
npm run release:sync
npm run links:check
```

Set the app version in [`release.json`](release.json) and run `npm run release:sync`. This updates the HTML and service worker, adds content hashes to script and stylesheet URLs, and generates [`deployment-manifest.json`](deployment-manifest.json). The release check also verifies the vendored SheetJS checksum and the background image size limits. SheetJS executes on the first Excel export. The service worker caches its file during installation so Excel is available offline.

The project checks verify the build and local links on each push and pull request. They also generate a changelog artifact from Git commits. Use `npm run release:notes -- <tag-or-commit>` to select the start of the release notes. External links are checked on the scheduled workflow and can also be checked with `npm run links:check -- --external`.

Each successful push to `main` archives the checked site files in GitHub Actions. Record the Git commit that passes the hosted app smoke test for each Pages deployment. To roll back, republish that run's `punchly-site-<commit>` artifact or build the same commit if the artifact has expired. The service worker retains the preceding offline cache and continues serving its active release if a new deployment is incomplete.

## Version history

The first beta and alpha commits carry no version numbers, and several later versions have no separate Git snapshot. This history covers v0–v14 using the version markers, notes, and features recorded in the repository.

| Version | Changes | Record |
| --- | --- | --- |
| v0–v3 | The early builds went from a standalone Time Card Calculator with daily punch, weekly report, and monthly record tools to the first Punchly `index.html` with a four-punch tracker, charts, and exports. Individual version numbers for these builds are unverified. | [Initial beta](https://github.com/Arvind595/Punchly/commit/1c851ac05ef48843cc4b067696916c4963023a89), [first alpha](https://github.com/Arvind595/Punchly/commit/fce2952d35a18085f786951d59e5ff59ab1f0186) |
| v4 | Brought daily and weekly tracking into `index.html`. Added half-day and leave or holiday logging, JSON backups, reminders, compact and AMOLED settings, and offline installation. | [Alpha 2](https://github.com/Arvind595/Punchly/commit/6f08ba65687b1ca3aa093c5012f47e7f52d361b8) |
| v5 | Improved startup recovery and offline updates. Added developer and support details in Settings. | [v5 commit](https://github.com/Arvind595/Punchly/commit/9a318f36e03ab80b8f610c201f4612f91efc11cd) |
| v6 | Streamlined the mobile Today view, weekly report controls, and collapsible Settings sections. | [v6 commit](https://github.com/Arvind595/Punchly/commit/1f2e5364ad153f5e4d5549e427852424386fb1ce) |
| v7 | Added a weekly time card populated from daily shifts, a seven-day Quick Log, and overnight clock-out handling. | [v7 commit](https://github.com/Arvind595/Punchly/commit/bee0e32a785969795c2d36915fdde5e503c1db55) |
| v8 | Added the monthly attendance calendar, record search, leave and holiday totals, mobile haptics, and the desktop mini timer. | [v8 commit](https://github.com/Arvind595/Punchly/commit/791a90f82a3da134db4a05d143c7fae5cde0b4ba) |
| v9–v10 | By v10, Punch could save one punch at a time and resume the shift later. History gained record filters, Stats and Export became separate tabs, and the first and third Saturdays became scheduled holidays. | [v10 snapshot](https://github.com/Arvind595/Punchly/commit/ffc86462836439fcc1faee5b19b71ac55158a9dc) |
| v11 | The v12 guide identifies v11 as the start of recording when punches and edits were made. The surviving v12 code includes the change log and export timestamps. | [Historical guide](https://github.com/Arvind595/Punchly/blob/c9ff67159f10b34eb5105abee0b07f901485a5ce/README.md#record-a-shift) |
| v12 | Added illustrated avatars, profile photo cropping, profile deletion and app reset with a backup option, settings export, and in-app help. | [v12 commit](https://github.com/Arvind595/Punchly/commit/c9ff67159f10b34eb5105abee0b07f901485a5ce) |
| v13 | Individual changes for this version are unverified in the surviving history. | [Commit history](https://github.com/Arvind595/Punchly/commits/main/) |
| v14 | The Punch dial showed planned and recorded punches as well as the estimated checkout. The archived notes cover the dial changes across v14–v16. | [Archived release notes](CHANGELOG.md#older-releases) |

See [What’s new](CHANGELOG.md) for later releases.

## License

Punchly is distributed under the [Apache License 2.0](LICENSE).

- [SheetJS Community Edition](vendor/SheetJS-LICENSE.txt) and [Google Material Symbols](assets/Material-Symbols-LICENSE.txt) use Apache 2.0.
- The UISFX runtime uses the [MIT license](vendor/UISFX-LICENSE.txt), and the sound library is [CC0](vendor/UISFX-LICENSE-AUDIO.txt).
- [Inter](assets/fonts/Inter-OFL.txt), [Manrope](assets/fonts/Manrope-OFL.txt), [Playpen Sans](assets/fonts/PlaypenSans-OFL.txt), [Nunito](assets/fonts/Nunito-OFL.txt), and [Comic Neue](assets/fonts/ComicNeue-OFL.txt) use the SIL Open Font License. [Satoshi](https://www.fontshare.com/fonts/satoshi) loads from Fontshare when selected.
