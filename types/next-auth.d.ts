import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      role?: "owner" | "admin" | "user";
      isAdmin?: boolean;
      isChannelOwner?: boolean;
      isMember?: boolean;
      isSubscriber?: boolean | null;
      membershipTier?: string | null;
      youtubeChannelId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "owner" | "admin" | "user";
    isAdmin?: boolean;
    isChannelOwner?: boolean;
    isMember?: boolean;
    isSubscriber?: boolean | null;
    membershipTier?: string | null;
    youtubeChannelId?: string | null;
    membershipCheckedAt?: number;
    subscriptionCheckedAt?: number;
  }
}

export {};
