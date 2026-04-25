import { fetchWithRetry } from "@/lib/fetch-with-retry";

export async function extractTextFromPdfWithOCR(pdfBuffer: Buffer): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  console.log("[OCR] Starting PDF OCR, buffer size:", pdfBuffer.length);

  const pages = await pdfToImages(pdfBuffer);
  console.log("[OCR] Converted PDF to", pages.length, "page images");

  let fullText = "";

  for (let i = 0; i < pages.length; i++) {
    console.log("[OCR] Processing page", i + 1, "of", pages.length);

    const base64Image = pages[i].toString("base64");

    const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Извлеки ВЕСЬ текст с этого изображения. Сохрани структуру: таблицы, поля, значения. Верни только извлечённый текст, без комментариев. Если есть таблица — преобразуй в формат 'Поле: Значение'. Включи все даты, номера, станции, имена, суммы.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
      }),
    });

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const pageText = data.choices[0]?.message?.content || "";
    console.log("[OCR] Page", i + 1, "text length:", pageText.length);

    fullText += `\n--- Страница ${i + 1} ---\n${pageText}\n`;
  }

  return fullText.trim();
}

export function isTextGarbage(text: string): boolean {
  if (!text || text.length < 20) return true;
  const readable = text.replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s.,!?:;\-()]/g, "").length;
  const ratio = readable / text.length;
  console.log("[OCR] Text quality check: length=%d, readable ratio=%.2f", text.length, ratio);
  return ratio < 0.3;
}

async function pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const { pdf } = await import("pdf-to-img");
  const images: Buffer[] = [];
  const document = await pdf(pdfBuffer, { scale: 2 });
  for await (const page of document) {
    images.push(Buffer.from(page));
  }
  return images;
}
