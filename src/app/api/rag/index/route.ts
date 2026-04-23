import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { indexDocument, indexAllDocuments } from "@/services/document-indexer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as { uploadId?: string; all?: boolean };

    if (body.uploadId) {
      const result = await indexDocument(body.uploadId);
      return NextResponse.json({ success: true, ...result });
    }

    if (body.all) {
      const result = await indexAllDocuments(session.user.id);
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: "Provide uploadId or all: true" }, { status: 400 });
  } catch (error) {
    console.error("Index error:", error);
    return NextResponse.json({ error: "Indexing failed", details: String(error) }, { status: 500 });
  }
}
