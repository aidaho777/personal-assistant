import { env } from "../lib/env";

/**
 * Recognize speech using Yandex SpeechKit synchronous API.
 * https://yandex.cloud/ru/docs/speechkit/stt/request
 * 
 * @param audioBuffer The OGG Opus audio buffer to recognize
 * @returns Recognized text
 */
export async function recognizeSpeech(audioBuffer: Buffer): Promise<string> {
  const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${env.YANDEX_CLOUD_FOLDER_ID}&topic=general&lang=ru-RU&format=oggopus`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Api-Key ${env.YANDEX_CLOUD_API_KEY}`,
      "Content-Type": "audio/ogg",
    },
    body: new Uint8Array(audioBuffer),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Yandex SpeechKit API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  
  if (data.error_code) {
    throw new Error(`Yandex SpeechKit error: ${data.error_message}`);
  }

  return data.result || "";
}
