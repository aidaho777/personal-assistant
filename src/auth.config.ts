import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      const publicPaths = ["/login", "/register"];
      const isPublic = pathname === "/" || publicPaths.some(p => pathname.startsWith(p));
      const isApiAuth = pathname.startsWith("/api/auth");
      const isBotApi = pathname.startsWith("/api/telegram") || pathname.startsWith("/api/health");

      if (isPublic || isApiAuth || isBotApi) return true;
      if (isLoggedIn) return true;

      return Response.redirect(new URL("/login", request.nextUrl));
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  providers: [],
};
