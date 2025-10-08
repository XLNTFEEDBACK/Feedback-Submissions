"use client";
import { useEffect, useMemo, useState } from "react";
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

export default function QueuePage() {
  const { data: session } = useSession();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAdmin = session?.user?.isAdmin ?? false;

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
          you have no power here
        </div>
      )}

      {actionError && (
        <p className="text-red-500 font-semibold mb-4">{actionError}</p>
      )}

      {sortedSubmissions.length === 0 ? (
        <p className="text-white">No submissions yet.</p>
      ) : (
        sortedSubmissions.map((sub, index) => (
          <QueueItem
            key={sub.id}
            submission={sub}
            index={index}
            isExpanded={index < 5}
            onMove={handleMove}
            onRemove={handleRemove}
            pendingActionId={pendingActionId}
            isAdmin={isAdmin}
            total={sortedSubmissions.length}
          />
        ))
      )}
    </div>
  );
}

const QueueItem = ({
  submission,
  index,
  isExpanded,
  onMove,
  onRemove,
  pendingActionId,
  isAdmin,
  total,
}: {
  submission: Submission;
  index: number;
  isExpanded: boolean;
  onMove: (id: string, direction: "up" | "down") => void;
  onRemove: (id: string) => void;
  pendingActionId: string | null;
  isAdmin: boolean;
  total: number;
}) => {
  const position = index + 1;
  const trackInfo = getTrackDisplay(submission.soundcloudLink);

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

  return (
    <div className="mb-4 w-full max-w-3xl rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white text-lg font-semibold">
            #{position}
          </span>
          {badges}
        </div>
        {submission.email && (
          <span className="text-sm text-gray-300">
            Submitted by:{" "}
            <span className="text-white font-medium">
              {submission.email}
            </span>
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 text-sm text-gray-300">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <a
            href={submission.soundcloudLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white text-base font-semibold hover:underline"
          >
            {trackInfo.display}
          </a>
          {!isExpanded && (
            <span className="text-xs uppercase text-gray-500">
              Collapsed preview
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
