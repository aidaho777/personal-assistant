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
      title TEXT NOT NULL,
      description TEXT,
      status VARCHAR(16) NOT NULL DEFAULT 'todo',
      category VARCHAR(16) NOT NULL DEFAULT 'task',
      due_date TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const sql = getDb();

  try {
    await ensureTable(sql);

    const filter = req.nextUrl.searchParams.get("filter") ?? "all";

    let rows;
    if (filter === "today") {
      rows = await sql`
        SELECT * FROM tasks
        WHERE user_id = ${userId}::uuid
          AND status NOT IN ('done', 'cancelled')
          AND due_date::date = CURRENT_DATE
        ORDER BY created_at DESC
      `;
    } else if (filter === "future") {
      rows = await sql`
        SELECT * FROM tasks
        WHERE user_id = ${userId}::uuid
          AND status NOT IN ('done', 'cancelled')
          AND due_date > CURRENT_DATE
        ORDER BY due_date ASC NULLS LAST
      `;
    } else {
      rows = await sql`
        SELECT * FROM tasks
        WHERE user_id = ${userId}::uuid
        ORDER BY due_date ASC NULLS LAST, created_at DESC
      `;
    }

    await sql.end();
    return NextResponse.json({ tasks: rows });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("Tasks GET error:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const sql = getDb();

  try {
    await ensureTable(sql);

    const body = (await req.json()) as {
      title: string;
      description?: string;
      dueDate?: string;
      category?: string;
    };

    if (!body.title?.trim()) {
      await sql.end();
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const dueDate = body.dueDate ? new Date(body.dueDate).toISOString() : new Date().toISOString();

    const rows = await sql`
      INSERT INTO tasks (user_id, title, description, status, category, due_date)
      VALUES (
        ${userId}::uuid,
        ${body.title.trim()},
        ${body.description?.trim() ?? null},
        'todo',
        ${body.category ?? "task"},
        ${dueDate}::timestamptz
      )
      RETURNING *
    `;

    await sql.end();
    return NextResponse.json({ task: rows[0] });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("Tasks POST error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const sql = getDb();

  try {
    const body = (await req.json()) as {
      id: string;
      title?: string;
      description?: string;
      status?: string;
      dueDate?: string;
      category?: string;
    };

    if (!body.id) {
      await sql.end();
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const validStatuses = ["todo", "in_progress", "done", "cancelled"];
    if (body.status && !validStatuses.includes(body.status)) {
      await sql.end();
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const rows = await sql`
      UPDATE tasks SET
        title = COALESCE(${body.title ?? null}, title),
        description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
        status = COALESCE(${body.status ?? null}, status),
        category = COALESCE(${body.category ?? null}, category),
        due_date = CASE WHEN ${body.dueDate !== undefined} THEN ${body.dueDate ? new Date(body.dueDate).toISOString() : null}::timestamptz ELSE due_date END,
        updated_at = NOW()
      WHERE id = ${body.id}::uuid AND user_id = ${userId}::uuid
      RETURNING *
    `;

    await sql.end();

    if (rows.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task: rows[0] });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("Tasks PATCH error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const sql = getDb();

  try {
    const { id } = (await req.json()) as { id: string };
    if (!id) {
      await sql.end();
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await sql`
      DELETE FROM tasks WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    `;

    await sql.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("Tasks DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
