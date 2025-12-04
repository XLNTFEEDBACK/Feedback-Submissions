"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SVGProps } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../firebase/firebase";
import Logo from "../components/Logo";

// ============================================================================
// SOCIAL MEDIA LINKS CONFIGURATION
// ============================================================================
// Update the URLs below with your actual social media links:
const SOCIAL_LINKS = {
  tiktok: "https://www.tiktok.com/@xlntsound", // TODO: Replace with your TikTok URL
  instagram: "https://www.instagram.com/xlntsound", // TODO: Replace with your Instagram URL
  youtube: "https://www.youtube.com/@xlntsound", // TODO: Replace with your YouTube URL
  patreon: "https://www.patreon.com/xlntsound", // TODO: Replace with your Patreon URL
  spotifyPodcast: "https://open.spotify.com/show/5Tq6mDpe4HsMavswgPwMGo?si=SPweOWJ4Q6WdxkEzEQSpSQ", // TODO: Replace with your Spotify Podcast URL
  xlntStore: "https://xlntsound.com", // TODO: Replace with your XLNT Sound Store URL
};
// ============================================================================

interface Submission {
  id: string;
  soundcloudLink: string;
  email?: string;
  priority?: boolean;
  order?: number;
  timestamp?: { toMillis?: () => number } | null;
  youtubeChannelId?: string | null;
  youtubeChannelTitle?: string | null;
  youtubeChannelAvatarUrl?: string | null;
  submittedByRole?: string;
  isChannelOwner?: boolean;
  isSubscriber?: boolean | null;
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
}

const getTrackDisplay = (url: string) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    // Filter out secret token segment (starts with 's-')
    const filteredSegments = segments.filter(seg => !seg.startsWith('s-'));

    // Helper to format track names (replace dashes/underscores with spaces, capitalize)
    const formatTrackName = (name: string): string => {
      return decodeURIComponent(name)
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    };

    if (filteredSegments.length >= 2) {
      const artist = formatTrackName(filteredSegments[filteredSegments.length - 2]);
      const track = formatTrackName(filteredSegments[filteredSegments.length - 1]);
      return {
        artist,
        track,
        display: `${artist} – ${track}`,
      };
    }

    if (filteredSegments.length === 1) {
      const track = formatTrackName(filteredSegments[0]);
      return {
        artist: null,
        track,
        display: track,
      };
    }
  } catch {
    // noop
  }

  return {
    artist: null,
    track: null,
    display: url,
  };
};

// Detect if a SoundCloud URL is a private track (contains secret token)
const isPrivateTrack = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes('/s-');
  } catch {
    return false;
  }
};

// Detect if a URL is a shortened SoundCloud link
const isShortenedLink = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'on.soundcloud.com';
  } catch {
    return false;
  }
};

const buildSocialLink = (
  handle: string | null | undefined,
  platform: "instagram" | "tiktok"
) => {
  if (!handle) return null;
  let cleaned = handle.trim();
  if (!cleaned) return null;

  const isUrl = /^https?:\/\//i.test(cleaned);
  if (isUrl) {
    return {
      url: cleaned,
      display: cleaned,
    };
  }

  cleaned = cleaned.replace(/^@+/g, "");
  if (!cleaned) return null;

  if (platform === "instagram") {
    return {
      url: `https://www.instagram.com/${cleaned}`,
      display: `@${cleaned}`,
    };
  }

  return {
    url: `https://www.tiktok.com/@${cleaned}`,
    display: `@${cleaned}`,
  };
};

// Icons
const INSTAGRAM_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 7.4a2.9 2.9 0 1 1 0-5.8 2.9 2.9 0 0 1 0 5.8z" />
    <path d="M12.5 1h-9A2.5 2.5 0 0 0 1 3.5v9A2.5 2.5 0 0 0 3.5 15h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 12.5 1zm1 11.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9z" />
    <circle cx="12.1" cy="3.9" r=".9" />
  </svg>
);

const TIKTOK_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M15 5c-1.2 0-2.3-.4-3.2-1.1v6.3c0 3-2.4 5.3-5.4 5.3A5.3 5.3 0 0 1 1 10.2c0-2.9 2.3-5.2 5.2-5.3v2.7c-1 .1-1.8.9-1.8 1.9 0 1.1.9 2 2 2 1.1 0 2-.9 2-2V0h2.2c.2 1.7 1.6 3 3.4 3V5z" />
  </svg>
);

const YOUTUBE_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M15.32 4.06c-.434-.772-.905-.914-1.864-.967C12.498 3.03 10.089 3 8.002 3c-2.137 0-4.146.03-5.577.113-.86.053-1.33.194-1.864.967-.31.577-.31 1.936-.31 3.935v.12c0 1.999 0 3.358.31 3.935.434.772.905.914 1.864.967C3.856 12.97 5.865 13 8.002 13c2.137 0 4.146-.03 5.577-.113.86-.053 1.33-.194 1.864-.967.31-.577.31-1.936.31-3.935v-.12c0-1.999 0-3.358-.31-3.935zM6 10V6l5 2-5 2z" />
  </svg>
);

const PATREON_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M10.5 2C7.468 2 5 4.468 5 7.5S7.468 13 10.5 13 16 10.532 16 7.5 13.532 2 10.5 2zM2 2v12h2V2H2z" />
  </svg>
);

const SPOTIFY_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.68 11.54c-.16 0-.32-.08-.4-.24-1.12-.96-2.56-1.48-4.08-1.48-.72 0-1.44.08-2.12.24-.24.08-.48-.08-.56-.32-.08-.24.08-.48.32-.56.8-.16 1.6-.24 2.4-.24 1.68 0 3.28.56 4.56 1.6.2.16.24.44.08.64-.08.16-.24.24-.4.24zm.56-2.24c-.2 0-.36-.08-.48-.28-1.24-1.08-2.84-1.68-4.52-1.68-.8 0-1.6.12-2.32.32-.28.08-.56-.08-.64-.36-.08-.28.08-.56.36-.64.84-.24 1.72-.36 2.6-.36 1.88 0 3.68.68 5.08 1.92.24.2.28.52.08.76-.12.16-.28.32-.48.32zm.64-2.4c-.24 0-.44-.12-.56-.32-1.4-1.2-3.16-1.88-4.96-1.88-.92 0-1.84.12-2.68.36-.32.08-.64-.12-.72-.44-.08-.32.12-.64.44-.72.96-.28 1.96-.4 2.96-.4 2.04 0 4 .76 5.56 2.12.24.2.28.56.08.8-.12.2-.32.32-.56.32z" />
  </svg>
);

