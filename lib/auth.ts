import { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import {
  getMembershipForChannel,
  getUserChannelProfile,
  isUserSubscribedToChannel,
} from "@/lib/youtube";

const adminEmails =
  process.env.ADMIN_EMAILS?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean) ?? [];

const adminChannelIdsRaw =
  process.env.ADMIN_CHANNEL_IDS?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) ?? [];

const adminChannelIds = adminChannelIdsRaw.map((id) => id.toLowerCase());

const MEMBERSHIP_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const SUBSCRIPTION_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const targetChannelIdRaw =
  process.env.YOUTUBE_TARGET_CHANNEL_ID?.trim() ?? null;
const targetChannelIdNormalized =
  targetChannelIdRaw?.toLowerCase() ?? null;

const assignMembershipFlags = async (token: JWT) => {
  const channelId = token.youtubeChannelId as string | null | undefined;
  if (!channelId) {
    token.isMember = false;
    token.membershipTier = null;
    token.membershipLevelId = null;
    return;
  }

  const membership = await getMembershipForChannel(channelId);
  token.isMember = Boolean(membership);
  token.membershipTier = membership?.tierName ?? null;
  token.membershipLevelId = membership?.membershipLevelId ?? null;
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
          const { channelId, title, avatarUrl } = await getUserChannelProfile(
            account.access_token
          );
          token.youtubeChannelId = channelId ?? null;
          token.youtubeChannelTitle = title ?? null;
          token.youtubeChannelAvatarUrl = avatarUrl ?? null;
          console.log(
            "[auth] resolved youtube profile",
            JSON.stringify(
              {
                channelId: token.youtubeChannelId,
                title: token.youtubeChannelTitle,
                avatarProvided: Boolean(token.youtubeChannelAvatarUrl),
              },
              null,
              2
            )
          );
        } catch (error) {
          console.error("[auth] Failed to get user channel ID", error);
          token.youtubeChannelId = null;
          token.youtubeChannelTitle = null;
          token.youtubeChannelAvatarUrl = null;
        }
        if (targetChannelIdRaw) {
          try {
            const subscriptionStatus = await isUserSubscribedToChannel(
              account.access_token,
              targetChannelIdRaw
            );
            if (subscriptionStatus !== null) {
              token.isSubscriber = subscriptionStatus;
              token.subscriptionCheckedAt = Date.now();
            }
          } catch (error) {
            console.error(
              "[auth] Failed to resolve subscription status",
              error
            );
          }
        }
      }

      applyAdminFlags(token);

      if (token.youtubeChannelId) {
        console.log(
          "[auth] normalized youtube channel id",
          token.youtubeChannelId
        );
      }

      const shouldRefreshMembership =
        token.youtubeChannelId &&
        (!token.membershipCheckedAt ||
          Date.now() - (token.membershipCheckedAt as number) >
            MEMBERSHIP_REFRESH_INTERVAL_MS);

      const shouldRefreshSubscription =
        targetChannelIdNormalized &&
        (!token.subscriptionCheckedAt ||
          Date.now() - (token.subscriptionCheckedAt as number) >
            SUBSCRIPTION_REFRESH_INTERVAL_MS);

      if (account?.access_token || shouldRefreshMembership) {
        try {
          await assignMembershipFlags(token);
          console.log(
            "[auth] membership result",
            JSON.stringify(
              {
                channelId: token.youtubeChannelId,
                isMember: token.isMember,
                tier: token.membershipTier,
                membershipLevelId: token.membershipLevelId,
              },
              null,
              2
            )
          );
        } catch (error) {
          console.error("[auth] Failed to resolve membership status", error);
        }
      }

      if (
        shouldRefreshSubscription &&
        typeof token.isSubscriber !== "boolean"
      ) {
        token.isSubscriber = null;
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
        isSubscriber?: boolean | null;
        membershipTier?: string | null;
        youtubeChannelId?: string | null;
        membershipLevelId?: string | null;
        youtubeChannelTitle?: string | null;
        youtubeChannelAvatarUrl?: string | null;
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
        session.user.isSubscriber =
          token.isSubscriber ?? null;
        session.user.membershipTier = token.membershipTier ?? null;
        session.user.membershipLevelId = token.membershipLevelId ?? null;
        session.user.youtubeChannelId = token.youtubeChannelId ?? null;
        session.user.youtubeChannelTitle =
          token.youtubeChannelTitle ?? null;
        session.user.youtubeChannelAvatarUrl =
          token.youtubeChannelAvatarUrl ?? null;
      }
      return session;
    },
  },
};
