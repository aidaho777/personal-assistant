"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateFolder = getOrCreateFolder;
exports.uploadFileToDrive = uploadFileToDrive;
exports.checkDriveConnection = checkDriveConnection;
const googleapis_1 = require("googleapis");
const env_1 = require("../../../src/lib/env");
const stream_1 = require("stream");
let driveClient = null;
/** Lazy-init & cache the Drive client */
function getDrive() {
    if (driveClient)
        return driveClient;
    const credentials = JSON.parse(env_1.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new googleapis_1.google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive"],
    });
    driveClient = googleapis_1.google.drive({ version: "v3", auth });
    return driveClient;
}
// ─── Folder management ─────────────────────────────────────────────────
/** Cache tag→folderId to avoid repeated lookups */
const folderCache = new Map();
/**
 * Find or create a subfolder inside the root collector folder.
 * Returns the folder ID.
 */
async function getOrCreateFolder(folderName) {
    const cached = folderCache.get(folderName);
    if (cached)
        return cached;
    const drive = getDrive();
    const rootId = env_1.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    // Search for existing folder
    const query = `'${rootId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await drive.files.list({
        q: query,
        fields: "files(id, name)",
        spaces: "drive",
    });
    if (res.data.files && res.data.files.length > 0) {
        const id = res.data.files[0].id;
        folderCache.set(folderName, id);
        return id;
    }
    // Create new folder
    const created = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [rootId],
        },
        fields: "id",
    });
    const id = created.data.id;
    folderCache.set(folderName, id);
    return id;
}
/**
 * Upload a file buffer to Google Drive into the specified folder.
 */
async function uploadFileToDrive(buffer, fileName, mimeType, folderId) {
    var _a;
    const drive = getDrive();
    const readable = new stream_1.Readable();
    readable.push(buffer);
    readable.push(null);
    const file = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [folderId],
        },
        media: {
            mimeType,
            body: readable,
        },
        fields: "id, webViewLink",
    });
    return {
        fileId: file.data.id,
        folderId,
        webViewLink: (_a = file.data.webViewLink) !== null && _a !== void 0 ? _a : `https://drive.google.com/file/d/${file.data.id}/view`,
    };
}
// ─── Health check ───────────────────────────────────────────────────────
/**
 * Verify Google Drive connection by listing root folder.
 */
async function checkDriveConnection() {
    try {
        const drive = getDrive();
        await drive.files.get({ fileId: env_1.env.GOOGLE_DRIVE_ROOT_FOLDER_ID, fields: "id" });
        return true;
    }
    catch (_a) {
        return false;
    }
}
