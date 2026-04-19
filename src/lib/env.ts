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

  // Google Drive (OAuth2)
  get GOOGLE_CLIENT_ID() { return requireEnv("GOOGLE_CLIENT_ID"); },
  get GOOGLE_CLIENT_SECRET() { return requireEnv("GOOGLE_CLIENT_SECRET"); },
  get GOOGLE_REFRESH_TOKEN() { return requireEnv("GOOGLE_REFRESH_TOKEN"); },
  get GOOGLE_DRIVE_ROOT_FOLDER_ID() { return requireEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID"); },

  // Yandex SpeechKit
  get YANDEX_CLOUD_API_KEY() { return requireEnv("YANDEX_CLOUD_API_KEY"); },
  get YANDEX_CLOUD_FOLDER_ID() { return requireEnv("YANDEX_CLOUD_FOLDER_ID"); },

  // Database
  get DATABASE_URL() { return requireEnv("DATABASE_URL"); },

  // App
  get APP_URL() { return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"; },
} as const;
