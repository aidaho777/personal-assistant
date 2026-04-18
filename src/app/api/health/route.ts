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

  // "healthy" = all services ok
  // "degraded" = DB ok but Drive not configured (acceptable for partial deployment)
  // "unhealthy" = DB is down (critical failure)
  const status = dbOk && driveOk ? "healthy" : dbOk ? "degraded" : "unhealthy";
  const httpStatus = dbOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      services: {
        database: dbOk ? "ok" : "error",
        googleDrive: driveOk ? "ok" : "error",
      },
      timestamp: new Date().toISOString(),
    },
    { status: httpStatus }
  );
}
