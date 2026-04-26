import { NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ google: { linked: false } });
  }

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    const rows = await sql`
      SELECT email FROM linked_accounts
      WHERE user_id = ${session.user.id}::uuid AND provider = 'google'
      LIMIT 1
    `;
    await sql.end();

    if (rows.length > 0) {
      return NextResponse.json({ google: { linked: true, email: rows[0].email } });
    }
    return NextResponse.json({ google: { linked: false } });
  } catch {
    await sql.end().catch(() => {});
    return NextResponse.json({ google: { linked: false } });
  }
}
