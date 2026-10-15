# Staff login setup

The development page now presents a **username + password** login and reads the assigned role from `staff_users/{uid}`. It does not ask staff for an email address and has no password-reset email workflow.

Firebase's built-in Email/Password provider internally requires an email-shaped sign-in ID. The page maps a username such as `ari` to a fixed, synthetic alias such as `ari@staff.partybag.com`; this is an authentication identifier, not a mailbox. No messages are sent to it. Users always enter only their username and password on the page.

**This is not fully secured until `firestore.rules` is published in Firebase Console.** The file in GitHub does not change the active project's rules. Until the rules are published, the browser's role-based UI is not a security boundary; treat this as a login test only.

## Important before publishing Firestore rules

Firestore rules apply to the entire Firebase project, not just `index-dev.html`. The current public `index.html` still contains the old PIN-based staff login. **Do not publish `firestore.rules` until that live staff portal has also been migrated to Firebase Authentication**, or live staff access to the guest list will be denied. Public RSVP creation is explicitly allowed by these proposed rules and remains available.

## Firebase Console setup

Project: `the-dean-munich-halloween`

1. Open **Firebase Console → Authentication → Sign-in method** and enable **Email/Password**. The page itself accepts usernames only; do not enable public registration in the page.
2. In **Authentication → Settings → Authorized domains**, ensure the hosting domain `sign-up.partybag.com` is listed. Add `exp-vip.github.io` if you test via GitHub Pages.
3. Under **Authentication → Users**, create each staff user with the synthetic sign-in ID `<username>@staff.partybag.com` and a password. For example, a staff username of `ari` must be created with sign-in ID `ari@staff.partybag.com`. No real mailbox is required; the app never sends email to this alias.
4. Copy the Authentication user's **UID**. In **Firestore Database → Data**, create a `staff_users` document whose **document ID is exactly that UID**. Add these fields:
   - `username` — the lowercase username used on the login page (e.g. `ari`)
   - `active` — boolean `true`
   - `role` — string `admin`, `hotel`, or `internations`
5. Role records must be provisioned manually from the Firebase Console (or a trusted Admin SDK). The browser cannot create or edit roles. To revoke access, set `active` to `false` and disable/delete the Authentication user as appropriate.
6. There is no email-based password recovery. If a password is forgotten, an administrator must set a new password through a trusted Admin SDK/admin process; do not put service-account credentials into the website.
7. After the live staff portal has also been migrated, publish the content of `firestore.rules` under **Firestore Database → Rules**. Review and publish it there. This locks guest-list reads and updates to active staff accounts and roles.

## Roles

- `admin`: full guest-list access, imports, deletion, and pricing settings.
- `hotel`: guest-list read and check-in updates only. Check-in cannot be undone while paid, a welcome-drink chip is issued, or a drink upgrade is selected.
- `internations`: payment and drink-chip operations on checked-in guests, and reports unaccounted referrals for the administrator.

Anonymous website visitors can only create a new RSVP with the expected initial values. They cannot read, change, or delete guest records.

## Files

- `index-dev.html`: development staff portal with username/password sign-in mapped to a synthetic Firebase Auth alias.
- `firestore.rules`: proposed project-wide Firestore security rules. Committing the file does not deploy it.
- Username alias format: `<username>@staff.partybag.com` (internal Firebase Auth ID only, not an inbox).
- `index.html`: still has the previous PIN portal. It must be migrated before rules are published.
