"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SVGProps } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../firebase/firebase";

interface Submission {
  id: string;
  soundcloudLink: string;
  email?: string;
  priority?: boolean;
  order?: number;
  timestamp?: { toMillis?: () => number } | null;
  isMember?: boolean;
  membershipTier?: string | null;
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
    const membershipTierRank = (submission: Submission) => {
      if (!submission.isMember) {
        return Number.MAX_SAFE_INTEGER;
      }

      const tierId = submission.membershipTier ?? "";
      const numericMatch = tierId.match(/\d+/);
      if (numericMatch) {
        const numericValue = parseInt(numericMatch[0], 10);
        if (!Number.isNaN(numericValue)) {
          return -numericValue;
        }
      }

      if (tierId) {
        return -1;
      }

      return Number.MAX_SAFE_INTEGER - 1;
    };

    const subscriptionRank = (submission: Submission) => {
      if (submission.isSubscriber === true) return 0;
      if (submission.isSubscriber === false) return 1;
      return 2;
    };

    const priorityRank = (submission: Submission) =>
      submission.priority ? 0 : 1;

    const orderRank = (submission: Submission) =>
      typeof submission.order === "number"
        ? submission.order
        : submission.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

    return submissions
      .slice()
      .sort((a, b) => {
        const comparisons = [
          (a.isChannelOwner ? 0 : 1) - (b.isChannelOwner ? 0 : 1),
          membershipTierRank(a) - membershipTierRank(b),
          subscriptionRank(a) - subscriptionRank(b),
          priorityRank(a) - priorityRank(b),
          orderRank(a) - orderRank(b),
        ];

        for (const diff of comparisons) {
          if (diff !== 0) {
            return diff;
          }
        }

        const timeA = a.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        const timeB = b.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        return timeA - timeB;
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
    if (!clearConfirm) {
      setClearConfirm(true);
      if (clearConfirmTimeoutRef.current) {
        clearTimeout(clearConfirmTimeoutRef.current);
      }
      clearConfirmTimeoutRef.current = setTimeout(() => {
        setClearConfirm(false);
        clearConfirmTimeoutRef.current = null;
      }, 5000);
      return;
    }

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
      if (clearConfirmTimeoutRef.current) {
        clearTimeout(clearConfirmTimeoutRef.current);
        clearConfirmTimeoutRef.current = null;
      }
    }
  }, [clearConfirm]);

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
        isMember: doc.data().isMember,
        membershipTier: doc.data().membershipTier ?? null,
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
    <div className="min-h-screen w-full bg-[var(--surface-void)] px-4 pb-16 pt-12 text-white">
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
          <span className="relative z-10">Submit Track</span>
          <span className="absolute inset-0 bg-gradient-to-r from-[var(--accent-cyan)]/0 via-[var(--accent-cyan)]/10 to-[var(--accent-cyan)]/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </Link>
      </motion.div>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="mx-auto mb-12 w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--surface-card)] via-[var(--surface-elevated)] to-[var(--surface-card)] py-12 text-center shadow-[0_40px_120px_-60px_rgba(0,229,255,0.4)] relative"
      >
        {/* Accent glow bars */}
        <div className="absolute top-0 left-1/4 w-32 h-1 bg-gradient-to-r from-transparent via-[var(--accent-cyan)] to-transparent opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-32 h-1 bg-gradient-to-r from-transparent via-[var(--accent-magenta)] to-transparent opacity-60" />

        <h1 className="text-5xl font-black uppercase tracking-[0.4em] text-white drop-shadow-[0_2px_10px_rgba(0,229,255,0.3)]">
          Feedback Queue
        </h1>
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
          Track • Review • Level Up
        </p>
      </motion.header>

      <div className="mx-auto flex w-full max-w-5xl flex-col items-stretch gap-4">
        <AnimatePresence>
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--accent-cyan)]/20 bg-[var(--accent-cyan)]/5 px-5 py-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent-cyan)]">
                <span className="inline-flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-[var(--accent-cyan)] animate-pulse" />
                  Admin Mode Active
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-[var(--surface-elevated)] to-[var(--surface-card)] px-5 py-4"
            >
              <button
                onClick={handleClearQueue}
                disabled={clearLoading}
                className="group relative overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-[var(--accent-magenta)] to-purple-600 px-6 py-2.5 text-xs font-bold uppercase tracking-[0.3em] text-white transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,0,170,0.5)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="relative z-10">
                  {clearLoading
                    ? "Clearing..."
                    : clearConfirm
                    ? "⚠ Confirm Clear"
                    : "Clear Queue"}
                </span>
              </button>
              {clearConfirm && !clearLoading && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--accent-amber)]"
                >
                  Click again within 5s to delete all
                </motion.span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {actionNotice && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-xs font-bold uppercase tracking-[0.25em] text-emerald-300"
            >
              {actionNotice}
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {actionError && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl border border-[var(--accent-magenta)]/30 bg-[var(--accent-magenta)]/10 px-5 py-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent-magenta)]"
            >
              {actionError}
            </motion.p>
          )}
        </AnimatePresence>

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
                  key={sub.id}
                  submission={sub}
                  index={index}
                  isExpanded={isExpanded}
                  isPlaying={isPlaying}
                  hasPlayed={playedIds.has(sub.id)}
                  onMove={handleMove}
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

