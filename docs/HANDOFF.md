# Punchly maintainer handoff

This guide describes the app through v33. Start from the code in your checkout if the app version has moved on. Use the [README](../README.md#how-to-use) for the user workflow and the [changelog](../CHANGELOG.md) for release details.

## Runtime and entry points

Punchly is a static time tracker and attendance PWA hosted on [GitHub Pages](https://arvind595.github.io/Punchly/). It runs without an account, server API, or database. Punches, preferences, profiles, and change logs live in the browser. Reports and backups are generated on the device.

[`index.html`](../index.html) contains the views and dialogs and loads the browser scripts in dependency order. Most of the code is plain JavaScript in classic scripts with named module objects such as `Shift`, `Storage`, and `Audit`. [`js/app.js`](../js/app.js) connects the modules on `DOMContentLoaded`, owns navigation and view state, and refreshes views when dates, settings, or records change. [`css/style.css`](../css/style.css) contains layout, theme variables, and responsive rules. Opening the file directly runs the app. Serve it over localhost or HTTPS to test installation, offline caching, and browser permissions.

| Area | Files and entry points |
| --- | --- |
| Navigation and layout | [`index.html`](../index.html), [`js/app.js`](../js/app.js), [`css/style.css`](../css/style.css). Hashes select tabs. The desktop header and tabs stay visible on scroll. The mobile layout has bottom navigation and a More menu. Compact mode keeps the Punch artwork and reduces secondary details. |
| Punch, Today, and Week | [`js/guided-punch.js`](../js/guided-punch.js) chooses and renders the next punch and draws the dial. [`js/app.js`](../js/app.js) handles the first-punch dialog, manual entry, shortcuts, drafts, and saving. [`js/shift.js`](../js/shift.js) calculates work, breaks, overtime, and checkout. Week reads the same daily entries as Today. |
| Dates, History, and Stats | [`js/attendance.js`](../js/attendance.js) owns the Dates tab. [`js/app.js`](../js/app.js) connects History and Statistics to the daily entries. [`js/statistics.js`](../js/statistics.js) classifies dates, calculates metrics, and groups data for [`js/charts.js`](../js/charts.js), including PNG export. |
| Data and audit | [`js/storage.js`](../js/storage.js) normalizes stored data, migrates legacy weekly reports, and owns writes, validation, backups, and recovery. [`js/audit.js`](../js/audit.js) records changes and formats their timestamps. |
| Export and restore UI | [`js/export.js`](../js/export.js) handles report formatting, profile metadata, downloads, and import dialogs. Excel uses the local [SheetJS bundle](../vendor/xlsx-0.20.3.mini.js), loaded when needed. |
| Setup and preferences | [`js/setup.js`](../js/setup.js) handles the welcome screen, eight steps, skip confirmation, and automatic device names. [`js/settings.js`](../js/settings.js) applies appearance and stores profile, tracking, and reminder settings. |
| App tools | [`js/app-tools.js`](../js/app-tools.js) handles startup and update checks, confirmation dialogs, profile photo cropping, reset, the install-link invite, and help and support. [`js/icons.js`](../js/icons.js) renders bundled Material Symbols. |
| Timer, reminders, and sound | [`js/mini-timer.js`](../js/mini-timer.js) updates the desktop timer every second and uses Document Picture-in-Picture where supported, with an in-app fallback. [`js/reminders.js`](../js/reminders.js) checks scheduled punches and the work target while Punchly is open. [`src/ui-sounds.ts`](../src/ui-sounds.ts) is the source of [`vendor/punchly-sounds.js`](../vendor/punchly-sounds.js). |
| Install and offline | [`manifest.webmanifest`](../manifest.webmanifest) configures standalone launch. [`service-worker.js`](../service-worker.js) owns the versioned app cache. The install button in [`js/app.js`](../js/app.js) uses the browser prompt when available and opens the hosted app when the user is running a local file. |

## How a shift becomes a record

1. **Punch** reads today's draft and saved record. If today has no punches, it can resume an unfinished shift from yesterday whose target extends beyond midnight. The first punch of a new day opens the day-type dialog. It uses the same flow for the dial, Today, and the morning shortcut. Canceling the dialog leaves the first punch unrecorded.
2. A full day can record start, lunch out, lunch return, and end. A half day uses start and end with half the full target rounded up to the minute. Leave and holidays can be saved without punches. Calendar rules identify the first and third Saturdays and India's Republic Day, Independence Day, and Gandhi Jayanti. Worked scheduled Saturdays get an automatic note. The calendar supports future leave reservations, while punch entry uses today or an earlier shift start date.
3. `saveDayDraft` in [`js/app.js`](../js/app.js) saves partial punches and edits by date and records changes through `Audit.track`. Returning to the app reloads the draft. Guided checkout or **Save shift** writes a record through `Storage.saveRecord`. A daily record is updated by date. The app still reads legacy weekly reports in History and exports.
4. `Shift.measure` uses minutes relative to the shift's start date. A punch earlier on the clock than the previous punch rolls into the next day. It rejects a shift of 24 hours or more and a work segment above 18 hours. Calendar keys are local `YYYY-MM-DD` dates and punches are `HH:MM` strings. Audit timestamps are UTC ISO strings because they record when someone entered or changed a value, which can be a different date.
5. The standard target is 8h 20m and excludes lunch. New profiles default to a 45-minute minimum lunch deduction for full days. With the option enabled, the deduction is the larger of the configured minimum and recorded lunch. A skipped lunch still deducts the minimum, and live totals reserve any unused portion. Half days have no lunch deduction. `lunchPolicy` in [`js/app.js`](../js/app.js) reads the saved policy for completed records. Older completed records without the option retain their original rule. New and unfinished shifts use current preferences.
6. Guided punches and Today’s Now buttons share a 600 ms tap guard. The Undo toast lasts 12 seconds and restores the previous draft and saved record for that date when they still match the results of the last punch. Undoing checkout reopens the shift and restores its prior audit history.

## Statistics

Weeks start Monday. Week and month charts use calendar days, year charts use months, and all-time charts switch from months to years when history spans more than 24 months. Previous periods use the same elapsed portion, capped at the previous period’s end. Future dates are excluded from metrics. The attendance breakdown counts full and half days separately, and both contribute to worked hours and averages. Target achievement and overtime require a positive target. Unfinished or invalid punches are marked incomplete. Leave and holidays have their own states. A Sunday without punches counts as a holiday unless Sunday is a configured workday. Empty dates on configured workdays count as no punch and other empty dates count as days off. Week rankings sum completed work inside the selected period. Use **Dates** to browse the attendance calendar and open a shift in Today.

## Preferences and browser features

- **First run.** Setup begins with a welcome, then installation, backup import, time format, theme, profile, daily target, lunch, and notifications. Skip requires confirmation. A successful save opens **You’re all set!** and **Start using Punchly** dismisses the wizard. Storage checks for existing data or pending recovery before opening the wizard. A blank name can use a device model or fallback label marked with `profileNameSource: 'device'`. Current defaults include a 12-hour clock, the light Periwinkle theme, Manrope, Compact mode, and Monday through Saturday as workdays.
- **Appearance.** The theme definitions, fonts, device theme matching, and profile rendering live in [`js/settings.js`](../js/settings.js). Keep mobile navigation colors tied to the theme variables. Compact mode keeps the countryside or holiday artwork. The Punch dial has its ticks without a separate legend. Mobile haptics default to on and use browser support for vibration. Profile pictures are cropped locally and saved as a bounded JPEG data URL.
- **Reminders and audio.** Reminder checks run from the open app and use stored deduplication keys. Punchly shows in-app banners and can send device notifications when the browser grants permission. Sound uses one client-side UISFX `zen` player after a trusted gesture, with event cues for committed actions. The persisted volume defaults to 70%, per-cue gain is applied separately, and typing sounds are opt-in. A loading cue can play while Excel is preparing and is stopped on completion, failure, navigation, mute, or teardown. Preserve the visible and accessible feedback when touching either path.
- **Mini timer.** Desktop Settings stores the always-on-top preference and timer opacity. The Always on top checkbox applies immediately. Re-enabling it requests the floating window during the checkbox gesture, while disabling it returns the open timer to the app. The floating window uses Document Picture-in-Picture when available and the in-app panel otherwise. Opacity applies to the timer content. The timer follows the theme and lunch policy, and clicking it focuses the app and opens Punch.
- **External actions.** The main hostname is used for the install and invite flows. The support form builds an email draft and includes device details only when selected. Satoshi is loaded from Fontshare if selected. The core app assets and the other bundled fonts work offline after caching.

## Data, backups, and recovery

| Item | Current contract |
| --- | --- |
| History and drafts | `punchly_history` is the saved records array. `punchly_daily_drafts` maps local dates to editable day state. `punchly_today_state` and `punchly_week_state` support older state and backup payloads. |
| Settings and legacy import | `punchly_settings` includes appearance, tracking, reminders, and profile details. The original `timecard_calculator_history_v1` weekly records migrate on the same origin, with a marker to avoid repeating the import. |
| Full backup | `format: 'punchly-backup'`, `version: 1`, with `settings`, `today`, `drafts`, `week`, and `history`. Records have a `kind` of `daily` or `weekly`. Full backups retain change logs. |
| Settings export | `format: 'punchly-settings'`, `version: 1`, with `settings` and export metadata. Applying it updates preferences without importing shifts. |
| Recovery export | `format: 'punchly-recovery'`, `version: 1`, with raw stored strings. **Data & backups** can download this when data is damaged and can restore an interrupted import from the saved recovery copy. This file can contain private data. |

Full restore validates dates, time formats, record structure, audit entries, and duplicate daily dates or IDs before any record writes. **Merge** keeps existing daily dates, weekly IDs, drafts, and preferences when they overlap. **Replace** restores the backup's contents and preferences. Both full restore modes create a temporary recovery snapshot before writes. Storage failures trigger rollback, and a recovery copy remains available if rollback fails. The diagnostics path preserves unreadable or invalid stored values for recovery and ordinary writes refuse to overwrite known damaged data. Keep recovery conditions visible if changing import or storage.

`js/export.js` reports a successful import through `punchly:backup-imported` or `punchly:settings-imported`. `js/app.js` uses those events and `punchly:profile-updated` to reload the affected view state. Storage diagnostics and cross-tab storage events keep recovery indicators and relevant views current.

Report formats are PDF, PNG, Excel, and CSV. **Export** can use a date range or **History search and filters**. The **Include change logs** checkbox controls report disclosure, including recorded timestamps and PNG metadata. A full JSON backup always retains the audit log. Exports include profile, release, and time metadata. A blank or automatic device name prompts for a name and saves it for later reports. The Excel Timesheet puts profile and export details above its filterable records and writes native date cells. A separate **Change log** sheet appears only when enabled.

The backup reminder appears in the open app when there is data to back up and neither a backup nor a reminder has occurred in seven days. The last backup time means the browser started a download, so verify the file itself before clearing a profile or moving hosts. **Reset Punchly** requires typing `CONFIRM` and then choosing **Yes, reset**. The first step still offers a backup download.

## Migrating the app or its data

1. Export a full JSON backup from the old app or browser and verify the file is present. If normal export is blocked by damaged storage, download recovery data first and keep the original browser data available.
2. Import the backup into an isolated profile on the destination. Browser data is scoped by origin. Moving to another hostname, protocol, port, or browser profile requires a transfer. A path change on the same origin can change the service worker scope while still sharing the same storage.
3. Compare daily and weekly record counts, drafts, recent audit entries, and profile settings. Check a completed overnight shift and a record saved before the minimum lunch policy. Verify the original totals and the ability to keep punching an unfinished shift.
4. Preserve parsers and defaults for earlier backups if replacing the UI or framework. [`test-data/`](../test-data/README.md) has older full and settings fixtures. The [demo backup](../Punchly_demo_backup.json) is also synthetic. Keep the JSON format version distinct from the displayed app release.

## Development and release checks

Install dependencies with Node.js 24 or later and `npm ci`. Run `npm test` for the Node regression suite and `npm run typecheck` for the TypeScript sound source. `npm run build` regenerates the checked-in sound bundle. The browser app is otherwise served directly from the repository root. Local serving instructions are in the [README](../README.md#run-and-build).

| Change | Where to verify |
| --- | --- |
| Shift math, lunch policy, or countdown | [Lunch policy tests](../tests/lunch-policy.test.mjs), [mini timer tests](../tests/mini-timer.test.mjs). Check full, half, skipped and extended lunch, and overnight shifts. |
| Statistics and Undo | [Statistics tests](../tests/statistics.test.mjs) and [storage recovery tests](../tests/storage-recovery.test.mjs). Inspect a month with more than 14 shifts, tap a chart bar, open a shift from Dates, and undo a guided checkout. |
| Storage, restore, or report fields | [Storage recovery tests](../tests/storage-recovery.test.mjs), [export round-trip tests](../tests/export-roundtrip.test.mjs), [change-log export tests](../tests/export-change-logs.test.mjs). Try Merge and Replace with the sample backups in a disposable profile. |
| Setup, sharing, reminders, or sound | [Setup and invite tests](../tests/setup-invite.test.mjs), [reminder tests](../tests/reminders.test.mjs), [UISFX tests](../tests/ui-sounds.test.mjs). Check gesture unlock, mute, and returning to an existing draft. |
| Layout or PWA | Use desktop and a narrow mobile viewport. Check the Punch artwork, Today disclosure, bottom dock, date picker, and a fresh setup. Serve over localhost or HTTPS, load once online, then reload offline and verify that assets and punches are available. |

For an app release, set the version in [`release.json`](../release.json) and run `npm run release:sync`. This updates the HTML release marker and hash-based asset URLs, the service worker cache and offline asset list, and [`deployment-manifest.json`](../deployment-manifest.json). Run `npm run release:check` and `npm run links:check` before publishing. The worker checks the HTML release before caching and retains the preceding cache after activation. Startup and manual refresh checks read the release marker from the server. Update **What’s New** and the changelog for user-facing notes. GitHub Actions also generates notes from Git history and archives the checked site for each push to `main`. See the [README](../README.md#run-and-build) for rollback.

## Where to trace changes

Use the [early release table](../CHANGELOG.md#early-version-history) for v0–v14. It links to preserved snapshots and notes where there is no separate record of an individual version. Use the [full changelog](../CHANGELOG.md) and [Git commit history](https://github.com/Arvind595/Punchly/commits/main/) for chronology. A single commit sometimes contains several numbered app releases.

| Period | Milestones and implementation history |
| --- | --- |
| Early beta through v8 | The standalone time card evolved into the static app with daily drafts, settings and PWA support, mobile layout, weekly logs, overnight shifts, calendar, and mini timer. [v4 integration](https://github.com/Arvind595/Punchly/commit/6f08ba6), [overnight shifts](https://github.com/Arvind595/Punchly/commit/bee0e32), [attendance and timer](https://github.com/Arvind595/Punchly/commit/791a90f) |
| v9–v18 | Added one-at-a-time guided punching, reporting views, change tracking and profile tools, punch dial markers, national holidays, launch artwork, and a simpler Week tab. [Guided Punch](https://github.com/Arvind595/Punchly/commit/ffc8646), [profile and audit](https://github.com/Arvind595/Punchly/commit/c9ff671), [Punch and Week refresh](https://github.com/Arvind595/Punchly/commit/7316471) |
| v19–v25 | Added future leave reservations, employee export details, setup and the month picker, UI sounds, first-punch day type, Apache 2.0 licensing, and the default Compact layout. [Leave and exports](https://github.com/Arvind595/Punchly/commit/5e1b98c), [setup, picker, and audio](https://github.com/Arvind595/Punchly/commit/3a430e7), [onboarding and Compact mode](https://github.com/Arvind595/Punchly/commit/8d5b2fc) |
| v26–v31 | Added the minimum lunch policy, export privacy controls, sharing, countdown, vector theme previews, backup validation, recovery, and more regression coverage. [Lunch and export controls](https://github.com/Arvind595/Punchly/commit/4192dfe), [backup and export resilience](https://github.com/Arvind595/Punchly/commit/c9c0992) |
| Documentation | Published the v0–v14 table in the [README](../README.md#version-history) and [changelog](../CHANGELOG.md#early-version-history). [README commit](https://github.com/Arvind595/Punchly/commit/5538330), [changelog commit](https://github.com/Arvind595/Punchly/commit/db77940) |

To inspect the exact implementation history for a part of the app, use Git's path filter and then open the relevant commit.

```sh
git log --oneline -- index.html js/shift.js js/storage.js
git show <commit>
```
