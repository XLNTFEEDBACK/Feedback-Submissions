import { NextAuthOptions, Session } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const adminEmails =
  process.env.ADMIN_EMAILS?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean) ?? [];

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        const normalizedEmail = user.email.toLowerCase();
        const isAdmin = adminEmails.includes(normalizedEmail);
        token.email = normalizedEmail;
        token.role = isAdmin ? "admin" : "user";
        token.isAdmin = isAdmin;
      }
      return token;
    },
    async session({
      session,
      token,
    }: {
      session: Session;
      token: {
        email?: string | null;
        role?: "admin" | "user";
        isAdmin?: boolean;
      };
    }) {
      if (session.user) {
        if (token.email) {
          session.user.email = token.email;
        } else if (session.user.email) {
          session.user.email = session.user.email.toLowerCase();
        }
        session.user.role = token.role ?? "user";
        session.user.isAdmin = token.isAdmin ?? false;
      }
      return session;
    },
  },
};
