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

// Clear token cache when refresh token changes (for development)
if (typeof process !== "undefined" && process.env.YOUTUBE_OWNER_REFRESH_TOKEN) {
  // Token will be refreshed on next request
}

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
      console.warn(
        "[youtube] Required environment variables:",
        {
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret,
          hasRefreshToken: !!refreshToken,
        }
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

  // Always refresh token to ensure we have latest scopes (cache might be stale)
  // In production, you might want to keep the cache check
  const shouldUseCache = false; // Set to true in production after verifying it works
  
  if (
    shouldUseCache &&
    ownerTokenCache &&
    ownerTokenCache.expiresAt > Date.now() + OWNER_TOKEN_EXPIRY_BUFFER_MS
  ) {
    return ownerTokenCache.accessToken;
  }

  // YouTube Members API requires these specific scopes
  const requiredScopes = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl";
  
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: "refresh_token",
    scope: requiredScopes,
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      "[youtube] Failed to refresh owner access token",
      response.status,
      errorText
    );
    try {
      const errorJson = JSON.parse(errorText);
      console.error("[youtube] Token refresh error details:", errorJson);
    } catch {
      // Not JSON, already logged as text
    }
    return null;
  }

  const data: {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  } = await response.json();

  if (!data.access_token) {
    console.error("[youtube] Response missing access_token field.");
    return null;
  }

  // Log the scopes we got back
  if (data.scope) {
    console.log("[youtube] Access token scopes:", data.scope);
  } else {
    console.warn("[youtube] No scope information in token response");
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
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", "1000");
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  console.log("[youtube] Fetching members from:", url.toString());
  console.log("[youtube] Using access token (first 20 chars):", ownerAccessToken.substring(0, 20) + "...");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${ownerAccessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      "[youtube] Failed to fetch membership page",
      response.status,
      errorText
    );
    try {
      const errorJson = JSON.parse(errorText);
      console.error("[youtube] Membership API error details:", errorJson);
      if (errorJson.error?.message) {
        console.error("[youtube] Error message:", errorJson.error.message);
      }
      
      // Provide helpful error message for common issues
      if (response.status === 403 && errorJson.error?.code === 403) {
        console.error("\n[youtube] ⚠️  TROUBLESHOOTING MEMBERS API ACCESS:");
        console.error("[youtube] 1. Ensure YouTube Data API v3 is enabled in Google Cloud Console");
        console.error("[youtube] 2. Verify the channel has memberships enabled");
        console.error("[youtube] 3. Check that the OAuth client has access to the Members API");
        console.error("[youtube] 4. The Members API may require channel verification or Partner Program status");
        console.error("[youtube] 5. Try testing the API directly in Google Cloud Console API Explorer\n");
      }
    } catch {
      // Not JSON, already logged as text
    }
    throw new Error("Failed to fetch YouTube memberships");
  }

  return response.json() as Promise<{
    items?: Array<{
      snippet?: {
        memberDetails?: {
          channelId?: string;
          displayName?: string;
        };
        membershipsDetails?: {
          membershipsLevelId?: string;
        };
      };
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
  console.log("[youtube] Starting membership cache hydration...");
  const ownerAccessToken = await fetchOwnerAccessToken();
  if (!ownerAccessToken) {
    console.error("[youtube] Cannot hydrate cache - no owner access token available. Check YOUTUBE_OWNER_* environment variables.");
    return null;
  }
  console.log("[youtube] Owner access token obtained, fetching members...");

  const membersByChannelId = new Map<string, MembershipInfo>();
  const membershipLevelIds = new Set<string>();

  let pageToken: string | undefined;
  try {
    do {
      const page = await fetchMembershipPage(ownerAccessToken, pageToken);
    console.log(
      "[youtube] membership page raw",
      JSON.stringify(page, null, 2)
    );
    page.items?.forEach((item) => {
      const channelId =
        item.snippet?.memberDetails?.channelId ??
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
  } catch (error) {
    // If we can't fetch members, log the error but don't fail completely
    console.error("[youtube] Failed to hydrate membership cache:", error);
    console.error("\n[youtube] ⚠️  IMPORTANT: YouTube Members API Access Issue");
    console.error("[youtube] The Members API may require:");
    console.error("[youtube] 1. Channel verification/Partner Program status");
    console.error("[youtube] 2. API access approval from Google");
    console.error("[youtube] 3. Channel memberships to be enabled");
    console.error("[youtube] Membership checking will be disabled until this is resolved.\n");
    return null;
  }

  const levelsById = new Map<string, string>();
  if (membershipLevelIds.size > 0) {
    try {
      const levelResponse = await fetchMembershipLevels(ownerAccessToken);
      console.log(
        "[youtube] membershipsLevels response",
        JSON.stringify(levelResponse, null, 2)
      );
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

  membersByChannelId.forEach((info) => {
    if (info.membershipLevelId) {
      info.tierName = levelsById.get(info.membershipLevelId) ?? null;
    }
  });

  console.log(
    "[youtube] hydrated membership cache",
    JSON.stringify(
      {
        memberCount: membersByChannelId.size,
        members: Array.from(membersByChannelId.values()).slice(0, 50),
      },
      null,
      2
    )
  );

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
    console.log("[youtube] getMembershipForChannel called with null/undefined channelId");
    return null;
  }

  const normalizedChannelId = channelId.toLowerCase();
  console.log("[youtube] Looking up membership for channel ID:", normalizedChannelId);

  try {
    const cache = await getMembershipCache();
    if (!cache) {
      console.warn("[youtube] Membership cache is null - check YOUTUBE_OWNER_* credentials");
      return null;
    }

    console.log("[youtube] Cache contains", cache.membersByChannelId.size, "members");
    const membership = cache.membersByChannelId.get(normalizedChannelId);
    
    if (membership) {
      console.log("[youtube] Found membership:", membership);
    } else {
      console.log("[youtube] No membership found for channel ID:", normalizedChannelId);
      // Log first few channel IDs in cache for debugging
      const sampleChannelIds = Array.from(cache.membersByChannelId.keys()).slice(0, 5);
      console.log("[youtube] Sample channel IDs in cache:", sampleChannelIds);
    }
    
    return membership ?? null;
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
