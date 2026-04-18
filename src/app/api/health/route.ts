import { NextResponse } from "next/server";
import { checkDbConnection } from "@/services/user-service";
import { checkDriveConnection } from "@/services/google-drive";

// Force dynamic rendering — requires live DB and Drive connections
export const dynamic = "force-dynamic";

export async function GET() {
  const [dbOk, driveOk] = await Promise.all([
    checkDbConnection(),
    checkDriveConnection(),
  ]);

  const healthy = dbOk && driveOk;

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      services: {
        database: dbOk ? "ok" : "error",
        googleDrive: driveOk ? "ok" : "error",
      },
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
