import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { gte, sql, and, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

const { webUsers, uploads } = schema;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = new URL(req.url).searchParams.get("period") ?? "all";
  const since = period === "7" ? new Date(Date.now() - 7 * 86400_000)
    : period === "30" ? new Date(Date.now() - 30 * 86400_000)
    : null;

  const userFilter = since
    ? and(gte(webUsers.createdAt, since))
    : undefined;

  const [registered, linked, firstUpload, active, power] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(webUsers)
      .where(userFilter)
      .then(r => r[0]?.count ?? 0),

    db.select({ count: sql<number>`count(*)::int` })
      .from(webUsers)
      .where(userFilter ? and(userFilter, isNotNull(webUsers.telegramUserId)) : isNotNull(webUsers.telegramUserId))
      .then(r => r[0]?.count ?? 0),

    db.select({ count: sql<number>`count(distinct user_id)::int` })
      .from(uploads)
      .then(r => r[0]?.count ?? 0),

    db.select({ count: sql<number>`count(*)::int` })
      .from(
        db.select({ userId: uploads.userId, cnt: sql<number>`count(*)::int` })
          .from(uploads)
          .groupBy(uploads.userId)
          .as("sub")
      )
      .where(sql`cnt >= 5`)
      .then(r => r[0]?.count ?? 0),

    db.select({ count: sql<number>`count(*)::int` })
      .from(
        db.select({ userId: uploads.userId, cnt: sql<number>`count(*)::int` })
          .from(uploads)
          .groupBy(uploads.userId)
          .as("sub")
      )
      .where(sql`cnt >= 20`)
      .then(r => r[0]?.count ?? 0),
  ]);

  const steps = [
    { step: 1, label: "Регистрация",        value: registered },
    { step: 2, label: "Привязан Telegram",   value: linked },
    { step: 3, label: "Первая загрузка",     value: firstUpload },
    { step: 4, label: "Активные (5+)",       value: active },
    { step: 5, label: "Power users (20+)",   value: power },
  ];

  const annotated = steps.map((s, i) => ({
    ...s,
    conversion: i === 0 ? 100 : registered > 0 ? Math.round((s.value / registered) * 100) : 0,
    stepConversion: i === 0 ? 100 : steps[i - 1].value > 0 ? Math.round((s.value / steps[i - 1].value) * 100) : 0,
  }));

  return NextResponse.json({ funnel: annotated, period });
}
