"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useSession } from "next-auth/react";
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
  submittedByRole?: string;
  isChannelOwner?: boolean;
  isSubscriber?: boolean | null;
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [widgetReady, setWidgetReady] = useState(false);

  const isAdmin = session?.user?.isAdmin ?? false;

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

  const topFiveIds = useMemo(
    () => sortedSubmissions.slice(0, 5).map((sub) => sub.id),
    [sortedSubmissions]
  );
  const topFiveSet = useMemo(() => new Set(topFiveIds), [topFiveIds]);
  const topFiveSetRef = useRef<Set<string>>(topFiveSet);

  useEffect(() => {
    topFiveSetRef.current = topFiveSet;
  }, [topFiveSet]);

  useEffect(() => {
    const validIds = new Set(sortedSubmissions.map((sub) => sub.id));

    setExpandedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id) && !topFiveSet.has(id)) {
          next.add(id);
        }
      });
      return next;
    });

    setCollapsedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id) && topFiveSet.has(id)) {
          next.add(id);
        }
      });
      return next;
    });

    setCurrentPlayingId((prev) => (prev && validIds.has(prev) ? prev : null));
  }, [sortedSubmissions, topFiveSet]);

  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      topFiveIds.forEach((id) => {
        if (!collapsedIds.has(id)) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }, [topFiveIds, collapsedIds]);

  const handleToggleExpand = useCallback(
    (id: string, isExpanded: boolean, isTopFive: boolean) => {
      if (isTopFive) {
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
    },
    []
  );

  const handlePlay = useCallback((id: string) => {
    setCurrentPlayingId((prev) => {
      if (prev === id) {
        return prev;
      }

      setCollapsedIds((prevCollapsed) => {
        const next = new Set(prevCollapsed);
        next.delete(id);
        if (prev && topFiveSetRef.current.has(prev)) {
          next.add(prev);
        }
        return next;
      });

      setExpandedIds((prevExpanded) => {
        const next = new Set(prevExpanded);
        if (prev && !topFiveSetRef.current.has(prev)) {
          next.delete(prev);
        }
        if (!topFiveSetRef.current.has(id)) {
          next.add(id);
        }
        return next;
      });

      setPlayedIds((prevPlayed) => {
        const next = new Set(prevPlayed);
        next.add(id);
        return next;
      });

      return id;
    });
  }, []);

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
        submittedByRole: doc.data().submittedByRole,
        isChannelOwner: doc.data().isChannelOwner,
        isSubscriber: doc.data().isSubscriber,
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

  return (
    <div className="bg-black min-h-screen w-full flex flex-col items-center py-10">
      {/* Header */}
      <header className="w-full bg-black py-6 mb-6">
        <h1 className="text-3xl font-bold text-white text-center">
          THE XLNT QUEUE
        </h1>
      </header>

      {isAdmin ? (
        <div className="bg-yellow-300 text-black p-2 rounded mb-4 font-semibold">
          You are viewing as ADMIN
        </div>
      ) : (
        <div className="text-gray-400 mb-4">
          Sign in with an admin account to manage the queue.
        </div>
      )}

      {actionError && (
        <p className="text-red-500 font-semibold mb-4">{actionError}</p>
      )}

      {sortedSubmissions.length === 0 ? (
        <p className="text-white">No submissions yet.</p>
      ) : (
        sortedSubmissions.map((sub, index) => {
          const isTopFive = topFiveSet.has(sub.id);
          const isPlaying = currentPlayingId === sub.id;
          const isExpanded =
            isPlaying ||
            (!collapsedIds.has(sub.id) && isTopFive) ||
            expandedIds.has(sub.id);

          return (
            <QueueItem
              key={sub.id}
              submission={sub}
              index={index}
              isExpanded={isExpanded}
              isTopFive={isTopFive}
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
            />
          );
        })
      )}
    </div>
  );
}

