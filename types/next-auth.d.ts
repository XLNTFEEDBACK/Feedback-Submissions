import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      role?: "owner" | "admin" | "user";
      isAdmin?: boolean;
      isChannelOwner?: boolean;
      isSubscriber?: boolean | null;
      youtubeChannelId?: string | null;
      youtubeChannelTitle?: string | null;
      youtubeChannelAvatarUrl?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "owner" | "admin" | "user";
    isAdmin?: boolean;
    isChannelOwner?: boolean;
    isSubscriber?: boolean | null;
    youtubeChannelId?: string | null;
    youtubeChannelTitle?: string | null;
    youtubeChannelAvatarUrl?: string | null;
    subscriptionCheckedAt?: number;
  }
}

export {};
