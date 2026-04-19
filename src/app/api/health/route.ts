import { NextResponse } from "next/server";
import { checkDbConnection } from "@/services/user-service";
import { checkDriveConnection } from "@/services/google-drive";
import { checkSpeechKitConnection } from "@/services/yandex-speechkit";

// Force dynamic rendering — requires live DB and Drive connections
export const dynamic = "force-dynamic";

export async function GET() {
  const [dbOk, driveOk] = await Promise.all([
    checkDbConnection(),
    checkDriveConnection(),
  ]);
  const speechKitOk = checkSpeechKitConnection();

  // "healthy" = all services ok
  // "degraded" = DB ok but some optional services not configured
  // "unhealthy" = DB is down (critical failure)
  const allOk = dbOk && driveOk && speechKitOk;
  const status = allOk ? "healthy" : dbOk ? "degraded" : "unhealthy";
  const httpStatus = dbOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      services: {
        database: dbOk ? "ok" : "error",
        googleDrive: driveOk ? "ok" : "error",
        yandexSpeechKit: speechKitOk ? "ok" : "not configured",
      },
      timestamp: new Date().toISOString(),
    },
    { status: httpStatus }
  );
}
