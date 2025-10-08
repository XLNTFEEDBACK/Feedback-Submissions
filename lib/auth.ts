import { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import { getMembershipForChannel, getUserChannelId } from "@/lib/youtube";

const adminEmails =
  process.env.ADMIN_EMAILS?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean) ?? [];

const adminChannelIds =
  process.env.ADMIN_CHANNEL_IDS?.split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean) ?? [];

const MEMBERSHIP_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const assignMembershipFlags = async (token: JWT) => {
  const channelId = token.youtubeChannelId as string | null | undefined;
  if (!channelId) {
    token.isMember = false;
    token.membershipTier = null;
    return;
  }

  const membership = await getMembershipForChannel(channelId);
  token.isMember = Boolean(membership);
  token.membershipTier = membership?.tier ?? null;
  token.membershipCheckedAt = Date.now();
};

const applyAdminFlags = (token: JWT) => {
  const normalizedEmail =
    typeof token.email === "string" ? token.email.toLowerCase() : undefined;
  const normalizedChannelId =
    typeof token.youtubeChannelId === "string"
      ? token.youtubeChannelId.toLowerCase()
      : undefined;

  const emailIsAdmin = normalizedEmail
    ? adminEmails.includes(normalizedEmail)
    : false;
  const channelIsAdmin = normalizedChannelId
    ? adminChannelIds.includes(normalizedChannelId)
    : false;

  const isChannelOwner = channelIsAdmin;
  const isAdmin = emailIsAdmin || channelIsAdmin;

  token.isAdmin = isAdmin;
  token.isChannelOwner = isChannelOwner;
  token.role = isChannelOwner ? "owner" : isAdmin ? "admin" : "user";
};

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/youtube.readonly",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user?.email) {
        const normalizedEmail = user.email.toLowerCase();
        token.email = normalizedEmail;
      }

      if (account?.access_token) {
        try {
          const channelId = await getUserChannelId(account.access_token);
          token.youtubeChannelId = channelId ?? null;
        } catch (error) {
          console.error("[auth] Failed to get user channel ID", error);
          token.youtubeChannelId = null;
        }
      }

      applyAdminFlags(token);

      const shouldRefreshMembership =
        token.youtubeChannelId &&
        (!token.membershipCheckedAt ||
          Date.now() - (token.membershipCheckedAt as number) >
            MEMBERSHIP_REFRESH_INTERVAL_MS);

      if (account?.access_token || shouldRefreshMembership) {
        try {
          await assignMembershipFlags(token);
        } catch (error) {
          console.error("[auth] Failed to resolve membership status", error);
        }
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
        role?: "owner" | "admin" | "user";
        isAdmin?: boolean;
        isChannelOwner?: boolean;
        isMember?: boolean;
        membershipTier?: string | null;
        youtubeChannelId?: string | null;
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
        session.user.isChannelOwner = token.isChannelOwner ?? false;
        session.user.isMember = token.isMember ?? false;
        session.user.membershipTier = token.membershipTier ?? null;
        session.user.youtubeChannelId = token.youtubeChannelId ?? null;
      }
      return session;
    },
  },
};
