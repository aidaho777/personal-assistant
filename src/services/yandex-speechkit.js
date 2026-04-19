"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSpeechKitConnection = checkSpeechKitConnection;
exports.recognizeSpeech = recognizeSpeech;
const env_1 = require("../lib/env");
/**
 * Check Yandex SpeechKit connectivity by verifying env vars are set.
 * We don't make a real API call to avoid costs — just validate config.
 */
function checkSpeechKitConnection() {
    try {
        const apiKey = env_1.env.YANDEX_CLOUD_API_KEY;
        const folderId = env_1.env.YANDEX_CLOUD_FOLDER_ID;
        return !!(apiKey && folderId);
    }
    catch (_a) {
        return false;
    }
}
/**
 * Recognize speech using Yandex SpeechKit synchronous API.
 * https://yandex.cloud/ru/docs/speechkit/stt/request
 *
 * @param audioBuffer The OGG Opus audio buffer to recognize
 * @returns Recognized text
 */
async function recognizeSpeech(audioBuffer) {
    const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${env_1.env.YANDEX_CLOUD_FOLDER_ID}&topic=general&lang=ru-RU&format=oggopus`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Api-Key ${env_1.env.YANDEX_CLOUD_API_KEY}`,
            "Content-Type": "audio/ogg",
        },
        body: new Uint8Array(audioBuffer),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Yandex SpeechKit API error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    if (data.error_code) {
        throw new Error(`Yandex SpeechKit error: ${data.error_message}`);
    }
    return data.result || "";
}
