const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const region = functions.region("europe-west1");
const USER_COLLECTION = "event_users";
const AUTH_ALIAS_DOMAIN = "staff.partybag.com";
const BACKUP_FORMAT = "the-dean-rsvp-backup";
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_COLLECTIONS = [
  "halloween_guests",
  "event_settings",
  "event_users",
  "welcome_drink_rewards"
];
const VALID_ROLES = ["admin", "hotel", "internations"];

function httpsError(code, message) {
  return new functions.https.HttpsError(code, message);
}

function cleanUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw httpsError("invalid-argument", "Username must be 3–32 characters and use letters, numbers, dots, underscores or hyphens.");
  }
  return username;
}

function cleanRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (!VALID_ROLES.includes(role)) {
    throw httpsError("invalid-argument", "Select a valid staff role.");
  }
  return role;
}

function cleanPassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 128) {
    throw httpsError("invalid-argument", "Password must contain between 10 and 128 characters.");
  }
  return password;
}

function authAlias(username) {
  return username + "@" + AUTH_ALIAS_DOMAIN;
}

async function requireAdmin(context) {
  if (!context.auth || !context.auth.uid) {
    throw httpsError("unauthenticated", "Sign in with an active Admin account.");
  }
  const snapshot = await db.collection(USER_COLLECTION).doc(context.auth.uid).get();
  const profile = snapshot.exists ? snapshot.data() : null;
  if (!profile || profile.active !== true || profile.role !== "admin") {
    throw httpsError("permission-denied", "This operation is available to active Admin users only.");
  }
  return { uid: context.auth.uid, profile: profile };
}

async function assertUsernameAvailable(username, exceptUid) {
  const snapshot = await db.collection(USER_COLLECTION).get();
  if (snapshot.docs.some(doc => doc.id !== exceptUid &&
      String((doc.data() || {}).username || "").trim().toLowerCase() === username)) {
    throw httpsError("already-exists", "That username is already assigned.");
  }
  try {
    const user = await auth.getUserByEmail(authAlias(username));
    if (user.uid !== exceptUid) {
      throw httpsError("already-exists", "That username is already assigned to an authentication account.");
    }
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error && error.code === "auth/email-already-exists") {
      throw httpsError("already-exists", "That username is already assigned to an authentication account.");
    }
    if (error && error.code !== "auth/user-not-found") throw error;
  }
}

function encodeValue(value) {
  if (value instanceof admin.firestore.Timestamp) {
    return {
      __firestoreType: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds
    };
  }
  if (value instanceof Date) {
    return { __firestoreType: "date", value: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    const result = {};
    Object.keys(value).forEach(key => { result[key] = encodeValue(value[key]); });
    return result;
  }
  return value;
}

function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === "object") {
    if (value.__firestoreType === "timestamp" &&
        Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
      return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
    }
    if (value.__firestoreType === "date" && typeof value.value === "string") {
      const date = new Date(value.value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const result = {};
    Object.keys(value).forEach(key => { result[key] = decodeValue(value[key]); });
    return result;
  }
  return value;
}

function validDocumentId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 1500 && !id.includes("/");
}

exports.adminListStaffUsers = region.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const snapshot = await db.collection(USER_COLLECTION).get();
  const users = await Promise.all(snapshot.docs.map(async doc => {
    const profile = doc.data() || {};
    let authExists = true;
    let authDisabled = false;
    try {
      const authUser = await auth.getUser(doc.id);
      authDisabled = Boolean(authUser.disabled);
    } catch (error) {
      if (error && error.code === "auth/user-not-found") authExists = false;
      else throw error;
    }
    return {
      uid: doc.id,
      username: String(profile.username || ""),
      role: VALID_ROLES.includes(profile.role) ? profile.role : "hotel",
      active: profile.active === true,
      authExists: authExists,
      authDisabled: authDisabled
    };
  }));
  users.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));
  return { users: users };
});

