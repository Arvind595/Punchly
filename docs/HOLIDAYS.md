# Punchly holiday calendar

Edit [config/holidays.json](../config/holidays.json) to publish the calendar. Add a separate entry under `years` for each year. Keep prior years in the file for historical views and exports.

```json
{
  "schemaVersion": 1,
  "years": {
    "2027": {
      "approval": { "by": "Example calendar owner", "date": "2026-11-25" },
      "holidays": [{ "date": "2027-01-26", "name": "Republic Day" }],
      "optionalLeaves": [{ "date": "2027-03-24", "name": "Example regional observance" }]
    }
  }
}
```

Use actual approved dates and names. The dates shown above illustrate the format. Keep `approval` as `null` until the year’s list has been approved. Once approved, enter the approver and approval date. Holiday and optional-leave dates must belong to that year. The same date can appear only once. `holidays` is the full holiday list for a configured year, including any national dates it observes. A year without an entry uses Punchly’s three built-in national dates.

Listed holidays mark unworked dates as holidays. Optional leave appears on the calendar as a choice and becomes actual leave only when a user marks or reserves leave. Recorded punches and worked hours stay on the shift. A completed shift on a listed holiday is labeled **Worked on holiday** in History.

After pushing the file, GitHub Pages publishes it with the app. A holiday-only edit needs no app version bump. Run `npm test` to validate the file before publishing. On the hosted app or localhost, Punchly checks for updates on open, every 15 minutes while visible, when back online, and on manual refresh. It keeps the last valid calendar available offline.

To export the year, open **Dates**, navigate to any month in that year, then choose **Download [year] holiday calendar (PNG)**. The image lists holiday dates, optional leaves, the approver, and the approval date. A missing approval is shown as **Approval not recorded**.
