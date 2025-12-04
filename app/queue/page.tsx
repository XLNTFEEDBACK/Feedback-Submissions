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

    if (segments.length >= 2) {
      const artist = decodeURIComponent(segments[segments.length - 2]);
      const track = decodeURIComponent(segments[segments.length - 1]);
      return {
        artist,
        track,
        display: `${artist} – ${track}`,
      };
    }

    if (segments.length === 1) {
      const track = decodeURIComponent(segments[0]);
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

declare global {
  interface Window {
    SC?: {
      Widget?: (
        iframe: HTMLIFrameElement
      ) => {
        bind: (event: string, listener: () => void) => void;
        unbind: (event: string, listener: () => void) => void;
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
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [widgetReady, setWidgetReady] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearConfirmSecond, setClearConfirmSecond] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const clearConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

      await moveToTop(submissionId);

      // Refresh submissions to get updated order
      // The Firestore listener will automatically update the list
      setActionNotice("Submission moved to top of queue.");
      setTimeout(() => setActionNotice(null), 3000);
    } catch (error) {
      console.error("Failed to move submission to top", error);
      setActionError("Failed to move submission to top. Please try again.");
    } finally {
      setPendingActionId(null);
    }
  };

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
    <div className="min-h-screen w-full bg-[var(--surface-void)] px-4 pb-20 pt-20 text-white">
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
        className="fixed top-4 right-4 z-10"
      >
        <Link
          href="/submit"
          className="group relative overflow-hidden rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white/80 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white backdrop-blur-md hover:shadow-[0_0_20px_rgba(0,229,255,0.3)]"
        >
          <span className="relative z-10">
            {isAdmin || hasSubmission ? "Submission Form" : "Submit Song"}
          </span>
          <span className="absolute inset-0 bg-gradient-to-r from-[var(--accent-cyan)]/0 via-[var(--accent-cyan)]/10 to-[var(--accent-cyan)]/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </Link>
      </motion.div>

      {/* Clear Queue button in bottom right (admin only) */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed bottom-4 right-4 z-10"
        >
          <button
            onClick={handleClearQueue}
            disabled={clearLoading}
            className="group relative overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-[var(--accent-magenta)] to-purple-600 px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,0,170,0.5)] disabled:cursor-not-allowed disabled:opacity-40 backdrop-blur-md"
          >
            <span className="relative z-10">
              {clearLoading
                ? "Clearing..."
                : clearConfirmSecond
                ? "Are you sure?"
                : clearConfirm
                ? "⚠ Confirm Clear"
                : "Clear Queue"}
            </span>
            {(clearConfirm || clearConfirmSecond) && !clearLoading && (
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold uppercase tracking-[0.25em] text-[var(--accent-amber)]"
              >
                Click again within 5s
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
        className="relative mx-auto mb-8 flex w-full max-w-5xl items-center justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] px-10 py-6 shadow-[0_20px_60px_-20px_rgba(0,229,255,0.2)]"
      >
        {/* Subtle accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-cyan)]/40 to-transparent" />

        {/* Left: Title */}
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl font-black uppercase tracking-[0.15em] text-white">
            XLNT Feedback Queue
          </h1>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
            Track • Review • Level Up
          </p>
        </div>

        {/* Right: Social Links */}
        <div className="flex items-center gap-2.5">
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
                <TIKTOK_ICON className="h-4 w-4" />
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
                <INSTAGRAM_ICON className="h-4 w-4" />
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
                <YOUTUBE_ICON className="h-4 w-4" />
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
                <PATREON_ICON className="h-4 w-4" />
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
                <SPOTIFY_ICON className="h-4 w-4" />
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
                <STORE_ICON className="h-4 w-4" />
              </motion.a>
            </TooltipWrapper>
          )}
        </div>
      </motion.header>

      <div className="mx-auto flex w-full max-w-5xl flex-col items-stretch gap-4">

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
}) => {
  const position = index + 1;
  const trackInfo = getTrackDisplay(submission.soundcloudLink);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const wasPlayingRef = useRef(false);

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
      return () => {
        try {
          if (iframe && iframe.isConnected && window.SC?.Widget) {
            const cleanupWidget = window.SC.Widget(iframe);
            if (cleanupWidget) {
              cleanupWidget.unbind("play", handlePlayEvent);
            }
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      };
    } catch (error) {
      console.warn("Error initializing SoundCloud widget:", error);
    }
  }, [isExpanded, onPlay, submission.id, widgetReady, iframeKey, isPlaying]);

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

  // Dynamic card styling based on playback state
  const cardClasses = `w-full rounded-2xl border transition-all duration-300 ${
    isPlaying
      ? "border-[var(--accent-cyan)] bg-[var(--state-playing-bg)] shadow-[0_0_40px_rgba(0,229,255,0.3)] ring-2 ring-[var(--accent-cyan)]/40"
      : hasPlayed
      ? "border-[var(--accent-magenta)]/30 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)]"
      : "border-white/10 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] hover:border-white/20"
  }`;

  return (
    <div className="flex items-start gap-4">
      {/* Desktop Position Badge - Outside Card */}
      <motion.div
        animate={isPlaying ? { scale: [1, 1.1, 1] } : { scale: 1 }}
        transition={{ duration: 1, repeat: isPlaying ? Infinity : 0 }}
        className={`hidden md:flex h-14 w-14 items-center justify-center rounded-xl font-black text-2xl transition-all duration-300 ${
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
        <div className="p-5">
          {/* Header Row: Position + Channel Name + Badges + Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Mobile Position Badge - Inside Card */}
              <motion.div
                animate={isPlaying ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                transition={{ duration: 1, repeat: isPlaying ? Infinity : 0 }}
                className={`flex md:hidden h-10 w-10 items-center justify-center rounded-lg font-black text-lg transition-all duration-300 ${
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
            <div className="flex items-center gap-2 flex-wrap">
              {submission.youtubeChannelTitle ? (
                <span className="text-sm font-semibold text-white/70 flex items-center gap-2">
                  {submission.youtubeChannelAvatarUrl && (
                    <Image
                      src={submission.youtubeChannelAvatarUrl}
                      alt={submission.youtubeChannelTitle}
                      width={24}
                      height={24}
                      className="h-6 w-6 rounded-full border border-white/20 object-cover"
                    />
                  )}
                  {submission.youtubeChannelTitle}
                </span>
              ) : submission.email ? (
                <span className="text-sm font-semibold text-white/70">
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
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 py-1 text-xs font-semibold text-white/80 transition-all duration-300 hover:border-[var(--accent-cyan)]/50 hover:bg-white/10 hover:text-white"
                >
                  {link.icon}
                  <span className="text-[10px]">{link.display}</span>
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
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-magenta)]/20 border border-[var(--accent-magenta)]/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--accent-magenta)]">
                <CHECK_ICON className="h-3.5 w-3.5" />
                Played
              </span>
            )}
          </div>

          {/* Expand/Collapse Button */}
          <motion.button
            onClick={() => onToggleExpand(submission.id, isExpanded)}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-300 ${
              isPlaying
                ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                : "border-white/20 bg-white/5 text-white/70 hover:border-[var(--accent-cyan)] hover:text-white hover:bg-white/10"
            }`}
          >
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
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
              <div className="mt-3">
                <a
                  href={submission.soundcloudLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-bold text-white hover:text-[var(--accent-cyan)] transition-colors duration-200"
                >
                  {trackInfo.display}
                </a>
              </div>
            )}
          </>
        )}

        {/* SoundCloud Embed (when expanded) */}
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

        {/* Action Buttons */}
        {!isEditing && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {isOwnSubmission && (
                <motion.button
                  onClick={onStartEdit}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white/70 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white hover:bg-white/10"
                >
                  <EDIT_ICON className="h-3.5 w-3.5" />
                  Edit
                </motion.button>
              )}
              {isAdmin && (
                <>
                  <motion.button
                    onClick={() => onMove(submission.id, "up")}
                    disabled={pendingActionId !== null || index === 0}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white/70 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ARROW_UP_ICON className="h-3.5 w-3.5" />
                    Up
                  </motion.button>
                  <motion.button
                    onClick={() => onMove(submission.id, "down")}
                    disabled={pendingActionId !== null || index === total - 1}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white/70 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ARROW_DOWN_ICON className="h-3.5 w-3.5" />
                    Down
                  </motion.button>
                </>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <motion.button
                  onClick={() => onMoveToTop(submission.id)}
                  disabled={pendingActionId !== null || index === 0}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent-cyan)] transition-all duration-300 hover:border-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ARROW_UP_ICON className="h-3.5 w-3.5" />
                  Top
                </motion.button>
                <motion.button
                  onClick={() => onRemove(submission.id)}
                  disabled={pendingActionId !== null}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-red-500 via-[var(--accent-magenta)] to-purple-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,0,170,0.4)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <TRASH_ICON className="h-3.5 w-3.5" />
                  Remove
                </motion.button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
    </div>
  );
};
