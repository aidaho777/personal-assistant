"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FILE_SIZE = void 0;
exports.extractTag = extractTag;
exports.buildFileName = buildFileName;
exports.md5 = md5;
exports.getMimeType = getMimeType;
exports.formatSize = formatSize;
const crypto_1 = require("crypto");
/**
 * Extract the first hashtag from text/caption. Returns tag name without '#'.
 * Falls back to "Inbox" if no tag found.
 */
function extractTag(text) {
    if (!text)
        return "Inbox";
    const match = text.match(/#(\S+)/);
    return match ? match[1] : "Inbox";
}
/**
 * Build a file name following the spec pattern:
 *   [YYYY-MM-DD_HH-MM]_[type]_[original_name]
 */
function buildFileName(contentType, originalName) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
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
function md5(buffer) {
    return (0, crypto_1.createHash)("md5").update(buffer).digest("hex");
}
/**
 * Map content type to a MIME type for Drive upload.
 */
function getMimeType(contentType, originalName) {
    var _a;
    if (contentType === "voice")
        return "audio/ogg";
    if (contentType === "photo")
        return "image/jpeg";
    if (contentType === "text")
        return "text/plain";
    // Try to guess from file extension
    if (originalName) {
        const ext = (_a = originalName.split(".").pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        const mimeMap = {
            pdf: "application/pdf",
            docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            csv: "text/csv",
            txt: "text/plain",
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
        };
        if (ext && mimeMap[ext])
            return mimeMap[ext];
    }
    return "application/octet-stream";
}
/**
 * Telegram file-size limit: 20 MB (for Bot API downloads)
 */
exports.MAX_FILE_SIZE = 20 * 1024 * 1024;
/**
 * Format file size for display.
 */
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
