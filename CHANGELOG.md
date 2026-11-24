# Punchly release notes

## v34

- Added custom start and end dates to Statistics. Both dates count, and the comparison uses the preceding period of the same length.
- Repaired the Project checks workflow so GitHub can run it after the Dependabot merges.

## v33

- Added immediate punch undo, including reopening an accidental checkout, and a short guard against double taps.
- Redesigned Statistics around full calendar periods with comparisons, an attendance breakdown, and work insights based on completed shifts. PNG charts use the same period aggregation. Dates marks unscheduled Sundays as holidays when they have no punches and shows a compact selected date on mobile.
- Added mini timer settings for always-on-top and opacity, shift status, an overtime counter, and a shortcut back to Punch. Always on top moves the open timer immediately.
- Kept desktop tabs visible while scrolling and limited mini timer controls to the desktop layout.
- Put profile and export details in the Excel Timesheet header and kept the optional Change log as its own sheet. Added a weekly backup reminder and typed and final confirmations before resetting Punchly.
- Limited What’s New to the latest five versions.

## v32

- Added a setup completion screen, safer profile-image limits, and more efficient history and calendar updates.
- Added reproducible release assets, dependency integrity checks, link checks, and a retained previous offline cache.

## v31

- Added backup validation, duplicate-date warnings, recovery diagnostics, quota handling, and the last backup export time.
- Added report round-trip and reminder tests, and changed theme previews to vector color strips.

## v30

- Added miniature theme previews, expanded About and privacy information, and a live mini timer countdown.
- Exports use saved profile details when available, label user notes, and include the version, export type, and date in filenames.

## v29

- Choose whether reports include change logs and recorded timestamps; full backups still retain them.
- Matched the Data & backups privacy reminder to the welcome screen.

## v28

- Streamlined mobile History records and added an invite shortcut to the header.

## v27

- Minimum lunch deduction is enabled by default and can be changed during setup.
- Updated the welcome screen and added an option to share the Punchly install link.

## v26

- Added an optional minimum lunch deduction for full days, including skipped lunch. Longer breaks deduct their full duration.
- Saved shifts retain their original lunch calculation, and spreadsheet exports include the deducted lunch time.

## v25

- New setups start in Compact mode, which keeps the Punch artwork.
- Removed the dial legends and added a disclosure arrow to Shift details.
- The offline setup step always shows an install button, with a hosted app fallback for local copies.

## v24

- First-time setup shows the Punchly title, offers offline installation first, identifies backups as `.json` files, and asks for confirmation before skipping.
- Choose full day, half day, leave, or holiday before the day’s first punch. The prompt also recognizes scheduled Saturday holidays.
- Sound effects are louder at the same volume setting.
- Punchly uses the Apache License 2.0.

## v23

- Added the UISFX `zen` pack for punch confirmations, saves, and other key actions. Appearance adds volume and optional typing sounds.

## v22

- Added a first-run welcome and guidance on local storage and backups.
- Light and dark themes are grouped. New themes include Champagne, Lavender, and Forest.
- A new profile can use the device model as its name when available.

## v21

- Tap the calendar heading to pick a year and month.
- Punch sounds vary by time of day. Change logs are displayed in History.

## Older releases

### v20

- Added first-time setup and made a 12-hour clock the default for new profiles.
- Added a single month and year picker. Compact Punch focuses on recorded times.

### v19

- Jump to any month in Dates, look ahead at holidays, and reserve leave in advance.
- Save employee details and review them before exporting. Compact mode has a tighter layout.
- Playpen Sans, Nunito, and Comic Neue are available offline.

### v18

- The Punch background shows a countryside landscape from sunrise to night.
- The mobile navigation bar and More menu follow the selected theme.

### v17

- National holidays and days marked Holiday get a festive scene.

### v14–v16

- The Punch dial marks planned and recorded punches and shows estimated checkout.
- India’s national holidays appear automatically with notes. Week shows a single editable time card.
- Punch icons show the next action, and backup icons indicate whether data is being exported or imported.

### Early version history

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
| v14 | The Punch dial showed planned and recorded punches as well as the estimated checkout. The archived notes cover the dial changes across v14–v16. | [Archived release notes](https://github.com/Arvind595/Punchly/blob/73164717076339aa4a8ed71ebfd0ac7b0f1345c5/index.html#L391-L396) |

[View the full commit history on GitHub](https://github.com/Arvind595/Punchly/commits/main/)
