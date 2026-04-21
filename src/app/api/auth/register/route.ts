import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const { webUsers } = schema;

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json() as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Пароль минимум 8 символов" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: webUsers.id })
    .from(webUsers)
    .where(eq(webUsers.email, email))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "Email уже зарегистрирован" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(webUsers)
    .values({ email, name: name || undefined, passwordHash })
    .returning({ id: webUsers.id, email: webUsers.email, name: webUsers.name });

  return NextResponse.json({ user }, { status: 201 });
}
