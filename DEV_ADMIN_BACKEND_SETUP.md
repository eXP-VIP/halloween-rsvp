# DEV admin backend setup

The development page now contains admin-only User Management and Database Backup & Restore panels. These tools require the callable functions in `functions/index.js`. They are not active until these functions are deployed to the Firebase project.

## Before deployment

- Take a separate Firebase/Firestore backup first.
- Confirm the Firebase project is `the-dean-munich-halloween`.
- Use Node.js 22 and a recent Firebase CLI.
- Cloud Functions deployment generally requires the Firebase project to use the Blaze (pay-as-you-go) plan. Review the project billing and usage before deploying. See [Firebase's Cloud Functions setup guide](https://firebase.google.com/docs/functions/get-started) for current prerequisites.
- Do not put a service-account key or Admin SDK credentials in the web page. The Cloud Functions runtime uses its own service identity.
- The user-management functions authorize every operation by checking the signed-in caller's active `event_users/{uid}` record and requiring `role: "admin"`.

## Deploy the functions

From a local clone of this repository:

```sh
npm install -g firebase-tools
firebase login
cd functions
npm install
npm run check
cd ..
firebase deploy --only functions --project the-dean-munich-halloween
```

The callable functions are deployed in `europe-west1`. The development page uses that region.

The deployment in this guide does **not** publish `index-dev.html` to the live root page and does not deploy Firestore rules. No Firebase deployment has been performed by committing these files to GitHub.

## User Management behavior

- Usernames are mapped to Firebase Authentication identifiers like `ari@staff.partybag.com`; no real mailbox is required.
- Create, role/active updates, deletion and password changes run through the callable Admin SDK functions.
- The active Admin cannot change their own username/role or deactivate/delete their own account from this UI.
- Passwords are never written to Firestore and never included in backup files.
- A user backup contains role profiles but does not export Firebase Authentication identities or passwords.

## Database backup scope and restore warning

A downloaded JSON backup contains the top-level documents in these collections:

- `halloween_guests`
- `event_settings`
- `event_users`
- `welcome_drink_rewards` (legacy/retired collection, preserved for recovery)

Firestore timestamp values are tagged and restored as Firestore timestamps. Restoring a backup replaces these four top-level collections with the versions in the file; take a current backup first. It does not restore or delete Firebase Authentication identities, passwords, or nested subcollections. For a full production-grade Firestore backup strategy, use Firebase/Google Cloud managed export to Cloud Storage as well.

## Current status

The functions source and configuration are in GitHub but are not automatically deployed. Until deployment completes, the admin panels report that the secure backend is unavailable. No changes to the live HTML page are made by this dev-only iteration.
