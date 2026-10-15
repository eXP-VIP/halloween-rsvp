# Staff login setup

The development page now signs staff in with Firebase Authentication and reads the staff role from `staff_users/{uid}`. The shared PIN and browser-stored role selector have been removed.

## Important before publishing Firestore rules

Firestore rules apply to the entire Firebase project, not just `index-dev.html`. The current public `index.html` still contains the old PIN-based staff login. **Do not publish `firestore.rules` until that live staff portal has also been migrated to Firebase Authentication**, or live staff access to the guest list will be denied. Public RSVP creation is explicitly allowed by these proposed rules and remains available.

## Firebase Console setup

Project: `the-dean-munich-halloween`

1. Open **Firebase Console → Authentication → Sign-in method** and enable **Email/Password**. Public user registration is not provided by the page; staff accounts are created by the administrator only.
2. Open **Authentication → Settings → Authorized domains** and ensure `sign-up.partybag.com` is listed. Add `exp-vip.github.io` too if you test via the GitHub Pages URL.
3. Under **Authentication → Users**, choose **Add user** for each staff member. Create individual accounts and send temporary credentials privately. Staff can use the password-reset link on the login screen.
4. Copy each user's **UID**. In **Firestore Database → Data**, create a collection named `staff_users`. For each user, create a document whose **document ID is exactly that UID**. Add these fields:
   - `active` — boolean `true`
   - `role` — string `admin`, `hotel`, or `internations`
   - `email` — string, for reference (optional)
5. Role records must be provisioned manually from the Firebase Console (or a trusted Admin SDK). The browser cannot create or edit role records. To disable access, set `active` to `false` and disable/delete the Authentication user as appropriate.
6. After the live staff portal has also been migrated, publish the content of `firestore.rules` under **Firestore Database → Rules**. Review and publish it there. This locks guest-list reads and updates to active staff accounts and roles.

## Roles

- `admin`: full guest-list access, imports, deletion, and pricing settings.
- `hotel`: guest-list read and check-in updates only. Check-in cannot be undone while paid, a welcome-drink chip is issued, or a drink upgrade is selected.
- `internations`: payment and drink-chip operations on checked-in guests, plus unregistered referral drink-chip records.

Anonymous website visitors can only create a new RSVP with the expected initial values. They cannot read, change, or delete guest records.

## Files

- `index-dev.html`: development staff portal with email/password sign-in.
- `firestore.rules`: proposed project-wide Firestore security rules. Committing the file does not deploy it.
- `index.html`: still has the previous PIN portal. It must be migrated before rules are published.
