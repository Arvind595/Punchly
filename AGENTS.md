# Working on Punchly

Start with [the maintainer handoff](docs/HANDOFF.md) for the architecture, change history, and migration notes. The [README](README.md) describes the current user workflow. The [changelog](CHANGELOG.md) and Git history record past changes, including gaps in the early releases.

- Punchly is a static, local-first PWA. `index.html` loads ordered browser scripts from `js/`. The checked-in UISFX bundle is built from `src/ui-sounds.ts`.
- Use `js/shift.js` for shift calculations and `js/storage.js` for persisted records, settings, backup validation, and recovery. Preserve existing backups, local shift dates, and the saved lunch policy on completed shifts.
- Use a separate browser profile or origin for fixture imports, reset, and recovery testing. See [test data](test-data/README.md).
- With Node.js 24 or later, run `npm ci` when dependencies are missing, `npm test`, and `npm run typecheck`. Run `npm run build` when changing the sound bundle. The handoff lists browser checks by workflow.
- When releasing app changes, keep the release marker and asset query versions in `index.html` aligned with `RELEASE` in `service-worker.js`. Update the offline asset list when the required files change.
- Record user-visible changes in the [changelog](CHANGELOG.md). Update the [handoff](docs/HANDOFF.md) when a change affects architecture, compatibility, migration, or verification.
