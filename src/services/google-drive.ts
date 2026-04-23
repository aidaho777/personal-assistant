import { google, drive_v3 } from "googleapis";
import { env } from "../lib/env";
import { Readable } from "stream";

let driveClient: drive_v3.Drive | null = null;

/** Lazy-init & cache the Drive client using OAuth2 */
function getDrive(): drive_v3.Drive {
  if (driveClient) return driveClient;

  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
  });

  driveClient = google.drive({ version: "v3", auth: oauth2Client });
  return driveClient;
}

// ─── Folder management ─────────────────────────────────────────────────

/** Cache tag→folderId to avoid repeated lookups */
const folderCache = new Map<string, string>();

/**
 * Find or create a subfolder inside the root collector folder.
 * Returns the folder ID.
 */
export async function getOrCreateFolder(folderName: string): Promise<string> {
  const cached = folderCache.get(folderName);
  if (cached) return cached;

  const drive = getDrive();
  const rootId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  // Search for existing folder
  const query = `'${rootId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    const id = res.data.files[0].id!;
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

  const id = created.data.id!;
  folderCache.set(folderName, id);
  return id;
}

// ─── File upload ────────────────────────────────────────────────────────

export interface UploadResult {
  fileId: string;
  folderId: string;
  webViewLink: string;
}

/**
 * Upload a file buffer to Google Drive into the specified folder.
 */
export async function uploadFileToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<UploadResult> {
  const drive = getDrive();

  const readable = new Readable();
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
    fileId: file.data.id!,
    folderId,
    webViewLink: file.data.webViewLink ?? `https://drive.google.com/file/d/${file.data.id}/view`,
  };
}

// ─── Health check ───────────────────────────────────────────────────────

export async function downloadFileFromDrive(fileId: string): Promise<Buffer> {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/**
 * Verify Google Drive connection by listing root folder.
 */
export async function checkDriveConnection(): Promise<boolean> {
  try {
    const drive = getDrive();
    await drive.files.get({ fileId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID, fields: "id" });
    return true;
  } catch {
    return false;
  }
}