exports.adminCreateStaffUser = region.https.onCall(async (data, context) => {
  const adminContext = await requireAdmin(context);
  const username = cleanUsername(data && data.username);
  const role = cleanRole(data && data.role);
  const password = cleanPassword(data && data.password);
  await assertUsernameAvailable(username, null);

  let createdUser;
  try {
    createdUser = await auth.createUser({
      email: authAlias(username),
      password: password,
      displayName: username
    });
    await db.collection(USER_COLLECTION).doc(createdUser.uid).set({
      username: username,
      role: role,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: adminContext.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminContext.uid
    });
  } catch (error) {
    if (createdUser) {
      try { await auth.deleteUser(createdUser.uid); } catch (cleanupError) {
        console.error("Could not roll back newly created authentication user.", cleanupError);
      }
    }
    if (error instanceof functions.https.HttpsError) throw error;
    if (error && error.code === "auth/email-already-exists") {
      throw httpsError("already-exists", "That username is already assigned.");
    }
    console.error("adminCreateStaffUser failed.", error);
    throw httpsError("internal", "Could not create the staff account. Check backend logs.");
  }
  return { uid: createdUser.uid, username: username, role: role, active: true };
});

exports.adminUpdateStaffUser = region.https.onCall(async (data, context) => {
  const adminContext = await requireAdmin(context);
  const uid = String((data && data.uid) || "").trim();
  if (!uid) throw httpsError("invalid-argument", "A staff user ID is required.");
  const username = cleanUsername(data && data.username);
  const role = cleanRole(data && data.role);
  const active = data && data.active === true;
  if (uid === adminContext.uid &&
      (username !== String(adminContext.profile.username || "").toLowerCase() || role !== "admin" || active !== true)) {
    throw httpsError("failed-precondition", "To prevent lockout, you cannot rename, deactivate or change the role of your own Admin account here.");
  }

  const targetRef = db.collection(USER_COLLECTION).doc(uid);
  const targetSnapshot = await targetRef.get();
  if (!targetSnapshot.exists) throw httpsError("not-found", "That staff role record no longer exists.");
  await assertUsernameAvailable(username, uid);
  try {
    await auth.updateUser(uid, {
      email: authAlias(username),
      displayName: username,
      disabled: !active
    });
    await targetRef.set({
      username: username,
      role: role,
      active: active,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminContext.uid
    }, { merge: true });
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error && error.code === "auth/user-not-found") {
      throw httpsError("failed-precondition", "The Authentication account is missing. Remove the stale role record and create the account again.");
    }
    if (error && error.code === "auth/email-already-exists") {
      throw httpsError("already-exists", "That username is already assigned.");
    }
    console.error("adminUpdateStaffUser failed.", error);
    throw httpsError("internal", "Could not update the staff account. Check backend logs.");
  }
  return { uid: uid, username: username, role: role, active: active };
});

exports.adminChangeStaffPassword = region.https.onCall(async (data, context) => {
  const adminContext = await requireAdmin(context);
  const uid = String((data && data.uid) || "").trim();
  if (!uid) throw httpsError("invalid-argument", "A staff user ID is required.");
  const password = cleanPassword(data && data.password);
  if (uid !== adminContext.uid) {
    const target = await db.collection(USER_COLLECTION).doc(uid).get();
    if (!target.exists) throw httpsError("not-found", "That staff role record no longer exists.");
  }
  try {
    await auth.updateUser(uid, { password: password });
  } catch (error) {
    if (error && error.code === "auth/user-not-found") {
      throw httpsError("failed-precondition", "The Authentication account is missing.");
    }
    console.error("adminChangeStaffPassword failed.", error);
    throw httpsError("internal", "Could not change the password. Check backend logs.");
  }
  return { uid: uid, changed: true };
});

exports.adminDeleteStaffUser = region.https.onCall(async (data, context) => {
  const adminContext = await requireAdmin(context);
  const uid = String((data && data.uid) || "").trim();
  if (!uid) throw httpsError("invalid-argument", "A staff user ID is required.");
  if (uid === adminContext.uid) {
    throw httpsError("failed-precondition", "You cannot delete your own signed-in Admin account.");
  }
  const targetRef = db.collection(USER_COLLECTION).doc(uid);
  const target = await targetRef.get();
  if (!target.exists) throw httpsError("not-found", "That staff role record no longer exists.");
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if (!(error && error.code === "auth/user-not-found")) {
      console.error("adminDeleteStaffUser Authentication deletion failed.", error);
      throw httpsError("internal", "Could not delete the Authentication account.");
    }
  }
  await targetRef.delete();
  return { uid: uid, deleted: true };
});

