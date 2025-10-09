const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const YOUTUBE_MEMBERS_ENDPOINT =
  "https://youtube.googleapis.com/youtube/v3/members";
const YOUTUBE_MEMBERSHIP_LEVELS_ENDPOINT =
  "https://youtube.googleapis.com/youtube/v3/membershipsLevels";
const YOUTUBE_CHANNELS_ENDPOINT =
  "https://youtube.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true";

type MembershipInfo = {
  channelId: string;
  displayName?: string;
  membershipLevelId?: string | null;
  tierName?: string | null;
};

type MembershipCache = {
  expiresAt: number;
  membersByChannelId: Map<string, MembershipInfo>;
  levelsById: Map<string, string>;
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
  url.searchParams.set("part", "snippet,memberDetails,membershipsDetails");
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

const fetchMembershipLevels = async (ownerAccessToken: string) => {
  const url = new URL(YOUTUBE_MEMBERSHIP_LEVELS_ENDPOINT);
  url.searchParams.set("part", "snippet");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${ownerAccessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(
      "[youtube] Failed to fetch membership levels",
      response.status,
      await response.text()
    );
    return null;
  }

  return response.json() as Promise<{
    items?: Array<{
      id?: string;
      snippet?: {
        displayName?: string;
      };
    }>;
  }>;
};

const hydrateMembershipCache = async (): Promise<MembershipCache | null> => {
  const ownerAccessToken = await fetchOwnerAccessToken();
  if (!ownerAccessToken) {
    return null;
  }

  const membersByChannelId = new Map<string, MembershipInfo>();
  const membershipLevelIds = new Set<string>();

  let pageToken: string | undefined;
  do {
    const page = await fetchMembershipPage(ownerAccessToken, pageToken);
    page.items?.forEach((item) => {
      const channelId =
        item.snippet?.memberDetails?.channelId ??
        item.snippet?.channelId ??
        null;
      if (!channelId) {
        return;
      }
      const membershipLevelId =
        item.snippet?.membershipsDetails?.membershipsLevelId ?? null;
      if (membershipLevelId) {
        membershipLevelIds.add(membershipLevelId);
      }
      membersByChannelId.set(channelId.toLowerCase(), {
        channelId,
        displayName: item.snippet?.memberDetails?.displayName,
        membershipLevelId,
      });
    });
    pageToken = page.nextPageToken;
  } while (pageToken);

  const levelsById = new Map<string, string>();
  if (membershipLevelIds.size > 0) {
    try {
      const levelResponse = await fetchMembershipLevels(ownerAccessToken);
      levelResponse?.items?.forEach((level) => {
        const id = level.id;
        const name = level.snippet?.displayName;
        if (id && name) {
          levelsById.set(id, name);
        }
      });
    } catch (error) {
      console.error("[youtube] Unable to resolve membership level names", error);
    }
  }

  membersByChannelId.forEach((info, key) => {
    if (info.membershipLevelId) {
      info.tierName = levelsById.get(info.membershipLevelId) ?? null;
    }
  });

  membershipCache = {
    membersByChannelId,
    levelsById,
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

export const getUserChannelProfile = async (
  userAccessToken: string
): Promise<{ channelId: string | null; title: string | null; avatarUrl: string | null }> => {
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
      return { channelId: null, title: null, avatarUrl: null };
    }

    const data: {
      items?: Array<{ id?: string; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> } }>;
    } = await response.json();

    const channel = data.items?.[0];
    const channelId = channel?.id ?? null;
    const title = channel?.snippet?.title ?? null;
    const avatarUrl =
      channel?.snippet?.thumbnails?.medium?.url ??
      channel?.snippet?.thumbnails?.default?.url ??
      null;

    return { channelId, title, avatarUrl };
  } catch (error) {
    console.error("[youtube] Error retrieving user channel ID", error);
    return { channelId: null, title: null, avatarUrl: null };
  }
};

export const isUserSubscribedToChannel = async (
  userAccessToken: string,
  targetChannelId: string
): Promise<boolean | null> => {
  try {
    const url = new URL(
      "https://youtube.googleapis.com/youtube/v3/subscriptions"
    );
    url.searchParams.set("part", "id");
    url.searchParams.set("forChannelId", targetChannelId);
    url.searchParams.set("mine", "true");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        "[youtube] Failed to fetch subscription status",
        response.status,
        body
      );
      return null;
    }

    const data: {
      pageInfo?: { totalResults?: number };
    } = await response.json();

    return (data.pageInfo?.totalResults ?? 0) > 0;
  } catch (error) {
    console.error("[youtube] Error retrieving subscription status", error);
    return null;
  }
};
