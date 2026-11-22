# Punchly v18 test data

Use an empty browser profile or a private window so the test records stay separate from your own punches. If you want to test on a browser that already has records, export its backup first.

1. Open **Settings → Data & backups → Import backup** and select [Punchly_v18_test_backup.json](Punchly_v18_test_backup.json). Choose **Replace** in the test profile to load 23 daily records, two archived weekly reports, three drafts, and the **Nila Demo** profile with the Lagoon theme.
2. Import the same file with **Merge** to check for duplicates. The existing punches and profile should be kept.
3. Import [Punchly_v18_test_settings.json](Punchly_v18_test_settings.json) to switch to **Ravi Demo**, a sample profile photo, the Ocean theme, Inter, a 12-hour clock, and Compact mode. The shift data stays in place.

## Dates to check

| Date in 2026 | What to test |
| --- | --- |
| Jan 26, Aug 15, Oct 2 | Search **History → This year → Holidays** for Republic Day, Independence Day, and Gandhi Jayanti. Their names come from Punchly’s built-in holiday calendar. |
| Oct 3 and Nov 21 | Worked first and third Saturdays with the automatic notes. |
| Oct 17 and Nov 7 | Unworked third and first Saturdays in the attendance calendar. |
| Oct 29 | Saved incomplete shift with the evening punch missing. Use the **Incomplete shifts** filter. |
| Oct 30 and Nov 20 | Overnight lunches and next-day clock-out. Nov 20 has 8h 45m of net work and 35 minutes of lunch. |
| Oct 31 and Nov 21 | Open **View saved report** on the matching weekly record in History to see its archived schedule. |
| Nov 4 | Custom company holiday with a note. |
| Nov 5 and Nov 13 | Drafts with lunch still open and with all punches entered. Open them in **Today** to complete or save them. |
| Nov 6 and Nov 16 | Below-target and exactly-on-target shifts. Nov 16 also has a two-line note with quotes and an accented character. |
| Nov 10 and Nov 12 | A half day with a 4h 10m target and a full day with a custom 7h 30m target. |
| Nov 11 and Nov 19 | Leave records with searchable notes. |
| Nov 14 | No-lunch workday with an evening punch correction logged the next day. |
| Nov 17 | 65-minute lunch, 20 minutes of overtime, and a morning punch corrected the next day. Search for **Extended lunch** and open its **Change log**. |
| Nov 18 | Unpunched workday. Use **Unpunched dates** in History or check its calendar tile. |
| Nov 22 | Morning punch at 09:05 with lunch still pending. On Nov 22, **Punch** resumes at **Punch out for lunch** after import or refresh. On other dates, open this draft through **Dates** to see what was saved. A new shift started on the current date tests live resumption. |

## Test in the app

- **Punch, Today, and Week.** Record successive punches, reload after one of them, and check the ring’s planned ticks, recorded ticks, and estimated checkout. Try **Punch out without lunch** on a full-day shift. On a half day, the next action after the start should be checkout. Try a lunch-return punch without a lunch-out punch and check for the validation message. Use **Week → Edit** to check that it opens the selected date.
- **Stats and reports.** Use **This month** to isolate the sample month when testing in November 2026, or **All time** to review the historical data later. Switch between Bar graph, Line graph, Attendance pie chart, and Classic log. Export the sample records to PDF, PNG, Excel, and CSV. Check the profile name, version, timestamp, work dates, and change logs. In Excel, verify that the work dates sort as dates and that the **Change log** and **Export details** sheets are present.
- **Appearance and profile.** Switch between Lagoon, Ocean, and AMOLED Black at a phone-width viewport. Check the bottom dock and **More** menu, then toggle Compact mode and haptics on a supported phone. Try a preset avatar or choose the [countryside landscape](../assets/punch-countryside.jpg) and crop it as a local profile photo. Use **Delete profile** in the test profile and check that the shifts remain.
- **Live behavior.** Try **Alt + 1** through **Alt + 4** on desktop and open the mini timer during a running shift. In **Settings → Reminders**, set a punch reminder a minute ahead of your local time and mark today as a workday if needed. Keep Punchly open for the reminder. Start a short shift on a fresh test date to try the work-target alert. Check the launch screen, the countryside art at different local hours, **What’s New**, and the **?** help button. Preview optional device details in the support form.
- **Offline and recovery.** Serve the repo over localhost or use its HTTPS deployment to install the app. After the initial online load, reopen it offline and check the **Offline** label, retained punches, and artwork. In the test profile, try **Reset Punchly**, download a backup from the confirmation dialog, and restore that backup with **Replace**.
