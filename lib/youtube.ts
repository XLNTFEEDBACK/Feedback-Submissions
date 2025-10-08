const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const YOUTUBE_MEMBERS_ENDPOINT =
  "https://youtube.googleapis.com/youtube/v3/members";
const YOUTUBE_CHANNELS_ENDPOINT =
  "https://youtube.googleapis.com/youtube/v3/channels?part=id&mine=true";

type MembershipInfo = {
  channelId: string;
  displayName?: string;
  tier?: string;
};

type MembershipCache = {
  expiresAt: number;
  membersByChannelId: Map<string, MembershipInfo>;
};

let ownerTokenCache:
  | {
      accessToken: string;
      expiresAt: number;
    }
  | undefined;

let membershipCache: MembershipCache | undefined;
let warnedMissingOwnerCredentials = false;

const MEMBERSHIP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OWNER_TOKEN_EXPIRY_BUFFER_MS = 45 * 1000; // 45 second safety window

const getOwnerCredentials = () => {
  const clientId = process.env.YOUTUBE_OWNER_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OWNER_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OWNER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    if (!warnedMissingOwnerCredentials) {
      warnedMissingOwnerCredentials = true;
      console.warn(
        "[youtube] Missing YOUTUBE_OWNER_* credentials; membership checks are disabled."
      );
    }
    return null;
  }

  return { clientId, clientSecret, refreshToken };
};

const fetchOwnerAccessToken = async (): Promise<string | null> => {
  const credentials = getOwnerCredentials();
  if (!credentials) {
    return null;
  }

  if (
    ownerTokenCache &&
    ownerTokenCache.expiresAt > Date.now() + OWNER_TOKEN_EXPIRY_BUFFER_MS
  ) {
    return ownerTokenCache.accessToken;
  }

  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error(
      "[youtube] Failed to refresh owner access token",
      response.status,
      await response.text()
    );
    return null;
  }

  const data: {
    access_token?: string;
    expires_in?: number;
  } = await response.json();

  if (!data.access_token) {
    console.error("[youtube] Response missing access_token field.");
    return null;
  }

  const expiresInSeconds = data.expires_in ?? 3600;
  ownerTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };

  return ownerTokenCache.accessToken;
};

const fetchMembershipPage = async (
  ownerAccessToken: string,
  pageToken?: string
) => {
  const url = new URL(YOUTUBE_MEMBERS_ENDPOINT);
  url.searchParams.set("part", "snippet,tier");
  url.searchParams.set("maxResults", "1000");
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${ownerAccessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(
      "[youtube] Failed to fetch membership page",
      response.status,
      await response.text()
    );
    throw new Error("Failed to fetch YouTube memberships");
  }

  return response.json() as Promise<{
    items?: Array<{
      snippet?: {
        memberDetails?: {
          channelId?: string;
          displayName?: string;
        };
      };
      tier?: string;
    }>;
    nextPageToken?: string;
  }>;
};

const hydrateMembershipCache = async (): Promise<MembershipCache | null> => {
  const ownerAccessToken = await fetchOwnerAccessToken();
  if (!ownerAccessToken) {
    return null;
  }

  const membersByChannelId = new Map<string, MembershipInfo>();

  let pageToken: string | undefined;
  do {
    const page = await fetchMembershipPage(ownerAccessToken, pageToken);
    page.items?.forEach((item) => {
      const channelId = item.snippet?.memberDetails?.channelId;
      if (!channelId) {
        return;
      }
      membersByChannelId.set(channelId.toLowerCase(), {
        channelId,
        displayName: item.snippet?.memberDetails?.displayName,
        tier: item.tier,
      });
    });
    pageToken = page.nextPageToken;
  } while (pageToken);

  membershipCache = {
    membersByChannelId,
    expiresAt: Date.now() + MEMBERSHIP_CACHE_TTL_MS,
  };

  return membershipCache;
};

const getMembershipCache = async (): Promise<MembershipCache | null> => {
  if (
    membershipCache &&
    membershipCache.expiresAt > Date.now() + OWNER_TOKEN_EXPIRY_BUFFER_MS
  ) {
    return membershipCache;
  }

  return hydrateMembershipCache();
};

export const getMembershipForChannel = async (
  channelId: string | null | undefined
): Promise<MembershipInfo | null> => {
  if (!channelId) {
    return null;
  }

  try {
    const cache = await getMembershipCache();
    if (!cache) {
      return null;
    }
    return cache.membersByChannelId.get(channelId.toLowerCase()) ?? null;
  } catch (error) {
    console.error(
      "[youtube] Failed to resolve membership for channel",
      channelId,
      error
    );
    return null;
  }
};

export const getUserChannelId = async (
  userAccessToken: string
): Promise<string | null> => {
  try {
    const response = await fetch(YOUTUBE_CHANNELS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        "[youtube] Failed to fetch user channel ID",
        response.status,
        body
      );
      return null;
    }

    const data: {
      items?: Array<{ id?: string }>;
    } = await response.json();

    const channelId = data.items?.[0]?.id;
    return channelId ?? null;
  } catch (error) {
    console.error("[youtube] Error retrieving user channel ID", error);
    return null;
  }
};
