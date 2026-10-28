# UAT checklist — v0.11.0

User acceptance testing for everything in **UAT** on the status board (`docs/ROADMAP.md`).
Work through each section on **staging**; tick what behaves as expected and write a note
for anything that doesn't. A section that passes moves to **Done** on the status board; a
failure becomes a fix.

Tester: ____________ Date: ____________ Phone / browser: ____________

## Before you start

- **Run the app against staging.** In the project folder: `npm run dev -- --host`. Open the
  `Local` address on the Mac, or the `Network` address on a phone on the same Wi‑Fi.
- **Logins.** Use staging test numbers (Supabase → Authentication → Phone → test numbers;
  each has a fixed OTP). Several sections need **two devices**: a second phone, or a second
  browser on the Mac (Chrome + a Chrome incognito window count as two devices).
- **Roles.** You need one **admin** and one other member (**treasurer** or **collector**) in
  the same club. Add the second number as a member from Settings → Members.
- **Language.** Bengali is the default. Settings → Preferences → Language switches to
  English if that's easier; labels below are given in English.
- **SQL editor.** Some steps run SQL in the Supabase dashboard of the **staging** project
  (SQL Editor → New query). Those calls are logged as `dashboard` in `ops.audit_log`.
- **Offline.** On a phone: airplane mode. On the Mac: Chrome DevTools → Network → *Offline*.

## Summary

| # | Item | Result | Notes |
|---|---|---|---|
| 1 | Promises | ☐ Pass ☐ Fail | |
| 2 | App control (maintenance, update, announcement) | ☐ Pass ☐ Fail | |
| 3 | Events: edit, delete, new cards | ☐ Pass ☐ Fail | |
| 4 | Install app button | ☐ Pass ☐ Fail | |
| 5 | Offline saving and the sync strip | ☐ Pass ☐ Fail | |
| 6 | Removed devices cut off | ☐ Pass ☐ Fail | |
| 7 | Sync failure reports | ☐ Pass ☐ Fail | |
| 8 | Error reporting (Sentry) | ☐ Pass ☐ Fail | |
| 9 | Staff access and audit log | ☐ Pass ☐ Fail | |
| 10 | Support functions | ☐ Pass ☐ Fail | |
| 11 | Usage figures | ☐ Pass ☐ Fail | |
| 12 | Settings → Help | ☐ Pass ☐ Fail | |

---

## 1. Promises (record now, pay later)

As any member, in a real (non-sample) club.

- [ ] Chanda → collect for a household → choose **Promise** (next to Cash and UPI), enter
      ₹1,000, tap **Save promise**. A "promise recorded" message shows; **no receipt and no
      receipt number** are created.
- [ ] The household shows **Promised** in the register; the register's **Promised** filter
      lists it.
- [ ] Collect ₹400 cash for the same household (normal **Save & make receipt**). The
      household now shows **Part paid** with ₹400 paid and **Balance due** ₹600. The receipt
      number is the next one in sequence (no gap from the promise).
- [ ] Collect the remaining ₹600: the household shows **Paid**.
- [ ] Accounts shows **Promised, still due** with the right amount before the last payment.
- [ ] As **treasurer or admin**: open a promise → **Cancel promise**. It disappears from the
      Promised filter. As a **collector**, the cancel option is not offered.

## 2. App control (maintenance, minimum version, announcement)

In the staging SQL editor, then reload the app (it reads the setting in the background on
every open; reload once or twice).

- [ ] **Announcement:**
      `update app_config set announcement_bn = 'পরীক্ষামূলক ঘোষণা', announcement_en = 'Test announcement';`
      Reload: the notice shows. Close it (✕): it stays closed after another reload.
- [ ] **Maintenance:**
      `update app_config set maintenance = true, maintenance_message_en = 'Back at 6 pm';`
      Reload: "Maintenance in progress" shows with the message. Record a chanda: it saves on
      the phone and waits; nothing is sent.
- [ ] `update app_config set maintenance = false;` Reload: the notice goes and the waiting
      chanda syncs.
- [ ] **Minimum version:** `update app_config set min_version = '0.12.0';` Reload: "A newer
      version of the app is needed. Your entries are safe on this phone." with **Update now**;
      syncing stops.
- [ ] **Reset everything:**
      `update app_config set min_version = '0.0.0', maintenance = false, announcement_bn = null, announcement_en = null;`
      Reload: no notices, syncing works.

## 3. Events: edit, delete, new cards

Two devices: admin on one, a non-admin member on the other.

- [ ] Events: each card shows a calendar tile (month band, large day), the weekday, a
      countdown chip (today highlighted) and a **Share** button. Finished events look muted
      with no buttons. There is no Register button or tally (switched off for now).
- [ ] As **admin**: the card's ⋮ menu → **Edit event**; change the name and date → saved,
      "Event updated".
- [ ] As **admin**: ⋮ → **Delete** → the confirmation names the event → confirm → "Event
      deleted".
- [ ] On the **non-admin** device: there is no ⋮ menu. After a sync (reopen the app), the
      edit shows and the deleted event is gone.

## 4. Install app button

