import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";

export const dynamic = "force-dynamic";

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'todo',
      priority VARCHAR(16) NOT NULL DEFAULT 'medium',
      due_date TIMESTAMPTZ,
      source VARCHAR(16) NOT NULL DEFAULT 'web',
      raw_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function getOwnerIds(sql: ReturnType<typeof postgres>, webUserId: string): Promise<string[]> {
  const ids = [webUserId];
  try {
    const rows = await sql`SELECT telegram_user_id FROM web_users WHERE id = ${webUserId}::uuid`;
    const tgId = rows[0]?.telegram_user_id as string | undefined;
    if (tgId) ids.push(tgId);
  } catch { /* ignore */ }
  return ids;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  try {
    await ensureTable(sql);
    const ids = await getOwnerIds(sql, session.user.id);
    const status = req.nextUrl.searchParams.get("status");
    const priority = req.nextUrl.searchParams.get("priority");

    let rows;
    if (status && status !== "all") {
      rows = await sql`
        SELECT * FROM tasks WHERE user_id = ANY(${ids}::uuid[])
          AND status = ${status}
        ORDER BY CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN 0 ELSE 1 END, due_date ASC NULLS LAST, created_at DESC
      `;
    } else if (priority && priority !== "all") {
      rows = await sql`
        SELECT * FROM tasks WHERE user_id = ANY(${ids}::uuid[])
          AND priority = ${priority}
        ORDER BY CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN 0 ELSE 1 END, due_date ASC NULLS LAST, created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT * FROM tasks WHERE user_id = ANY(${ids}::uuid[])
        ORDER BY CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN 0 ELSE 1 END, due_date ASC NULLS LAST, created_at DESC
      `;
    }

    await sql.end();
    return NextResponse.json({ tasks: rows });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Tasks] GET error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  try {
    await ensureTable(sql);
    const body = (await req.json()) as { title: string; description?: string; priority?: string; dueDate?: string; status?: string };
    if (!body.title?.trim()) { await sql.end(); return NextResponse.json({ error: "Title required" }, { status: 400 }); }

    const dueDate = body.dueDate?.trim() ? new Date(body.dueDate).toISOString() : null;
    const rows = await sql`
      INSERT INTO tasks (user_id, title, description, status, priority, due_date, source)
      VALUES (${session.user.id}::uuid, ${body.title.trim()}, ${body.description?.trim() ?? null}, ${body.status ?? "todo"}, ${body.priority ?? "medium"}, ${dueDate}::timestamptz, 'web')
      RETURNING *
    `;

    await sql.end();
    return NextResponse.json({ task: rows[0] });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Tasks] POST error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  try {
    const body = (await req.json()) as { id: string; title?: string; description?: string; status?: string; priority?: string; dueDate?: string };
    if (!body.id) { await sql.end(); return NextResponse.json({ error: "id required" }, { status: 400 }); }

    const ids = await getOwnerIds(sql, session.user.id);

    const rows = await sql`
      UPDATE tasks SET
        title = COALESCE(${body.title ?? null}, title),
        description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
        status = COALESCE(${body.status ?? null}, status),
        priority = COALESCE(${body.priority ?? null}, priority),
        due_date = CASE WHEN ${body.dueDate !== undefined} THEN ${body.dueDate ? new Date(body.dueDate).toISOString() : null}::timestamptz ELSE due_date END,
        updated_at = NOW()
      WHERE id = ${body.id}::uuid AND user_id = ANY(${ids}::uuid[])
      RETURNING *
    `;

    await sql.end();
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ task: rows[0] });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Tasks] PATCH error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();
  try {
    const { id } = (await req.json()) as { id: string };
    if (!id) { await sql.end(); return NextResponse.json({ error: "id required" }, { status: 400 }); }
    const ids = await getOwnerIds(sql, session.user.id);
    await sql`DELETE FROM tasks WHERE id = ${id}::uuid AND user_id = ANY(${ids}::uuid[])`;
    await sql.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Tasks] DELETE error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