const QueueItem = ({
  submission,
  index,
  isExpanded,
  isPlaying,
  hasPlayed,
  onMove,
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
  }, [isExpanded, onPlay, submission.id, widgetReady]);

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
  ) : submission.isMember === true ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-purple-600 to-[var(--accent-magenta)] px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M8 12l-3.5 2.1 1-4-3-2.6 4-.3L8 3l1.5 4.2 4 .3-3 2.6 1 4z" />
      </svg>
      Member
      {submission.membershipTier && (
        <span className="ml-1 text-white/90">{submission.membershipTier}</span>
      )}
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      layout
      className={cardClasses}
    >
      <div className="p-5">
        {/* Header Row: Position + Channel Name + Badges + Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {/* Position Badge - Larger and more prominent */}
            <motion.div
              animate={isPlaying ? { scale: [1, 1.1, 1] } : { scale: 1 }}
              transition={{ duration: 1, repeat: isPlaying ? Infinity : 0 }}
              className={`flex h-10 w-10 items-center justify-center rounded-lg font-black text-lg transition-all duration-300 ${
                isPlaying
                  ? "bg-[var(--accent-cyan)] text-black shadow-[0_0_20px_rgba(0,229,255,0.6)]"
                  : hasPlayed
                  ? "bg-[var(--accent-magenta)]/20 text-[var(--accent-magenta)] border border-[var(--accent-magenta)]/40"
                  : "bg-white/10 text-white/70 border border-white/20"
              }`}
            >
              {position}
            </motion.div>
            {/* YouTube Channel Name - Compact inline display */}
            {submission.youtubeChannelTitle && (
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
            )}
            {topBadge}
            {submission.priority && (
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
            className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-300 ${
              isPlaying
                ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                : "border-white/20 bg-white/5 text-white/70 hover:border-[var(--accent-cyan)] hover:text-white hover:bg-white/10"
            }`}
          >
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
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
          <div className="mt-3 flex flex-col gap-2">
            {/* Track Title (when collapsed) */}
            {!isExpanded && (
              <a
                href={submission.soundcloudLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-bold text-white hover:text-[var(--accent-cyan)] transition-colors duration-200"
              >
                {trackInfo.display}
              </a>
            )}

            {/* Social Links */}
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {socialLinks.map((link) => (
                  <motion.a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition-all duration-300 hover:border-[var(--accent-cyan)]/50 hover:bg-white/10 hover:text-white"
                  >
                    {link.icon}
                    <span>{link.display}</span>
                  </motion.a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SoundCloud Embed (when expanded) */}
        <AnimatePresence>
          {isExpanded && !isEditing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className={`mt-4 overflow-hidden rounded-xl border transition-all duration-300 ${
                isPlaying
                  ? "border-[var(--accent-cyan)] shadow-[0_0_20px_rgba(0,229,255,0.3)]"
                  : "border-white/10"
              }`}
            >
              <iframe
                title={`SoundCloud player ${submission.id}`}
                width="100%"
                height="140"
                scrolling="no"
                frameBorder="no"
                allow="autoplay"
                ref={iframeRef}
                src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(
                  submission.soundcloudLink
                )}&color=%2300E5FF&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`}
              ></iframe>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        {!isEditing && (
          <div className="mt-4 flex flex-wrap gap-2">
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
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
