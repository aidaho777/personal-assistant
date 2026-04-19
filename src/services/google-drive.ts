import { google, drive_v3 } from "googleapis";
import { env } from "../lib/env";
import { Readable } from "stream";

let driveClient: drive_v3.Drive | null = null;

/**
 * Parse GOOGLE_SERVICE_ACCOUNT_JSON — supports both raw JSON and base64-encoded JSON.
 * Base64 encoding is the recommended way to store complex JSON in Railway env vars.
 */
function parseServiceAccountJson(raw: string): object {
  const trimmed = raw.trim();
  // Try base64 first: if it doesn't start with '{', assume it's base64-encoded
  if (!trimmed.startsWith('{')) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      // fall through to raw parse
    }
  }
  // Raw JSON (possibly with Railway-added quirks — strip outer quotes if present)
  let s = trimmed;
  if (s.startsWith('"') && s.endsWith('"')) {
    // Railway sometimes wraps value in extra quotes
    s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  return JSON.parse(s);
}

/** Lazy-init & cache the Drive client */
function getDrive(): drive_v3.Drive {
  if (driveClient) return driveClient;

  const credentials = parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  driveClient = google.drive({ version: "v3", auth });
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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
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
    supportsAllDrives: true,
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
    supportsAllDrives: true,
  });

  return {
    fileId: file.data.id!,
    folderId,
    webViewLink: file.data.webViewLink ?? `https://drive.google.com/file/d/${file.data.id}/view`,
  };
}

// ─── Health check ───────────────────────────────────────────────────────

/**
 * Verify Google Drive connection by listing root folder.
 */
export async function checkDriveConnection(): Promise<boolean> {
  try {
    const drive = getDrive();
    await drive.files.get({
      fileId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
      fields: "id",
      supportsAllDrives: true,
    });
    return true;
  } catch {
    return false;
  }
}