exports.adminCreateDatabaseBackup = region.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const backup = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    projectId: process.env.GCLOUD_PROJECT || "",
    collections: {}
  };
  let totalDocs = 0;
  for (const collectionName of BACKUP_COLLECTIONS) {
    const snapshot = await db.collection(collectionName).get();
    totalDocs += snapshot.size;
    if (totalDocs > 8000) {
      throw httpsError("resource-exhausted", "This event backup contains more than 8,000 documents. Use a managed Firestore export for a database of this size.");
    }
    backup.collections[collectionName] = snapshot.docs.map(doc => ({
      id: doc.id,
      data: encodeValue(doc.data())
    }));
  }
  if (JSON.stringify(backup).length > 7000000) {
    throw httpsError("resource-exhausted", "This backup is too large for a callable response. Use a managed Firestore export instead.");
  }
  return { backup: backup };
});

exports.adminRestoreDatabaseBackup = region.https.onCall(async (data, context) => {
  const adminContext = await requireAdmin(context);
  if (!data || data.confirmReplace !== true) {
    throw httpsError("failed-precondition", "Explicit confirmation is required before replacing event collections.");
  }
  const backup = data.backup;
  if (!backup || backup.format !== BACKUP_FORMAT || backup.schemaVersion !== BACKUP_SCHEMA_VERSION || !backup.collections) {
    throw httpsError("invalid-argument", "This is not a supported RSVP backup file.");
  }
  if (backup.projectId && backup.projectId !== (process.env.GCLOUD_PROJECT || "")) {
    throw httpsError("invalid-argument", "This backup belongs to a different Firebase project.");
  }

  const collections = {};
  let totalDocs = 0;
  for (const name of BACKUP_COLLECTIONS) {
    const entries = backup.collections[name];
    if (!Array.isArray(entries)) throw httpsError("invalid-argument", "The backup is missing the " + name + " collection.");
    totalDocs += entries.length;
    if (totalDocs > 8000) throw httpsError("resource-exhausted", "The backup contains too many documents.");
    const ids = new Set();
    collections[name] = entries.map(entry => {
      if (!entry || !validDocumentId(entry.id) || !entry.data || typeof entry.data !== "object" || Array.isArray(entry.data)) {
        throw httpsError("invalid-argument", "The backup contains an invalid document in " + name + ".");
      }
      if (ids.has(entry.id)) throw httpsError("invalid-argument", "The backup contains duplicate document IDs in " + name + ".");
      ids.add(entry.id);
      return { id: entry.id, data: decodeValue(entry.data) };
    });
  }

  const adminRecord = collections[USER_COLLECTION].find(entry => entry.id === adminContext.uid);
  if (!adminRecord || adminRecord.data.active !== true || adminRecord.data.role !== "admin") {
    throw httpsError("failed-precondition", "This backup would remove your active Admin role and lock you out. Restore from a backup that includes your current Admin role record.");
  }

  // Preflight validation is complete before any collection is changed.
  for (const name of BACKUP_COLLECTIONS) {
    const current = await db.collection(name).get();
    for (let start = 0; start < current.docs.length; start += 400) {
      const batch = db.batch();
      current.docs.slice(start, start + 400).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    const incoming = collections[name];
    for (let start = 0; start < incoming.length; start += 400) {
      const batch = db.batch();
      incoming.slice(start, start + 400).forEach(entry => {
        batch.set(db.collection(name).doc(entry.id), entry.data);
      });
      await batch.commit();
    }
  }
  return {
    restored: true,
    counts: Object.fromEntries(BACKUP_COLLECTIONS.map(name => [name, collections[name].length]))
  };
});