Needs HTTPS, so test on the published site (or staging over HTTPS), not the Wi‑Fi address.

- [ ] **Android Chrome:** the login screen and Settings show **Install app**. Tapping it
      opens Chrome's install dialog; after installing, the button disappears.
- [ ] **iPhone Safari:** tapping it explains Share → *Add to Home Screen*.
- [ ] Opened from the home-screen icon, the button is not shown.

## 5. Offline saving and the sync strip

- [ ] Go offline. Collect a chanda → **Save & make receipt**: it saves at once (no endless
      spinner) and the receipt opens.
- [ ] The strip under the header shows the offline notice plus "1 waiting to sync".
- [ ] Go back online: the strip shows "sending…", then the count clears. If it doesn't clear
      on its own, **Sync now** sends it.

## 6. Removed devices are cut off

Same number logged in on two devices (A and B).

- [ ] On A: Settings → **Devices** lists both. On B's row tap **Remove** → confirm.
- [ ] On B: reopen the app → it signs out (after sending anything it still had).
- [ ] Log B back in: it works again (if 3 devices are already in use, it asks you to remove
      one first).

## 7. Sync failure reports (`client_events`)

Makes the server refuse an entry, then checks the report reached the server.
Device A: admin. Device B: the **treasurer**.

- [ ] Put B offline. On B record an **expense**.
- [ ] On A (online): Settings → Members → the treasurer → change the role to **collector**.
- [ ] Bring B online. The expense fails: the strip shows it as not synced; **See why** shows
      the reason (not allowed).
- [ ] In the SQL editor:
      `select created_at, error_key, entity_type, app_version from client_events order by created_at desc limit 5;`
      shows a row with `err_forbidden`, `expense`. No names or amounts appear.
- [ ] Afterwards, change the member back to treasurer.

## 8. Error reporting (Sentry)

Only production builds report, and only with `VITE_SENTRY_DSN` set (it is in `.env`).

- [ ] Build and run a production copy locally:
      `NITRO_PRESET=node-server npx vite build && PORT=5300 node .output/server/index.mjs`,
      then open `http://localhost:5300`.
- [ ] In the browser console run `setTimeout(() => { throw new Error("UAT test") })`.
- [ ] Within a minute or two Sentry (project `pujo-khata`) shows "UAT test" under
      environment `local`, tagged with release `pujo-khata@0.11.0`. The event has no phone
      numbers, amounts or Bengali text.

## 9. Staff access and audit log

In the staging SQL editor.

- [ ] `select ops_whoami();` → `{"role": "owner", "actor": "dashboard"}`.
- [ ] `select * from ops.staff;` → you, as `owner`.
- [ ] `select at, actor_kind, action, target from ops.audit_log order by at desc limit 10;`
      shows the calls you just made.
- [ ] `delete from ops.audit_log;` → refused with "append-only" (the log can't be erased).

## 10. Support functions

In the staging SQL editor. Use a real staging club and test number.

- [ ] `select ops_find_club('<part of the club name>');` → the club and its id.
- [ ] `select ops_find_person('<test number>');` → clubs, roles, devices, last login.
- [ ] `select ops_club_health('<club id>');` → totals, members per role, 14 days of activity,
      devices, and `sync_failures_7d` (the report from section 7 appears here).
- [ ] `select ops_club_entries('<club id>', '');` → refused (a reason is required);
      `select ops_club_entries('<club id>', 'UAT: checking entries', 10);` → latest entries.
- [ ] `select ops_reset_collect_device('<test number>', 'UAT: new phone');` → on that phone,
      reopen the app (it checks in on open): collecting now asks to choose the collect device.
- [ ] The audit log shows each call; phone numbers appear masked (`xxxxxx1234`), and the
      reasons are saved.

## 11. Usage figures

In the staging SQL editor.

- [ ] `select * from ops.usage_totals;` → the counts look right for staging (clubs, members
      per role, households, entries, amount collected).
- [ ] `select * from ops.usage_daily order by day desc limit 7;` → today's row counts what
      you entered during this UAT.
- [ ] `select ops_usage(7);` → both together; no names or phone numbers anywhere.

## 12. Settings → Help

As a member logged in by phone, in a real club.

- [ ] Settings → **Help** shows **Report a problem**. (In the sample club it asks you to log
      in by phone instead.)
- [ ] Tap it → the form opens; the phone's back button closes it.
- [ ] Tap **Send** with nothing filled → both errors show (problem type, message).
- [ ] Choose **Sync**, write a message, leave **Include device details** on → **Send** →
      "Request sent"; it appears under **Your requests** as **Open**.
- [ ] Offline: send another → "Will be sent when you're online"; it shows **Waiting to send**,
      then **Open** after going online.
- [ ] In the SQL editor: `select ops_tickets();` lists both, with phone, club and device
      details.
- [ ] `select ops_close_ticket('<id>', 'UAT: fixed, thanks');` → in the app (reopen Settings)
      the request shows **Closed** with the reply.

---

## After UAT

- Reset anything you changed in `app_config` (section 2, last step).
- Send the summary table (with notes) back: passes move to **Done** on the status board,
  failures become fixes in the next patch release (v0.11.1).
