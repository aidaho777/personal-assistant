import { createHash } from "crypto";

/**
 * Extract the first hashtag from text/caption. Returns tag name without '#'.
 * Falls back to "Inbox" if no tag found.
 */
export function extractTag(text?: string): string {
  if (!text) return "Inbox";
  const match = text.match(/#(\S+)/);
  return match ? match[1] : "Inbox";
}

/**
 * Build a file name following the spec pattern:
 *   [YYYY-MM-DD_HH-MM]_[type]_[original_name]
 */
export function buildFileName(
  contentType: string,
  originalName?: string
): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");

  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}`;

  const typePrefix = contentType === "document"
    ? "doc"
    : contentType === "photo"
      ? "photo"
      : contentType === "voice"
        ? "voice"
        : "text";

  const safeName = originalName
    ? originalName.replace(/[^\w.\-]/g, "_")
    : `note_${Date.now()}`;

  return `${dateStr}_${timeStr}_${typePrefix}_${safeName}`;
}

/**
 * Compute MD5 hash of a buffer.
 */
export function md5(buffer: Buffer): string {
  return createHash("md5").update(buffer).digest("hex");
}

/**
 * Map content type to a MIME type for Drive upload.
 */
export function getMimeType(contentType: string, originalName?: string): string {
  if (contentType === "voice") return "audio/ogg";
  if (contentType === "photo") return "image/jpeg";
  if (contentType === "text") return "text/plain";

  // Try to guess from file extension
  if (originalName) {
    const ext = originalName.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
      txt: "text/plain",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    if (ext && mimeMap[ext]) return mimeMap[ext];
  }

  return "application/octet-stream";
}

/**
 * Telegram file-size limit: 20 MB (for Bot API downloads)
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Format file size for display.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
