# RSVP project maintenance guide

## 1. The DEV/PROD model (source of truth)

This project intentionally keeps the DEV and PROD pages as **two files on the same published branch**. That is the expected day-to-day workflow.

- `index.html` is PROD. It is the site's root page and must remain unchanged until the owner explicitly says **GO LIVE**.
- `index-dev.html` is DEV. It is available as a direct preview at `https://sign-up.partybag.com/index-dev.html` when the main-branch GitHub Pages site has published the latest commit.
- Work on the DEV page in `index-dev.html`; do not copy DEV into `index.html` or modify the production page as part of ordinary development.
- **GO LIVE** is an explicit release instruction. Then compare the current DEV page against PROD, review differences and deliberately promote the approved result. It is not implied by a successful test or a request to finish a task.
- The repository currently also has a Git branch named `dev` left over from an earlier workflow attempt. It is not the preview mechanism. Normal preview work should use the existing file-based pattern on `main` unless the owner explicitly asks to change it.
- Do not change GitHub Pages settings, DNS or Firebase deployment configuration as a side effect of a UI cleanup.

## 2. Source-of-truth map

| Path | Responsibility | Maintenance rule |
| --- | --- | --- |
| `index-dev.html` | DEV public RSVP page plus expanded staff/check-in/admin interface | Primary UI file for normal development. |
| `index.html` | PROD public RSVP page and legacy staff portal | **Frozen until GO LIVE.** The public-facing sections match DEV, but staff features and authentication differ. Never overwrite blindly. |
| `functions/index.js` | Privileged Firebase callable functions for staff accounts and database backup/restore | Every privileged action must enforce authorization server-side. Code changes are not deployed by a Git commit. |
| `functions/package.json` | Node.js 22 runtime, dependencies and `npm run check` | Run the syntax check before any backend promotion. |
| `firebase.json` | Cloud Functions deployment configuration | Does not configure static-site publishing or Firestore rule deployment. |
| `firestore.rules` | Firestore access-control rules in source control | Committing the file does **not** publish rules to Firebase. Rules apply project-wide; verify compatibility with PROD before publishing. |
| `AUTH_SETUP.md`, `DEV_ADMIN_BACKEND_SETUP.md` | Staff setup and backend deployment instructions | Keep documentation aligned with real configuration and deployment state. |
| `index2.html`, `index_fixed.html`, `index_improved.html`, `index_ready.html`, `index_ready_fixed.html`, `gemini-code-1791578349233.html` | Historical/alternate snapshots | Not source-of-truth files. Do not delete until usage and recovery value are checked. |

## 3. Architecture and trust boundaries

- The front end is a single HTML file with embedded CSS and JavaScript. It uses Tailwind CDN, Font Awesome, Google Fonts, SheetJS and Firebase 10.8.0 compatibility SDKs.
- The browser uses Firebase Authentication, Firestore real-time listeners and callable Cloud Functions in `europe-west1`.
- Staff usernames are mapped to synthetic email-shaped Firebase Auth identifiers in `@staff.partybag.com`. They are not mailboxes.
- Staff roles are stored in `event_users/{authUid}`. An Auth session is not trusted as a staff session until the matching profile exists, has `active: true`, and contains an allowed role.
- Hiding controls in the UI is not an authorization boundary. Firestore rules and callable functions must enforce every protected operation.
- Never put service-account credentials or Admin SDK secrets in browser code.

## 4. Critical business rules to preserve

### RSVP and guest data

- Public RSVP fields are guest **name** and optional **inviter** only.
- RSVP confirmation stays in-page so another guest can be registered without reloading.
- Anonymous visitors may create a constrained RSVP; they must not read, edit or delete the live guest list.
- Imported InterNations entries and public RSVPs can overlap. Normalize names and resolve duplicates consistently in import preview, live lists, referral calculations and print output.

### Roles and check-in workflow

- `admin`: guest-list administration, deletion/import, pricing/settings, staff account management, backups and restore.
- `hotel`: guest-list verification/check-in actions only.
- `internations`: payment, welcome-drink chip and referral operations.
- With two-step check-in enabled, Hotel verifies/checks in guests; InterNations handles payment and final admission. When disabled, the configured single-team workflow applies.
- UI visibility supports usability; Firestore rules must enforce the role boundary independently.

### Referral rewards, drinks and payments

- Referral status is mutually exclusive: insufficient referrals, referral qualification/payment pending, or earned referral drink.
- Registration alone does not qualify a referral. The minimum number of referred guests must check in and pay under the current event rules.
- Do not offer the referral-drink issue action before eligibility. If a chip was already issued, keep the undo action available for correction.
- Admission price, drink rules, referral threshold and check-in workflow are distinct settings. Keep calculation helpers centralized so cards, charges and admin controls agree.
- Payment changes can affect charge totals, reward qualification and chip availability. Refresh every dependent view after an update.

### Staff accounts and backups

- Role documents are keyed by Firebase Auth UID and are changed only by trusted admin operations, not browser writes.
- The signed-in Admin must not be able to accidentally rename, demote, deactivate or delete their own account through the management UI.
- JSON backup includes `halloween_guests`, `event_settings`, `event_users` and the retained legacy `welcome_drink_rewards` collection. Firebase Authentication users/passwords are not included.
- Restore replaces those collections. Preflight checks reduce risk, but multi-collection restore is not atomic. Take a fresh backup first; use managed Firestore exports for larger/critical restores.

## 5. Safe change and release workflow

1. Edit `index-dev.html` for DEV UI work. Leave `index.html` untouched.
2. Preview at `https://sign-up.partybag.com/index-dev.html`. If the browser serves a cached version, hard-refresh or add a cache-busting query parameter such as `?v=dev-check`.
3. Preserve IDs used by JavaScript, Firestore document paths, form fields, callable names and role checks unless the requirement explicitly changes them.
4. After backend code edits, run `cd functions && npm run check` (equivalent to `node --check index.js`).
5. Verify public RSVP, repeat registration, imported-name duplicates, each staff role, check-in sorting/search, two-step/single-team workflow, payment changes, referral badge exclusivity and chip gating.
6. Do not deploy Cloud Functions or publish Firestore rules just because source changed. Firebase deployments are separate from static HTML publishing.
7. Only after explicit **GO LIVE**, compare DEV to PROD, run the approved tests, and promote intentionally. Keep a record of exactly which files are promoted.

## 6. Known cleanup approach

- Keep operational panels visually consistent and put day-of-event check-in/payment workflow before less-frequently-used admin configuration.
- The page is still a large single-file application. Split CSS/JavaScript only after the hosting path is agreed and validated; a blind split can break local assets, routes, script ordering and inline handlers.
- Retire historical HTML snapshots only after confirming they are not used by a live URL or as a recovery reference.
- Prefer repeatable tests for pricing, referral qualification, chip gating, role permissions and backup validation before altering those business rules.