const STORE_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
    <path d="M3 3.5C3 2.67 3.67 2 4.5 2h7c.83 0 1.5.67 1.5 1.5V4h1c.55 0 1 .45 1 1v9c0 .55-.45 1-1 1H2c-.55 0-1-.45-1-1V5c0-.55.45-1 1-1h1v-.5zM4.5 3a.5.5 0 0 0-.5.5V4h8v-.5a.5.5 0 0 0-.5-.5h-7zM2 5v9h12V5H2z" />
  </svg>
);

// Tooltip wrapper component
const TooltipWrapper = ({ children, tooltip }: { children: React.ReactNode; tooltip: string }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    const timeout = setTimeout(() => {
      setShowTooltip(true);
    }, 1000);
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setShowTooltip(false);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {showTooltip && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.2 }}
          className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm border border-white/10"
        >
          {tooltip}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-black/90 border-l border-t border-white/10" />
        </motion.div>
      )}
    </div>
  );
};

const ARROW_UP_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8 12V4M4 8l4-4 4 4" />
  </svg>
);

const ARROW_DOWN_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8 4v8M12 8l-4 4-4-4" />
  </svg>
);

const TRASH_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 4h12M5.5 4V2.5A1.5 1.5 0 0 1 7 1h2a1.5 1.5 0 0 1 1.5 1.5V4m2 0v9.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2.5 13.5V4" />
  </svg>
);

const EDIT_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M11.5 2L14 4.5 6.5 12H4v-2.5L11.5 2z" />
  </svg>
);

const CHECK_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 8l3 3 7-7" />
  </svg>
);

const RESET_ICON = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M1.333 8a6.667 6.667 0 1 0 13.334 0 6.667 6.667 0 0 0-13.334 0z" />
    <path d="M5.333 4L2.667 6.667l2.666 2.666" />
    <path d="M2.667 6.667h3.333a4 4 0 0 1 4 4v0" />
    <path d="M10.667 12l2.666-2.667L10.667 6.667" />
    <path d="M13.333 9.333h-3.333a4 4 0 0 1-4-4v0" />
  </svg>
);

declare global {
  interface Window {
    SC?: {
      Widget?: (
        iframe: HTMLIFrameElement
      ) => {
        bind: (event: string, listener: () => void) => void;
        unbind: (event: string, listener: () => void) => void;
        setVolume: (volume: number) => void;
        getVolume: (callback: (volume: number) => void) => void;
      };
    };
  }
}

