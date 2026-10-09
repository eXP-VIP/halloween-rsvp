# Automatic WhatsApp notifications for The Dean After Dark

The website continues to submit registrations to Formspree and Firestore during the trial. A Firestore create trigger sends a notification to Ari after each guest record is created. **Do not disable Formspree until a real WhatsApp message containing guest details has been received and the guest is visible in Firestore.**

## What this uses

- Meta WhatsApp Business Platform Cloud API, not a `wa.me` link.
- Firebase Cloud Functions (2nd gen) in `europe-west1`.
- Google Secret Manager for the Meta access token.
- The existing Firestore collection `halloween_guests`.

A Cloud API/business sender number is required. Ari's number (`+49 176 8111 7359`) is the recipient of the alert; it is not automatically the sender number. Start with Meta's test sender if available, and add Ari's number as an allowed test recipient.

## Meta setup

1. In Meta for Developers, create/select an app and add the WhatsApp product. Open **WhatsApp > API Setup**.
2. Copy the **Phone Number ID** for the sender number. Do not use the visible phone number in place of the ID.
3. Generate a system-user access token with the `whatsapp_business_messaging` permission. Do not put it in `index.html`, a public GitHub file, or a chat.
4. In WhatsApp Manager, create and get approval for a template named `new_guest_registration`, language English (US), category Utility. Suggested body:

   ```text
   New guest registration — The Dean After Dark
   Name: {{1}}
   WhatsApp: {{2}}
   Email: {{3}}
   Invited by: {{4}}
   ```

   Provide sample values for the four placeholders when submitting the template. Since this notification is initiated by the system, use an approved template unless the WhatsApp customer-service window is open.

## Deploy the function

Install Node.js 22 and the Firebase CLI, then authenticate with an account that can deploy functions to project `the-dean-munich-halloween`.

From the repository root:

```bash
firebase login
firebase use the-dean-munich-halloween
npm --prefix functions install
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN --project the-dean-munich-halloween
firebase deploy --only functions:notifyAriOnNewGuest --project the-dean-munich-halloween
```

When prompted for the secret, paste the Meta access token. On deployment, set the parameters:
- `WHATSAPP_PHONE_NUMBER_ID`: the sender's Phone Number ID from Meta.
- `WHATSAPP_NOTIFY_TO`: defaults to `4917681117359` (Ari), international digits only.
- `WHATSAPP_TEMPLATE_NAME`: `new_guest_registration`.
- `WHATSAPP_TEMPLATE_LANGUAGE`: `en_US`.
- `WHATSAPP_GRAPH_API_VERSION`: default `v23.0`; use a version currently supported by your Meta app if that version is no longer available.

Firebase Cloud Functions may require the project to use the Blaze billing plan. Review Firebase and Meta pricing before enabling production traffic.

## Test before removing Formspree

1. Confirm the function deploys and the custom template is approved.
2. Submit a test guest through the live invitation.
3. Confirm the guest appears in Firestore and you receive a WhatsApp message containing the guest's name, number, email, and inviter.
4. In Firestore, confirm the new record has `whatsappNotificationStatus: "sent"`. If it says `"failed"`, inspect **Firebase Console > Functions > Logs** and the stored `whatsappNotificationError`.
5. Repeat once to confirm a new registration triggers a new notification.
6. Only after these steps succeed should the Formspree submission be removed from `index.html`.

## Initial smoke test (optional)

Meta's pre-approved `hello_world` template can test the sender/token connection without guest variables. Temporarily set `WHATSAPP_TEMPLATE_NAME` to `hello_world`, submit a test RSVP, and confirm Ari receives the generic test message. Then restore `new_guest_registration` after its approval to receive the actual guest details.
