import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const { webUsers } = schema;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db
    .select({ id: webUsers.id, email: webUsers.email, name: webUsers.name, role: webUsers.role, createdAt: webUsers.createdAt, telegramUserId: webUsers.telegramUserId })
    .from(webUsers)
    .where(eq(webUsers.id, session.user.id))
    .limit(1);

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; oldPassword?: string; newPassword?: string };

  const [user] = await db
    .select()
    .from(webUsers)
    .where(eq(webUsers.id, session.user.id))
    .limit(1);

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Partial<typeof webUsers.$inferInsert> = {};

  if (body.name !== undefined) updates.name = body.name;

  if (body.newPassword) {
    if (body.newPassword.length < 8) {
      return NextResponse.json({ error: "Пароль минимум 8 символов" }, { status: 400 });
    }
    if (user.passwordHash) {
      if (!body.oldPassword) return NextResponse.json({ error: "Укажите старый пароль" }, { status: 400 });
      const valid = await bcrypt.compare(body.oldPassword, user.passwordHash);
      if (!valid) return NextResponse.json({ error: "Неверный старый пароль" }, { status: 400 });
    }
    updates.passwordHash = await bcrypt.hash(body.newPassword, 12);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const [updated] = await db
    .update(webUsers)
    .set(updates)
    .where(eq(webUsers.id, session.user.id))
    .returning({ id: webUsers.id, email: webUsers.email, name: webUsers.name });

  return NextResponse.json({ user: updated });
}
