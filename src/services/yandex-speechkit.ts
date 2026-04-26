/**
 * Synchronous speech recognition via Yandex SpeechKit.
 * Suitable for audio up to 30 sec / 1 MB (standard Telegram voice messages).
 * Endpoint: POST https://stt.api.cloud.yandex.net/speech/v1/stt:recognize
 *
 * Returns "" if env vars are missing or recognition fails — never throws.
 */

export function checkSpeechKitConnection(): boolean {
  return !!(process.env.YANDEX_CLOUD_API_KEY && process.env.YANDEX_CLOUD_FOLDER_ID);
}

export async function recognizeSpeech(oggBuffer: Buffer): Promise<string> {
  const apiKey = process.env.YANDEX_CLOUD_API_KEY;
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID;

  if (!apiKey || !folderId) {
    console.log("[SpeechKit] API key or folder ID not configured, skipping");
    return "";
  }

  try {
    console.log("[SpeechKit] Recognizing audio, size:", oggBuffer.length, "bytes");

    const response = await fetch(
      `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${folderId}&topic=general&lang=ru-RU&format=oggopus`,
      {
        method: "POST",
        headers: {
          "Authorization": `Api-Key ${apiKey}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(oggBuffer),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SpeechKit] Error:", response.status, errorText);
      return "";
    }

    const data = (await response.json()) as { result?: string; error_code?: string; error_message?: string };

    if (data.error_code) {
      console.error("[SpeechKit] API error:", data.error_message);
      return "";
    }

    const text = data.result || "";
    console.log("[SpeechKit] Recognized:", text.substring(0, 100));
    return text;
  } catch (e) {
    console.error("[SpeechKit] Recognition failed:", e);
    return "";
  }
}