const QueueItem = ({
  submission,
  index,
  isExpanded,
  isTopFive,
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
}: {
  submission: Submission;
  index: number;
  isExpanded: boolean;
  isTopFive: boolean;
  isPlaying: boolean;
  hasPlayed: boolean;
  onMove: (id: string, direction: "up" | "down") => void;
  onRemove: (id: string) => void;
  pendingActionId: string | null;
  isAdmin: boolean;
  total: number;
  onToggleExpand: (id: string, isExpanded: boolean, isTopFive: boolean) => void;
  onPlay: (id: string) => void;
  widgetReady: boolean;
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
    const widget = window.SC.Widget(iframe);
    const handlePlayEvent = () => onPlay(submission.id);
    widget.bind("play", handlePlayEvent);
    return () => {
      widget.unbind("play", handlePlayEvent);
    };
  }, [isExpanded, onPlay, submission.id, widgetReady]);

  const badges = [
    submission.isChannelOwner && (
      <span
        key="owner"
        className="inline-flex items-center rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold uppercase text-white"
      >
        Channel Owner
      </span>
    ),
    !submission.isChannelOwner &&
      submission.submittedByRole === "admin" && (
        <span
          key="admin"
          className="inline-flex items-center rounded bg-green-700 px-2 py-0.5 text-xs font-semibold uppercase text-white"
        >
          Admin
        </span>
      ),
    submission.isMember === true && (
      <span
        key="member"
        className="inline-flex items-center gap-1 rounded bg-purple-700 px-2 py-0.5 text-xs font-semibold uppercase text-white"
      >
        Member
        {submission.membershipTier && (
          <span className="normal-case text-white/80">
            {submission.membershipTier}
          </span>
        )}
      </span>
    ),
    submission.isMember === false && (
      <span
        key="not-member"
        className="inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs font-semibold uppercase text-white"
      >
        Not a Member
      </span>
    ),
    typeof submission.isSubscriber === "boolean" ? (
      <span
        key="subscriber"
        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase ${
          submission.isSubscriber
            ? "bg-orange-500 text-white"
            : "bg-gray-700 text-white"
        }`}
      >
        {submission.isSubscriber ? "Subscriber" : "Not Subscribed"}
      </span>
    ) : (
      <span
        key="subscriber-unknown"
        className="inline-flex items-center rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold uppercase text-white"
      >
        Subscription Unknown
      </span>
    ),
    submission.priority && (
      <span
        key="priority"
        className="inline-flex items-center rounded bg-orange-600 px-2 py-0.5 text-xs font-semibold uppercase text-white"
      >
        Priority
      </span>
    ),
  ].filter(Boolean);

  const cardClasses = `mb-4 w-full max-w-3xl rounded-lg border p-4 transition ${
    hasPlayed
      ? "border-green-500 bg-green-900/40"
      : "border-gray-800 bg-gray-900/60"
  }`;

  return (
    <div className={cardClasses}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white text-lg font-semibold">
            #{position}
          </span>
          {badges}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              onToggleExpand(submission.id, isExpanded, isTopFive)
            }
            className="rounded border border-gray-600 px-2 py-1 text-xs uppercase text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
          {submission.email && (
            <span className="text-sm text-gray-300">
              Submitted by:{" "}
              <span className="text-white font-medium">
                {submission.email}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-sm text-gray-300">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          {!isExpanded && (
            <a
              href={submission.soundcloudLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white text-base font-semibold hover:underline"
            >
              {trackInfo.display}
            </a>
          )}
          {isExpanded && (
            <span className="text-xs uppercase text-gray-500">
              {isPlaying ? "Now Playing" : "Expanded"}
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 overflow-hidden rounded-lg">
          <iframe
            title={`SoundCloud player ${submission.id}`}
            width="100%"
            height="160"
            scrolling="no"
            frameBorder="no"
            allow="autoplay"
            ref={iframeRef}
            src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(
              submission.soundcloudLink
            )}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`}
          ></iframe>
        </div>
      )}

      {isAdmin && (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={() => onMove(submission.id, "up")}
            disabled={pendingActionId !== null || index === 0}
            className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-300 hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Move Up
          </button>
          <button
            onClick={() => onMove(submission.id, "down")}
            disabled={
              pendingActionId !== null || index === total - 1
            }
            className="rounded border border-gray-600 px-3 py-1 text-sm text-gray-300 hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Move Down
          </button>
          <button
            onClick={() => onRemove(submission.id)}
            disabled={pendingActionId !== null}
            className="rounded border border-red-600 px-3 py-1 text-sm text-red-400 hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
};
