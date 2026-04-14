/**
 * Centralized env config — fails fast if required vars are missing.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  // Telegram
  get TELEGRAM_BOT_TOKEN() { return requireEnv("TELEGRAM_BOT_TOKEN"); },
  get TELEGRAM_WEBHOOK_SECRET() { return requireEnv("TELEGRAM_WEBHOOK_SECRET"); },

  // Google Drive
  get GOOGLE_SERVICE_ACCOUNT_JSON() { return requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON"); },
  get GOOGLE_DRIVE_ROOT_FOLDER_ID() { return requireEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID"); },

  // Database
  get DATABASE_URL() { return requireEnv("DATABASE_URL"); },

  // App
  get APP_URL() { return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"; },
} as const;
