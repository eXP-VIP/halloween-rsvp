const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// The API token is stored in Google Secret Manager, never in public HTML or GitHub.
const WHATSAPP_ACCESS_TOKEN = defineSecret("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = defineString("WHATSAPP_PHONE_NUMBER_ID");
const WHATSAPP_NOTIFY_TO = defineString("WHATSAPP_NOTIFY_TO", { default: "4917681117359" });
const WHATSAPP_TEMPLATE_NAME = defineString("WHATSAPP_TEMPLATE_NAME", { default: "new_guest_registration" });
const WHATSAPP_TEMPLATE_LANGUAGE = defineString("WHATSAPP_TEMPLATE_LANGUAGE", { default: "en_US" });
const WHATSAPP_GRAPH_API_VERSION = defineString("WHATSAPP_GRAPH_API_VERSION", { default: "v23.0" });

function templateText(value, fallback) {
  const text = String(value == null ? "" : value).trim();
  return (text || fallback).slice(0, 900);
}

exports.notifyAriOnNewGuest = onDocumentCreated(
  {
    document: "halloween_guests/{guestId}",
    region: "europe-west1",
    retry: true,
    secrets: [WHATSAPP_ACCESS_TOKEN]
  },
  async (event) => {
    const createdSnapshot = event.data;
    if (!createdSnapshot) return;

    const guestRef = createdSnapshot.ref;
    const latestSnapshot = await guestRef.get();
    if (!latestSnapshot.exists) return;

    const guest = latestSnapshot.data() || {};

    // Event retries must not send a second notification after a successful delivery.
    if (guest.whatsappNotificationStatus === "sent") {
      logger.info("WhatsApp notification already sent for guest", { guestId: event.params.guestId });
      return;
    }

    const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID.value().trim();
    const recipient = WHATSAPP_NOTIFY_TO.value().replace(/\\D/g, "");
    const templateName = WHATSAPP_TEMPLATE_NAME.value().trim();
    const templateLanguage = WHATSAPP_TEMPLATE_LANGUAGE.value().trim() || "en_US";
    const graphVersion = WHATSAPP_GRAPH_API_VERSION.value().trim() || "v23.0";

    if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured.");
    if (!/^\\d+$/.test(phoneNumberId)) throw new Error("WHATSAPP_PHONE_NUMBER_ID must contain digits only.");
    if (!/^\\d{8,15}$/.test(recipient)) throw new Error("WHATSAPP_NOTIFY_TO must be a phone number in international format, digits only.");
    if (!/^v\\d+\\.\\d+$/.test(graphVersion)) throw new Error("WHATSAPP_GRAPH_API_VERSION must look like v23.0.");
    if (!/^[a-z0-9_]{1,128}$/.test(templateName)) throw new Error("WHATSAPP_TEMPLATE_NAME is invalid.");

    const template = {
      name: templateName,
      language: { code: templateLanguage }
    };

    // 'hello_world' can be used for an initial API smoke test. Use the approved
    // 'new_guest_registration' template to include guest details.
    if (templateName !== "hello_world") {
      template.components = [{
        type: "body",
        parameters: [
          { type: "text", text: templateText(guest.name, "Not provided") },
          { type: "text", text: templateText(guest.phone, "Not provided") },
          { type: "text", text: templateText(guest.email, "Not provided") },
          { type: "text", text: templateText(guest.invitedBy, "Not specified") }
        ]
      }];
    }

    await guestRef.set({
      whatsappNotificationStatus: "sending",
      whatsappNotificationLastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      whatsappNotificationError: admin.firestore.FieldValue.delete()
    }, { merge: true });

    try {
      const response = await fetch(
        "https://graph.facebook.com/" + graphVersion + "/" + phoneNumberId + "/messages",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + WHATSAPP_ACCESS_TOKEN.value(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipient,
            type: "template",
            template
          })
        }
      );

      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = responseData && responseData.error ? responseData.error : {};
        const detail = String(apiError.message || "WhatsApp Cloud API rejected the request").slice(0, 400);
        throw new Error("WhatsApp API HTTP " + response.status + ": " + detail);
      }

      const messageId = responseData && responseData.messages && responseData.messages[0]
        ? responseData.messages[0].id || null
        : null;

      await guestRef.set({
        whatsappNotificationStatus: "sent",
        whatsappNotificationMessageId: messageId,
        whatsappNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        whatsappNotificationError: admin.firestore.FieldValue.delete()
      }, { merge: true });

      logger.info("WhatsApp notification accepted by Meta", {
        guestId: event.params.guestId,
        messageId
      });
    } catch (error) {
      const safeMessage = String(error && error.message ? error.message : "Unknown WhatsApp API error").slice(0, 500);
      try {
        await guestRef.set({
          whatsappNotificationStatus: "failed",
          whatsappNotificationError: safeMessage,
          whatsappNotificationLastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (statusError) {
        logger.error("Could not save WhatsApp notification failure status", {
          guestId: event.params.guestId,
          error: String(statusError && statusError.message ? statusError.message : statusError).slice(0, 300)
        });
      }
      logger.error("WhatsApp notification failed", { guestId: event.params.guestId, error: safeMessage });
      throw error;
    }
  }
);