export default function QueuePage() {
  const { data: session } = useSession();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [widgetReady, setWidgetReady] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearConfirmSecond, setClearConfirmSecond] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const clearConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevPlayingIdRef = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSoundcloudLink, setEditSoundcloudLink] = useState("");
  const [editInstagramHandle, setEditInstagramHandle] = useState("");
  const [editTiktokHandle, setEditTiktokHandle] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isAdmin = session?.user?.isAdmin ?? false;
  const userEmail = session?.user?.email?.toLowerCase();
  const userChannelId = session?.user?.youtubeChannelId?.toLowerCase();

  // Check if user has a submission in the queue
  const hasSubmission = useMemo(() => {
    if (!userEmail && !userChannelId) return false;
    return submissions.some((sub) => {
      const submissionEmail = sub.email?.toLowerCase();
      const submissionChannelId = sub.youtubeChannelId?.toLowerCase();
      return (
        (userEmail && userEmail === submissionEmail) ||
        (userChannelId &&
          submissionChannelId &&
          userChannelId === submissionChannelId)
      );
    });
  }, [submissions, userEmail, userChannelId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.SC?.Widget) {
      setWidgetReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.onload = () => setWidgetReady(true);
    document.body.appendChild(script);
    return () => {
      script.onload = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (clearConfirmTimeoutRef.current) {
        clearTimeout(clearConfirmTimeoutRef.current);
      }
    };
  }, []);

  // Track last played submission when currentPlayingId changes
  useEffect(() => {
    if (currentPlayingId && prevPlayingIdRef.current !== currentPlayingId) {
      // Previous playing ID is now the last played
      if (prevPlayingIdRef.current) {
        setLastPlayedId(prevPlayingIdRef.current);
      }
      prevPlayingIdRef.current = currentPlayingId;
    }
  }, [currentPlayingId]);

  const sortedSubmissions = useMemo(() => {
    const orderRank = (submission: Submission) =>
      typeof submission.order === "number"
        ? submission.order
        : submission.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

    // Simple FIFO queue - sort only by order/timestamp, no prioritization
    return submissions
      .slice()
      .sort((a, b) => {
        const orderA = orderRank(a);
        const orderB = orderRank(b);
        
        // If orders are equal, fall back to timestamp
        if (orderA === orderB) {
          const timeA = a.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
          const timeB = b.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
          return timeA - timeB;
        }
        
        return orderA - orderB;
      });
  }, [submissions]);

  useEffect(() => {
    const validIds = new Set(sortedSubmissions.map((sub) => sub.id));

    setExpandedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });

    setCollapsedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });

    setPlayedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });

    setCurrentPlayingId((prev) => (prev && validIds.has(prev) ? prev : null));
  }, [sortedSubmissions]);

  const AUTO_EXPANDED_COUNT = 5;

  const autoExpandedIds = useMemo(() => {
    const result = new Set<string>();
    for (const submission of sortedSubmissions) {
      if (result.size >= AUTO_EXPANDED_COUNT) {
        break;
      }
      if (collapsedIds.has(submission.id)) {
        continue;
      }
      result.add(submission.id);
    }
    return result;
  }, [sortedSubmissions, collapsedIds]);

  const autoExpandedRef = useRef(autoExpandedIds);
  useEffect(() => {
    autoExpandedRef.current = autoExpandedIds;
  }, [autoExpandedIds]);

  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (!autoExpandedIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [autoExpandedIds]);

  const collapsedIdsRef = useRef(collapsedIds);
  useEffect(() => {
    collapsedIdsRef.current = collapsedIds;
  }, [collapsedIds]);

  const handleToggleExpand = useCallback((id: string, isExpanded: boolean) => {
    const isAutoManaged =
      autoExpandedRef.current.has(id) || collapsedIdsRef.current.has(id);
    if (isAutoManaged) {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (isExpanded) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    } else {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (isExpanded) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }
  }, []);

  const handlePlay = useCallback(
    (id: string) => {
      if (currentPlayingId === id) {
        return;
      }

      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        if (currentPlayingId && autoExpandedRef.current.has(currentPlayingId)) {
          next.add(currentPlayingId);
        }
        return next;
      });

      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (currentPlayingId && !autoExpandedRef.current.has(currentPlayingId)) {
          next.delete(currentPlayingId);
        }
        if (!autoExpandedRef.current.has(id)) {
          next.add(id);
        }
        return next;
      });

      setPlayedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      setCurrentPlayingId(id);
    },
    [currentPlayingId]
  );

  const handleClearQueue = useCallback(async () => {
    // First click: show first confirmation
    if (!clearConfirm) {
      setClearConfirm(true);
      if (clearConfirmTimeoutRef.current) {
        clearTimeout(clearConfirmTimeoutRef.current);
      }
      clearConfirmTimeoutRef.current = setTimeout(() => {
        setClearConfirm(false);
        setClearConfirmSecond(false);
        clearConfirmTimeoutRef.current = null;
      }, 5000);
      return;
    }

    // Second click: show second confirmation
    if (!clearConfirmSecond) {
      setClearConfirmSecond(true);
      if (clearConfirmTimeoutRef.current) {
        clearTimeout(clearConfirmTimeoutRef.current);
      }
      clearConfirmTimeoutRef.current = setTimeout(() => {
        setClearConfirm(false);
        setClearConfirmSecond(false);
        clearConfirmTimeoutRef.current = null;
      }, 5000);
      return;
    }

    // Third click: actually clear the queue
    setClearLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const response = await fetch("/api/queue/clear", {
        method: "POST",
      });

      if (!response.ok) {
        let message = "Failed to clear queue.";
        try {
          const data = await response.json();
          if (data?.error) {
            message = data.error;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      setActionNotice("Queue cleared successfully.");
    } catch (error) {
      console.error("Failed to clear queue", error);
      setActionError(
        error instanceof Error ? error.message : "Failed to clear queue."
      );
    } finally {
      setClearLoading(false);
      setClearConfirm(false);
      setClearConfirmSecond(false);
      if (clearConfirmTimeoutRef.current) {
        clearTimeout(clearConfirmTimeoutRef.current);
        clearConfirmTimeoutRef.current = null;
      }
    }
  }, [clearConfirm, clearConfirmSecond]);

  useEffect(() => {
    const submissionsRef = collection(db, "submissions");

    const unsubscribe = onSnapshot(submissionsRef, (snapshot) => {
      const subs: Submission[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        soundcloudLink: doc.data().soundcloudLink,
        email: doc.data().email,
        priority: doc.data().priority,
        order: doc.data().order,
        timestamp: doc.data().timestamp ?? null,
        youtubeChannelId: doc.data().youtubeChannelId ?? null,
        youtubeChannelTitle: doc.data().youtubeChannelTitle ?? null,
        youtubeChannelAvatarUrl: doc.data().youtubeChannelAvatarUrl ?? null,
        submittedByRole: doc.data().submittedByRole,
        isChannelOwner: doc.data().isChannelOwner,
        isSubscriber: doc.data().isSubscriber,
        instagramHandle: doc.data().instagramHandle ?? null,
        tiktokHandle: doc.data().tiktokHandle ?? null,
      })) as Submission[];
      setSubmissions(subs);
    });

    return () => unsubscribe();
  }, []);

  const swapOrder = async (
    current: Submission,
    target: Submission
  ): Promise<void> => {
    const response = await fetch("/api/queue/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentId: current.id,
        targetId: target.id,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to reorder submissions");
    }
  };

  const moveToTop = async (submissionId: string): Promise<void> => {
    const response = await fetch("/api/queue/move-to-top", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to move submission to top");
    }
  };

  const moveAfter = async (submissionId: string, targetId: string): Promise<void> => {
    const response = await fetch("/api/queue/move-after", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId,
        targetId,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to move submission after target");
    }
  };

  const handleMove = async (submissionId: string, direction: "up" | "down") => {
    if (!isAdmin || pendingActionId) {
      return;
    }

    setActionError(null);
    setActionNotice(null);
    const currentIndex = sortedSubmissions.findIndex(
      (submission) => submission.id === submissionId
    );

    if (currentIndex === -1) {
      return;
    }

    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= sortedSubmissions.length) {
      return;
    }

    const current = sortedSubmissions[currentIndex];
    const target = sortedSubmissions[targetIndex];

    try {
      setPendingActionId(submissionId);

      await swapOrder(current, target);

      setSubmissions((prev) => {
        const updated = prev.map((submission) => {
          if (submission.id === current.id) {
            return {
              ...submission,
              order:
                typeof target.order === "number"
                  ? target.order
                  : target.timestamp?.toMillis?.() ?? 0,
            };
          }
          if (submission.id === target.id) {
            return {
              ...submission,
              order:
                typeof current.order === "number"
                  ? current.order
                  : current.timestamp?.toMillis?.() ?? 0,
            };
          }
          return submission;
        });
        return updated;
      });
    } catch (error) {
      console.error("Failed to update submission order", error);
      setActionError("Failed to update submission order. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleMoveToTop = async (submissionId: string) => {
    if (!isAdmin || pendingActionId) {
      return;
    }

    setActionError(null);
    setActionNotice(null);

    try {
      setPendingActionId(submissionId);

      // Determine target: use currently playing track, or most recently played, or fall back to absolute top
      const targetId = currentPlayingId || lastPlayedId;

      if (targetId && targetId !== submissionId) {
        // Move after the target (currently playing or most recently played)
        await moveAfter(submissionId, targetId);
        setActionNotice("Submission moved after active track.");
      } else {
        // No target - move to absolute top (fallback behavior)
        await moveToTop(submissionId);
        setActionNotice("Submission moved to top of queue.");
      }

      setTimeout(() => setActionNotice(null), 3000);
    } catch (error) {
      console.error("Failed to move submission", error);
      setActionError("Failed to move submission. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleResetPlayed = useCallback((submissionId: string) => {
    setPlayedIds((prev) => {
      const next = new Set(prev);
      next.delete(submissionId);
      return next;
    });
  }, []);

  const handleRemove = async (submissionId: string) => {
    if (!isAdmin || pendingActionId) {
      return;
    }

    try {
      setPendingActionId(submissionId);
      setActionError(null);
      setActionNotice(null);

      const response = await fetch(`/api/queue/${submissionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete submission");
      }
    } catch (error) {
      console.error("Failed to remove submission", error);
      setActionError("Failed to remove submission. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleStartEdit = (submission: Submission) => {
    setEditingId(submission.id);
    setEditSoundcloudLink(submission.soundcloudLink);
    setEditInstagramHandle(submission.instagramHandle || "");
    setEditTiktokHandle(submission.tiktokHandle || "");
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditSoundcloudLink("");
    setEditInstagramHandle("");
    setEditTiktokHandle("");
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    setEditLoading(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/queue/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soundcloudLink: editSoundcloudLink,
          instagramHandle: editInstagramHandle,
          tiktokHandle: editTiktokHandle,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update submission");
      }

      setEditingId(null);
      setActionNotice("Submission updated successfully.");
      setTimeout(() => setActionNotice(null), 3000);
    } catch (error) {
      console.error("Failed to update submission", error);
      setEditError(
        error instanceof Error ? error.message : "Failed to update submission"
      );
    } finally {
      setEditLoading(false);
    }
  };

  const isOwnSubmission = (submission: Submission): boolean => {
    if (isAdmin) return true;
    const submissionEmail = submission.email?.toLowerCase();
    const submissionChannelId = submission.youtubeChannelId?.toLowerCase();
    return Boolean(
      (userEmail && userEmail === submissionEmail) ||
      (userChannelId &&
        submissionChannelId &&
        userChannelId === submissionChannelId)
    );
  };

  return (
    <div className="min-h-screen w-full bg-[var(--surface-void)] px-3 sm:px-4 pb-16 sm:pb-20 pt-16 sm:pt-20 text-white">
      {/* Logo in top left - aligned with top right buttons */}
      <Logo />
      
      {/* Toast Notifications - Top Right */}
      <AnimatePresence>
        {actionNotice && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.3 }}
            className="fixed top-20 right-4 z-50 rounded-xl border border-[var(--accent-cyan)]/30 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] px-6 py-4 text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent-cyan)] shadow-lg backdrop-blur-md"
          >
            {actionNotice}
          </motion.div>
        )}
        {actionError && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.3 }}
            className="fixed top-20 right-4 z-50 rounded-xl border border-[var(--accent-magenta)]/30 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] px-6 py-4 text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent-magenta)] shadow-lg backdrop-blur-md"
          >
            {actionError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation button in top right */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-3 right-3 sm:top-4 sm:right-4 z-10"
      >
        <Link
          href="/submit"
          className="group relative overflow-hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 sm:px-5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white/80 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white backdrop-blur-md hover:shadow-[0_0_20px_rgba(0,229,255,0.3)]"
        >
          <span className="relative z-10 whitespace-nowrap">
            {isAdmin || hasSubmission ? "Submission Form" : "Submit Song"}
          </span>
          <span className="absolute inset-0 bg-gradient-to-r from-[var(--accent-cyan)]/0 via-[var(--accent-cyan)]/10 to-[var(--accent-cyan)]/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </Link>
      </motion.div>

      {/* Clear Queue button in bottom left (admin only) */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-10"
        >
          <button
            onClick={handleClearQueue}
            disabled={clearLoading}
            className="group relative overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-[var(--accent-magenta)] to-purple-600 px-3 py-1.5 sm:px-5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,0,170,0.5)] disabled:cursor-not-allowed disabled:opacity-40 backdrop-blur-md"
          >
            <span className="relative z-10 whitespace-nowrap">
              {clearLoading
                ? "Clearing..."
                : clearConfirmSecond
                ? "Are you sure?"
                : clearConfirm
                ? "⚠ Confirm"
                : "Clear Queue"}
            </span>
            {(clearConfirm || clearConfirmSecond) && !clearLoading && (
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -top-7 sm:-top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[var(--accent-amber)]"
              >
                Click within 5s
              </motion.span>
            )}
          </button>
        </motion.div>
      )}

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="relative mx-auto mb-6 sm:mb-8 flex w-full max-w-5xl flex-col sm:flex-row sm:items-center sm:justify-between gap-4 overflow-hidden rounded-xl sm:rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] px-4 py-4 sm:px-10 sm:py-6 shadow-[0_20px_60px_-20px_rgba(0,229,255,0.2)]"
      >
        {/* Subtle accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-cyan)]/40 to-transparent" />

        {/* Left: Title */}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] text-white leading-tight">
            XLNT Feedback Queue
          </h1>
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white/40">
            Track • Review • Level Up
          </p>
        </div>

        {/* Right: Social Links */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {SOCIAL_LINKS.tiktok && (
            <TooltipWrapper tooltip="Visit TikTok">
              <motion.a
                href={SOCIAL_LINKS.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/50 transition-colors duration-300 hover:text-white"
                aria-label="TikTok"
              >
                <TIKTOK_ICON className="h-4 w-4 sm:h-5 sm:w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.instagram && (
            <TooltipWrapper tooltip="Visit Instagram">
              <motion.a
                href={SOCIAL_LINKS.instagram}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/50 transition-colors duration-300 hover:text-white"
                aria-label="Instagram"
              >
                <INSTAGRAM_ICON className="h-4 w-4 sm:h-5 sm:w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.youtube && (
            <TooltipWrapper tooltip="Visit YouTube">
              <motion.a
                href={SOCIAL_LINKS.youtube}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/50 transition-colors duration-300 hover:text-white"
                aria-label="YouTube"
              >
                <YOUTUBE_ICON className="h-4 w-4 sm:h-5 sm:w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.patreon && (
            <TooltipWrapper tooltip="Support on Patreon">
              <motion.a
                href={SOCIAL_LINKS.patreon}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/50 transition-colors duration-300 hover:text-white"
                aria-label="Patreon"
              >
                <PATREON_ICON className="h-4 w-4 sm:h-5 sm:w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.spotifyPodcast && (
            <TooltipWrapper tooltip="Listen on Spotify">
              <motion.a
                href={SOCIAL_LINKS.spotifyPodcast}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/50 transition-colors duration-300 hover:text-white"
                aria-label="Spotify Podcast"
              >
                <SPOTIFY_ICON className="h-4 w-4 sm:h-5 sm:w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
          {SOCIAL_LINKS.xlntStore && (
            <TooltipWrapper tooltip="Visit XLNT Store">
              <motion.a
                href={SOCIAL_LINKS.xlntStore}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/50 transition-colors duration-300 hover:text-white"
                aria-label="XLNT Sound Store"
              >
                <STORE_ICON className="h-4 w-4 sm:h-5 sm:w-5" />
              </motion.a>
            </TooltipWrapper>
          )}
        </div>
      </motion.header>

      <div className="mx-auto flex w-full max-w-5xl flex-col items-stretch gap-3 sm:gap-4">

        {sortedSubmissions.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-16 text-center text-sm font-semibold uppercase tracking-[0.3em] text-white/60"
          >
            No submissions yet.
          </motion.p>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.05 }}
            className="flex flex-col gap-4"
          >
            {sortedSubmissions.map((sub, index) => {
              const isPlaying = currentPlayingId === sub.id;
              const isExpanded =
                isPlaying || autoExpandedIds.has(sub.id) || expandedIds.has(sub.id);

              return (
                <QueueItem
                  key={`submission-${sub.id}`}
                  submission={sub}
                  index={index}
                  isExpanded={isExpanded}
                  isPlaying={isPlaying}
                  hasPlayed={playedIds.has(sub.id)}
                  onMove={handleMove}
                  onMoveToTop={handleMoveToTop}
                  onRemove={handleRemove}
                  pendingActionId={pendingActionId}
                  isAdmin={isAdmin}
                  total={sortedSubmissions.length}
                  onToggleExpand={handleToggleExpand}
                  onPlay={handlePlay}
                  widgetReady={widgetReady}
                  isOwnSubmission={isOwnSubmission(sub)}
                  isEditing={editingId === sub.id}
                  onStartEdit={() => handleStartEdit(sub)}
                  onCancelEdit={handleCancelEdit}
                  onSaveEdit={handleSaveEdit}
                  editSoundcloudLink={editSoundcloudLink}
                  editInstagramHandle={editInstagramHandle}
                  editTiktokHandle={editTiktokHandle}
                  setEditSoundcloudLink={setEditSoundcloudLink}
                  setEditInstagramHandle={setEditInstagramHandle}
                  setEditTiktokHandle={setEditTiktokHandle}
                  editLoading={editLoading}
                  editError={editError}
                  onResetPlayed={handleResetPlayed}
                />
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// Feature flag: Set to true to show badges on queue items
const SHOW_QUEUE_BADGES = false;

const QueueItem = ({
  submission,
  index,
  isExpanded,
  isPlaying,
  hasPlayed,
  onMove,
  onMoveToTop,
  onRemove,
  pendingActionId,
  isAdmin,
  total,
  onToggleExpand,
  onPlay,
  widgetReady,
  isOwnSubmission,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  editSoundcloudLink,
  editInstagramHandle,
  editTiktokHandle,
  setEditSoundcloudLink,
  setEditInstagramHandle,
  setEditTiktokHandle,
  editLoading,
  editError,
  onResetPlayed,
}: {
  submission: Submission;
  index: number;
  isExpanded: boolean;
  isPlaying: boolean;
  hasPlayed: boolean;
  onMove: (id: string, direction: "up" | "down") => void;
  onMoveToTop: (id: string) => void;
  onRemove: (id: string) => void;
  pendingActionId: string | null;
  isAdmin: boolean;
  total: number;
  onToggleExpand: (id: string, isExpanded: boolean) => void;
  onPlay: (id: string) => void;
  widgetReady: boolean;
  isOwnSubmission: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  editSoundcloudLink: string;
  editInstagramHandle: string;
  editTiktokHandle: string;
  setEditSoundcloudLink: (value: string) => void;
  setEditInstagramHandle: (value: string) => void;
  setEditTiktokHandle: (value: string) => void;
  editLoading: boolean;
  editError: string | null;
  onResetPlayed: (id: string) => void;
}) => {
  const position = index + 1;
  const trackInfo = getTrackDisplay(submission.soundcloudLink);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const wasPlayingRef = useRef(false);

  // State for checking shortened links
  const [isCheckingPrivate, setIsCheckingPrivate] = useState(false);
  const [checkedPrivateStatus, setCheckedPrivateStatus] = useState<boolean | null>(null);

  // Determine if track is private
  const isShortened = isShortenedLink(submission.soundcloudLink);
  const isPrivate = isShortened
    ? (checkedPrivateStatus ?? false) // Use checked status for shortened links
    : isPrivateTrack(submission.soundcloudLink); // Direct check for full URLs

  // Volume control state
  const [volume, setVolume] = useState<number>(70); // Default 70%
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [lastVolume, setLastVolume] = useState<number>(70); // For mute toggle
  const volumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if shortened link is private
  useEffect(() => {
    if (!isShortened || checkedPrivateStatus !== null) return;

    const checkPrivateStatus = async () => {
      setIsCheckingPrivate(true);
      try {
        const response = await fetch('/api/soundcloud/check-private', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: submission.soundcloudLink }),
        });

        const data = await response.json();
        setCheckedPrivateStatus(data.isPrivate ?? false);
      } catch (error) {
        console.error('Failed to check private status:', error);
        setCheckedPrivateStatus(false); // Default to public if check fails
      } finally {
        setIsCheckingPrivate(false);
      }
    };

    checkPrivateStatus();
  }, [isShortened, submission.soundcloudLink, checkedPrivateStatus]);

  // Load saved volume from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedVolume = localStorage.getItem('xlnt-soundcloud-volume');
    if (savedVolume) {
      const parsed = parseInt(savedVolume, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        setVolume(parsed);
        setLastVolume(parsed);
      }
    }
  }, []);

  // Save volume to localStorage when it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMuted) {
      localStorage.setItem('xlnt-soundcloud-volume', volume.toString());
    }
  }, [volume, isMuted]);

  // Reload iframe when track becomes active (switches to visual mode)
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      // Track just became active - reload with visual mode and auto_play
      setIframeKey(prev => prev + 1);
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!isExpanded || !widgetReady) {
      return;
    }
    const iframe = iframeRef.current;
    if (!iframe || !window.SC?.Widget) {
      return;
    }

    try {
      const widget = window.SC.Widget(iframe);
      if (!widget) {
        return;
      }
      const handlePlayEvent = () => onPlay(submission.id);
      widget.bind("play", handlePlayEvent);

      // Apply saved volume when widget is ready
      const handleReadyEvent = () => {
        const effectiveVolume = isMuted ? 0 : volume;
        widget.setVolume(effectiveVolume);
      };
      widget.bind("ready", handleReadyEvent);

      return () => {
        try {
          if (iframe && iframe.isConnected && window.SC?.Widget) {
            const cleanupWidget = window.SC.Widget(iframe);
            if (cleanupWidget) {
              // Suppress cross-origin postMessage warnings in dev mode
              try {
                cleanupWidget.unbind("play", handlePlayEvent);
              } catch (e) {
                // Ignore cross-origin errors during cleanup
              }
              try {
                cleanupWidget.unbind("ready", handleReadyEvent);
              } catch (e) {
                // Ignore cross-origin errors during cleanup
              }
            }
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      };
    } catch (error) {
      console.warn("Error initializing SoundCloud widget:", error);
    }
  }, [isExpanded, onPlay, submission.id, widgetReady, iframeKey, isPlaying, volume, isMuted]);

  // Determine highest privilege badge (consolidate hierarchy)
  const topBadge = submission.isChannelOwner ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-blue-500 to-cyan-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M8 0l2.469 4.995 5.531.805-4 3.894.944 5.506-4.944-2.598-4.944 2.598.944-5.506-4-3.894 5.531-.805z" />
      </svg>
      Owner
    </span>
  ) : !submission.isChannelOwner && submission.submittedByRole === "admin" ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-emerald-500 to-green-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      </svg>
      Admin
    </span>
  ) : submission.isSubscriber === true ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-orange-500 to-[var(--accent-amber)] px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M15 8L1 15V1l14 7z" />
      </svg>
      Subscriber
    </span>
  ) : null;

  const instagramLink = buildSocialLink(submission.instagramHandle, "instagram");
  const tiktokLink = buildSocialLink(submission.tiktokHandle, "tiktok");
  const socialLinks = [
    instagramLink && {
      label: "Instagram",
      icon: <INSTAGRAM_ICON className="h-3.5 w-3.5" />,
      ...instagramLink,
    },
    tiktokLink && {
      label: "TikTok",
      icon: <TIKTOK_ICON className="h-3.5 w-3.5" />,
      ...tiktokLink,
    },
  ].filter(Boolean) as Array<{
    label: string;
    icon: ReactNode;
    url: string;
    display: string;
  }>;

  // Volume change handlers
  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    setLastVolume(newVolume);

    if (isMuted) {
      setIsMuted(false);
    }

    // Debounce widget update
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }

    volumeTimeoutRef.current = setTimeout(() => {
      const iframe = iframeRef.current;
      if (iframe && window.SC?.Widget && widgetReady) {
        try {
          const widget = window.SC.Widget(iframe);
          widget.setVolume(newVolume);
        } catch (error) {
          console.warn('Failed to set volume:', error);
        }
      }
    }, 100); // 100ms debounce
  }, [isMuted, widgetReady]);

  const handleMuteToggle = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !window.SC?.Widget || !widgetReady) return;

    try {
      const widget = window.SC.Widget(iframe);

      if (isMuted) {
        // Unmute: restore last volume
        widget.setVolume(lastVolume);
        setIsMuted(false);
      } else {
        // Mute: set to 0
        widget.setVolume(0);
        setIsMuted(true);
      }
    } catch (error) {
      console.warn('Failed to toggle mute:', error);
    }
  }, [isMuted, lastVolume, widgetReady]);

  // Cleanup volume timeout on unmount
  useEffect(() => {
    return () => {
      if (volumeTimeoutRef.current) {
        clearTimeout(volumeTimeoutRef.current);
      }
    };
  }, []);

  // Handler for clicking private track link
  const handlePrivateTrackClick = useCallback(() => {
    onPlay(submission.id);
  }, [onPlay, submission.id]);

  // Dynamic card styling based on playback state
  const cardClasses = `w-full rounded-2xl border transition-all duration-300 ${
    isPlaying
      ? "border-[var(--accent-cyan)] bg-[var(--state-playing-bg)] shadow-[0_0_40px_rgba(0,229,255,0.3)] ring-2 ring-[var(--accent-cyan)]/40"
      : hasPlayed
      ? "border-[var(--accent-magenta)]/30 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)]"
      : "border-white/10 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] hover:border-white/20"
  }`;

  return (
    <div className="flex items-start gap-2 sm:gap-4">
      {/* Desktop Position Badge - Outside Card */}
      <motion.div
        animate={isPlaying ? { scale: [1, 1.1, 1] } : { scale: 1 }}
        transition={{ duration: 1, repeat: isPlaying ? Infinity : 0 }}
        className={`hidden md:flex h-12 w-12 lg:h-14 lg:w-14 items-center justify-center rounded-xl font-black text-xl lg:text-2xl transition-all duration-300 flex-shrink-0 ${
          isPlaying
            ? "bg-[var(--accent-cyan)] text-black shadow-[0_0_30px_rgba(0,229,255,0.8)] ring-2 ring-[var(--accent-cyan)]/60"
            : hasPlayed
            ? "bg-[var(--accent-magenta)]/20 text-[var(--accent-magenta)] border-2 border-[var(--accent-magenta)]/50 shadow-lg"
            : "bg-white/10 text-white/70 border-2 border-white/30 shadow-md"
        }`}
      >
        {position}
      </motion.div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        layout
        layoutId={`submission-${submission.id}`}
        className={cardClasses}
      >
        <div className="p-3 sm:p-5">
          {/* Header Row: Position + Channel Name + Badges + Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Mobile Position Badge - Inside Card */}
              <motion.div
                animate={isPlaying ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                transition={{ duration: 1, repeat: isPlaying ? Infinity : 0 }}
                className={`flex md:hidden h-9 w-9 items-center justify-center rounded-lg font-black text-base transition-all duration-300 flex-shrink-0 ${
                  isPlaying
                    ? "bg-[var(--accent-cyan)] text-black shadow-[0_0_20px_rgba(0,229,255,0.6)]"
                    : hasPlayed
                    ? "bg-[var(--accent-magenta)]/20 text-[var(--accent-magenta)] border border-[var(--accent-magenta)]/40"
                    : "bg-white/10 text-white/70 border border-white/20"
                }`}
              >
                {position}
              </motion.div>
            {/* User Name Display - YouTube Channel or Email */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
              {submission.youtubeChannelTitle ? (
                <span className="text-xs sm:text-sm font-semibold text-white/70 flex items-center gap-1.5 sm:gap-2 truncate">
                  {submission.youtubeChannelAvatarUrl && (
                    <Image
                      src={submission.youtubeChannelAvatarUrl}
                      alt={submission.youtubeChannelTitle}
                      width={20}
                      height={20}
                      className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border border-white/20 object-cover flex-shrink-0"
                    />
                  )}
                  <span className="truncate">{submission.youtubeChannelTitle}</span>
                </span>
              ) : submission.email ? (
                <span className="text-xs sm:text-sm font-semibold text-white/70 truncate">
                  {submission.email}
                </span>
              ) : null}
              {/* Social Links Inline */}
              {socialLinks.map((link) => (
                <motion.a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs font-semibold text-white/80 transition-all duration-300 hover:border-[var(--accent-cyan)]/50 hover:bg-white/10 hover:text-white flex-shrink-0"
                >
                  {link.icon}
                  <span className="text-[9px] sm:text-[10px]">{link.display}</span>
                </motion.a>
              ))}
            </div>
            {SHOW_QUEUE_BADGES && topBadge}
            {false && submission.priority && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-orange-600 to-red-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M2 2h12l-2 6 2 6H2l2-6-2-6z" />
                </svg>
                Priority
              </span>
            )}
            {hasPlayed && !isPlaying && (
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-magenta)]/20 border border-[var(--accent-magenta)]/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--accent-magenta)]">
                  <CHECK_ICON className="h-3.5 w-3.5" />
                  Played
                </span>
                {isAdmin && (
                  <motion.button
                    onClick={() => onResetPlayed(submission.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/5 p-1.5 text-xs font-bold text-white/70 transition-all duration-300 hover:border-[var(--accent-magenta)]/50 hover:bg-white/10 hover:text-[var(--accent-magenta)]"
                    aria-label="Reset played state"
                  >
                    <RESET_ICON className="h-3.5 w-3.5" />
                  </motion.button>
                )}
              </div>
            )}
          </div>

          {/* Expand/Collapse Button - Discreet */}
          <motion.button
            onClick={() => onToggleExpand(submission.id, isExpanded)}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            whileHover={{ scale: 1.1, opacity: 1 }}
            whileTap={{ scale: 0.9 }}
            className={`group flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded transition-all duration-300 flex-shrink-0 ${
              isPlaying
                ? "text-[var(--accent-cyan)]/60 hover:text-[var(--accent-cyan)]"
                : "text-white/30 hover:text-white/70"
            }`}
            style={{ opacity: 0.5 }}
          >
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3 w-3 sm:h-3.5 sm:w-3.5"
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 0 1 .832.445l5 7a1 1 0 1 1-1.664 1.11L10 5.882 5.832 11.555a1 1 0 0 1-1.664-1.11l5-7A1 1 0 0 1 10 3Z"
                clipRule="evenodd"
              />
            </motion.svg>
          </motion.button>
        </div>

        {/* Content Area */}
        {isEditing ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                SoundCloud Link:
              </label>
              <input
                type="url"
                value={editSoundcloudLink}
                onChange={(e) => setEditSoundcloudLink(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/40 transition-all duration-300 focus:border-[var(--accent-cyan)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/30 focus:bg-black/60"
                placeholder="https://soundcloud.com/your-track"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                Instagram (optional):
              </label>
              <input
                type="text"
                value={editInstagramHandle}
                onChange={(e) => setEditInstagramHandle(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/40 transition-all duration-300 focus:border-[var(--accent-cyan)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/30 focus:bg-black/60"
                placeholder="@username or URL"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                TikTok (optional):
              </label>
              <input
                type="text"
                value={editTiktokHandle}
                onChange={(e) => setEditTiktokHandle(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-white/40 transition-all duration-300 focus:border-[var(--accent-cyan)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/30 focus:bg-black/60"
                placeholder="@username or URL"
              />
            </div>
            {editError && (
              <p className="text-xs font-bold text-[var(--accent-magenta)]">{editError}</p>
            )}
            <div className="flex gap-2">
              <motion.button
                onClick={onSaveEdit}
                disabled={editLoading || !editSoundcloudLink.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-blue-500 px-5 py-2.5 text-xs font-black uppercase tracking-[0.25em] text-black transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,229,255,0.5)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {editLoading ? "Saving..." : "Save"}
              </motion.button>
              <motion.button
                onClick={onCancelEdit}
                disabled={editLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-xs font-black uppercase tracking-[0.25em] text-white/70 transition-all duration-300 hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Track Title (when collapsed) */}
            {!isExpanded && (
              <div className="mt-2 sm:mt-3 px-1">
                <a
                  href={submission.soundcloudLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm sm:text-base md:text-lg font-bold text-white hover:text-[var(--accent-cyan)] transition-colors duration-200 break-words"
                >
                  {trackInfo.display}
                </a>
              </div>
            )}
          </>
        )}

        {/* SoundCloud Embed or Private Link (when expanded) */}
        {isPrivate ? (
          // Private Track - Show clickable link instead of iframe
          <motion.div
            initial={false}
            animate={{
              opacity: isExpanded && !isEditing ? 1 : 0,
              height: isExpanded && !isEditing ? "auto" : 0
            }}
            transition={{ duration: 0.3 }}
            className={`mt-1 overflow-hidden`}
            style={{
              visibility: isExpanded && !isEditing ? "visible" : "hidden",
              height: isExpanded && !isEditing ? "auto" : 0
            }}
          >
            <motion.a
              href={submission.soundcloudLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handlePrivateTrackClick}
              className={`flex items-center justify-center rounded-xl border transition-all duration-300 ${
                isPlaying
                  ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 shadow-[0_0_20px_rgba(0,229,255,0.3)]"
                  : "border-white/20 bg-white/5 hover:border-[var(--accent-cyan)]/50 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(0,229,255,0.2)]"
              }`}
              style={{ height: '100px' }}
            >
              {/* Track Info with Lock Icon */}
              <div className="flex flex-col justify-center items-center gap-0.5">
                <div className="flex items-center gap-2">
                  {/* Lock Icon */}
                  <svg viewBox="0 0 16 16" fill="currentColor" className={`h-4 w-4 flex-shrink-0 transition-colors ${isPlaying ? 'text-[var(--accent-cyan)]' : 'text-white/40'}`}>
                    <path d="M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3zM6 4a2 2 0 1 1 4 0v2H6V4z" />
                  </svg>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.2em] transition-colors ${isPlaying ? 'text-[var(--accent-cyan)]' : 'text-white/50'}`}>
                    Private Track
                  </span>
                </div>
                {trackInfo.artist && trackInfo.track && (
                  <span className="text-sm font-semibold text-white text-center px-4">
                    {trackInfo.artist} – {trackInfo.track}
                  </span>
                )}
                <span className="text-[10px] font-medium text-white/30 flex items-center justify-center gap-1">
                  Click to open in SoundCloud
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                    <path d="M12 4L4 12M12 4v5M12 4H7" />
                  </svg>
                </span>
              </div>
            </motion.a>
          </motion.div>
        ) : (
          // Public/Unlisted Track - Show iframe embed
          <motion.div
            initial={false}
            animate={{
              opacity: isExpanded && !isEditing ? 1 : 0,
              height: isExpanded && !isEditing ? "auto" : 0
            }}
            transition={{ duration: 0.3 }}
            className={`mt-1 overflow-hidden rounded-xl border transition-all duration-300 ${
              isExpanded && !isEditing
                ? isPlaying
                  ? "border-[var(--accent-cyan)] shadow-[0_0_20px_rgba(0,229,255,0.3)]"
                  : "border-white/10"
                : "pointer-events-none"
            }`}
            style={{
              visibility: isExpanded && !isEditing ? "visible" : "hidden",
              height: isExpanded && !isEditing ? "auto" : 0
            }}
          >
            <iframe
              key={`${submission.id}-${iframeKey}`}
              title={`SoundCloud player ${submission.id}`}
              width="100%"
              height={isPlaying ? "280" : "100"}
              scrolling="no"
              frameBorder="no"
              allow="autoplay"
              ref={iframeRef}
              src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(
                submission.soundcloudLink
              )}&color=%2300E5FF&auto_play=${isPlaying ? 'true' : 'false'}&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=false${isPlaying ? '&visual=true' : ''}`}
            ></iframe>
          </motion.div>
        )}

        {/* Action Buttons */}
        {!isEditing && (
          <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
              {isOwnSubmission && (
                <motion.button
                  onClick={onStartEdit}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white/70 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white hover:bg-white/10"
                >
                  <EDIT_ICON className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden xs:inline">Edit</span>
                </motion.button>
              )}
              {isAdmin && (
                <>
                  <motion.button
                    onClick={() => onMove(submission.id, "up")}
                    disabled={pendingActionId !== null || index === 0}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white/70 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ARROW_UP_ICON className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden xs:inline">Up</span>
                  </motion.button>
                  <motion.button
                    onClick={() => onMove(submission.id, "down")}
                    disabled={pendingActionId !== null || index === total - 1}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white/70 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ARROW_DOWN_ICON className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden xs:inline">Down</span>
                  </motion.button>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
              {/* Volume Controls - Bottom right (only for non-private tracks) */}
              {isExpanded && !isPrivate && (
                <div className="flex items-center gap-1.5">
                  {/* Mute Button */}
                  <motion.button
                    onClick={handleMuteToggle}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex-shrink-0 flex items-center justify-center rounded-lg border transition-all duration-300 h-7 w-7 ${
                      isMuted
                        ? "border-[var(--accent-magenta)]/50 bg-[var(--accent-magenta)]/10 text-[var(--accent-magenta)]"
                        : "border-white/20 bg-white/5 text-white/70 hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] hover:bg-white/10"
                    }`}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M8 2.5L4.5 5H2v6h2.5L8 13.5V2.5z" />
                        <line x1="10" y1="5" x2="14" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <line x1="14" y1="5" x2="10" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M8 2.5L4.5 5H2v6h2.5L8 13.5V2.5z" />
                        <path d="M10.5 5.5c.8.8 1.3 1.9 1.3 3.2s-.5 2.4-1.3 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                      </svg>
                    )}
                  </motion.button>

                  {/* Volume Slider - Compact */}
                  <div className="relative group w-16 sm:w-20 flex items-center h-7">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer m-0
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-2.5
                        [&::-webkit-slider-thumb]:h-2.5
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-[var(--accent-cyan)]
                        [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-webkit-slider-thumb]:transition-all
                        [&::-webkit-slider-thumb]:duration-200
                        [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,229,255,0.4)]
                        hover:[&::-webkit-slider-thumb]:w-3
                        hover:[&::-webkit-slider-thumb]:h-3
                        hover:[&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(0,229,255,0.6)]
                        [&::-moz-range-thumb]:appearance-none
                        [&::-moz-range-thumb]:w-2.5
                        [&::-moz-range-thumb]:h-2.5
                        [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-[var(--accent-cyan)]
                        [&::-moz-range-thumb]:border-0
                        [&::-moz-range-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:transition-all
                        [&::-moz-range-thumb]:duration-200
                        [&::-moz-range-thumb]:shadow-[0_0_8px_rgba(0,229,255,0.4)]
                        hover:[&::-moz-range-thumb]:w-3
                        hover:[&::-moz-range-thumb]:h-3
                        hover:[&::-moz-range-thumb]:shadow-[0_0_12px_rgba(0,229,255,0.6)]"
                      style={{
                        background: `linear-gradient(to right,
                          var(--accent-cyan) 0%,
                          var(--accent-cyan) ${volume}%,
                          rgba(255,255,255,0.1) ${volume}%,
                          rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                    {/* Volume Percentage Tooltip */}
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[9px] font-bold text-[var(--accent-cyan)] pointer-events-none whitespace-nowrap bg-black/80 px-2 py-1 rounded">
                      {volume}%
                    </div>
                  </div>
                </div>
              )}

              {isAdmin && (
                <>
                  <motion.button
                    onClick={() => onMoveToTop(submission.id)}
                    disabled={pendingActionId !== null || index === 0}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-[var(--accent-cyan)] transition-all duration-300 hover:border-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ARROW_UP_ICON className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden xs:inline">Top</span>
                  </motion.button>
                  <motion.button
                    onClick={() => onRemove(submission.id)}
                    disabled={pendingActionId !== null}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-500 via-[var(--accent-magenta)] to-purple-600 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,0,170,0.4)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <TRASH_ICON className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden xs:inline">Remove</span>
                  </motion.button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
    </div>
  );
};
