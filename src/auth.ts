import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

const { webUsers } = schema;

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(webUsers)
          .where(eq(webUsers.email, email))
          .limit(1);

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        await db
          .update(webUsers)
          .set({ lastLoginAt: new Date() })
          .where(eq(webUsers.id, user.id));

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.avatarUrl ?? undefined,
          role: user.role,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const [existing] = await db
          .select()
          .from(webUsers)
          .where(eq(webUsers.email, user.email))
          .limit(1);

        if (!existing) {
          const [created] = await db
            .insert(webUsers)
            .values({
              email: user.email,
              name: user.name ?? undefined,
              avatarUrl: user.image ?? undefined,
            })
            .returning({ id: webUsers.id });
          user.id = created.id;
        } else {
          await db
            .update(webUsers)
            .set({ lastLoginAt: new Date() })
            .where(eq(webUsers.id, existing.id));
          user.id = existing.id;
        }
      }
      return true;
    },
  },
});
