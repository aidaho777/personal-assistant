import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=no_code", req.url));
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=db", req.url));
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const redirectUri = `${baseUrl}/api/auth/link-google/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!tokens.access_token) {
      console.error("[LinkGoogle] Token exchange failed:", tokens);
      return NextResponse.redirect(new URL("/dashboard/settings?error=token_failed", req.url));
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = (await userInfoRes.json()) as { id?: string; email?: string };

    const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS linked_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          provider VARCHAR(32) NOT NULL,
          provider_account_id VARCHAR(255) NOT NULL,
          access_token TEXT,
          refresh_token TEXT,
          expires_at INTEGER,
          email VARCHAR(255),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      const existing = await sql`
        SELECT id, refresh_token FROM linked_accounts
        WHERE user_id = ${session.user.id}::uuid AND provider = 'google'
        LIMIT 1
      `;

      const expiresAt = tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null;

      if (existing.length > 0) {
        await sql`
          UPDATE linked_accounts SET
            access_token = ${tokens.access_token},
            refresh_token = COALESCE(${tokens.refresh_token ?? null}, refresh_token),
            expires_at = ${expiresAt},
            email = ${userInfo.email ?? null},
            updated_at = NOW()
          WHERE id = ${existing[0].id}::uuid
        `;
      } else {
        await sql`
          INSERT INTO linked_accounts (user_id, provider, provider_account_id, access_token, refresh_token, expires_at, email)
          VALUES (
            ${session.user.id}::uuid,
            'google',
            ${userInfo.id ?? "unknown"},
            ${tokens.access_token},
            ${tokens.refresh_token ?? null},
            ${expiresAt},
            ${userInfo.email ?? null}
          )
        `;
      }

      await sql.end();
    } catch (dbErr) {
      await sql.end().catch(() => {});
      throw dbErr;
    }

    console.log("[LinkGoogle] Successfully linked Google for user:", session.user.id);
    return NextResponse.redirect(new URL("/dashboard/settings?linked=google", req.url));
  } catch (error) {
    console.error("[LinkGoogle] Error:", error);
    return NextResponse.redirect(new URL("/dashboard/settings?error=unknown", req.url));
  }
}
