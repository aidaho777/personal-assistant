import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { searchDocuments } from "@/services/rag-search";
import { generateAnswer } from "@/services/rag-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { message } = await req.json() as { message?: string };
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message is required" }), { status: 400 });
  }

  try {
    const chunks = await searchDocuments(message, session.user.id, 5);

    if (chunks.length === 0) {
      return new Response(JSON.stringify({
        error: "no_documents",
        message: "Нет проиндексированных документов. Загрузите файлы через Telegram-бота и нажмите «Переиндексировать».",
      }), { status: 200 });
    }

    const result = generateAnswer(message, chunks);

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("RAG chat error:", error);
    return new Response(JSON.stringify({ error: "Chat failed", details: String(error) }), { status: 500 });
  }
}
