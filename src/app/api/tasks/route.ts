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
      web_user_id UUID,
      title TEXT NOT NULL,
      raw_message TEXT,
      due_date TIMESTAMPTZ,
      is_completed BOOLEAN NOT NULL DEFAULT false,
      source VARCHAR(16) NOT NULL DEFAULT 'web',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function getTaskUserIds(sql: ReturnType<typeof postgres>, webUserId: string): Promise<string[]> {
  const ids = [webUserId];
  try {
    const rows = await sql`
      SELECT telegram_user_id FROM web_users WHERE id = ${webUserId}::uuid
    `;
    const tgId = rows[0]?.telegram_user_id as string | undefined;
    if (tgId) ids.push(tgId);
  } catch { /* ignore */ }
  return ids;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  try {
    await ensureTable(sql);
    const userIds = await getTaskUserIds(sql, session.user.id);
    const showCompleted = req.nextUrl.searchParams.get("completed") === "true";

    let rows;
    if (showCompleted) {
      rows = await sql`
        SELECT * FROM tasks
        WHERE (user_id = ANY(${userIds}::uuid[]) OR web_user_id = ${session.user.id}::uuid)
        ORDER BY due_date ASC NULLS LAST, created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT * FROM tasks
        WHERE (user_id = ANY(${userIds}::uuid[]) OR web_user_id = ${session.user.id}::uuid)
          AND is_completed = false
        ORDER BY
          CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN 0 ELSE 1 END,
          due_date ASC NULLS LAST,
          created_at DESC
      `;
    }

    await sql.end();
    return NextResponse.json({ tasks: rows });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Tasks] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  try {
    await ensureTable(sql);

    const body = (await req.json()) as { title: string; dueDate?: string };
    if (!body.title?.trim()) {
      await sql.end();
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const dueDate = body.dueDate && body.dueDate.trim() ? new Date(body.dueDate).toISOString() : null;

    const rows = await sql`
      INSERT INTO tasks (web_user_id, user_id, title, due_date, source)
      VALUES (
        ${session.user.id}::uuid,
        ${session.user.id}::uuid,
        ${body.title.trim()},
        ${dueDate}::timestamptz,
        'web'
      )
      RETURNING *
    `;

    await sql.end();
    return NextResponse.json({ task: rows[0] });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Tasks] POST error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  try {
    const body = (await req.json()) as { id: string; isCompleted: boolean };
    if (!body.id) {
      await sql.end();
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const userIds = await getTaskUserIds(sql, session.user.id);

    const rows = await sql`
      UPDATE tasks SET is_completed = ${body.isCompleted}
      WHERE id = ${body.id}::uuid
        AND (user_id = ANY(${userIds}::uuid[]) OR web_user_id = ${session.user.id}::uuid)
      RETURNING *
    `;

    await sql.end();
    if (rows.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ task: rows[0] });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Tasks] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  try {
    const { id } = (await req.json()) as { id: string };
    if (!id) {
      await sql.end();
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const userIds = await getTaskUserIds(sql, session.user.id);

    await sql`
      DELETE FROM tasks
      WHERE id = ${id}::uuid
        AND (user_id = ANY(${userIds}::uuid[]) OR web_user_id = ${session.user.id}::uuid)
    `;

    await sql.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Tasks] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
