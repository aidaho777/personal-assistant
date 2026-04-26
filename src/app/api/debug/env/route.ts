import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "set (" + process.env.GOOGLE_CLIENT_ID.substring(0, 10) + "...)" : "MISSING",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "set" : "MISSING",
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "MISSING",
    DATABASE_PUBLIC_URL: process.env.DATABASE_PUBLIC_URL ? "set" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "MISSING",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "set" : "MISSING",
    AUTH_SECRET: process.env.AUTH_SECRET ? "set" : "MISSING",
    NODE_ENV: process.env.NODE_ENV,
  });
}
