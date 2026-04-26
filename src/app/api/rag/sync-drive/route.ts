import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncDriveDocuments } from "@/services/drive-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncDriveDocuments(session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[SyncDrive] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
