import type { TrackProvider } from "./track-links";

export interface QueueTimestamp {
  toMillis?: () => number;
}

export interface PlayerSubmission {
  id: string;
  trackUrl: string;
  provider: TrackProvider;
  trackTitle?: string | null;
  artistName?: string | null;
  order?: number;
  timestamp?: QueueTimestamp | null;
  reviewedAt?: QueueTimestamp | null;
}

const rankSubmission = (submission: PlayerSubmission) =>
  typeof submission.order === "number"
    ? submission.order
    : submission.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

export const sortPlayerQueue = <T extends PlayerSubmission>(items: T[]): T[] =>
  items.slice().sort((a, b) => {
    const rankDifference = rankSubmission(a) - rankSubmission(b);
    if (rankDifference !== 0) return rankDifference;

    const timeA = a.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    const timeB = b.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    return timeA - timeB;
  });

export const isSubmissionReviewed = (
  submission: PlayerSubmission,
  sessionCompletedIds: ReadonlySet<string>,
) => Boolean(submission.reviewedAt) || sessionCompletedIds.has(submission.id);

export const findNextPlayable = <T extends PlayerSubmission>(
  items: T[],
  sessionCompletedIds: ReadonlySet<string>,
  failedIds: ReadonlySet<string>,
): T | null =>
  sortPlayerQueue(items).find(
    (submission) =>
      !isSubmissionReviewed(submission, sessionCompletedIds) &&
      !failedIds.has(submission.id),
  ) ?? null;

export const getPlayerQueuePosition = (
  items: PlayerSubmission[],
  currentId: string | null,
) => {
  if (!currentId) return null;
  const sorted = sortPlayerQueue(items);
  const index = sorted.findIndex((submission) => submission.id === currentId);
  return index === -1 ? null : { current: index + 1, total: sorted.length };
};

export const clampVolume = (volume: number) =>
  Math.min(100, Math.max(0, Math.round(volume)));

export const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;

export const appendPlaybackHistory = (
  history: readonly string[],
  trackId: string,
) =>
  history.at(-1) === trackId ? history.slice() : [...history, trackId];

export const takePreviousTrack = (
  history: readonly string[],
  availableIds: ReadonlySet<string>,
): { trackId: string; history: string[] } | null => {
  const remaining = history.slice();
  while (remaining.length > 0) {
    const trackId = remaining.pop();
    if (trackId && availableIds.has(trackId)) {
      return { trackId, history: remaining };
    }
  }
  return null;
};

export const shouldRestartCurrentTrack = (
  position: number,
  threshold = PREVIOUS_RESTART_THRESHOLD_SECONDS,
) => Number.isFinite(position) && position > threshold;

export const getMiniPlayerPopupPlacement = (
  screen: {
    availLeft?: number;
    availTop?: number;
    availWidth: number;
  },
  width = 420,
  height = 240,
  edgeOffset = 16,
) => {
  const availableLeft = screen.availLeft ?? 0;
  const availableTop = screen.availTop ?? 0;
  return {
    width,
    height,
    left: Math.max(
      availableLeft,
      availableLeft + screen.availWidth - width - edgeOffset,
    ),
    top: availableTop + edgeOffset,
  };
};

export const parseReviewedMutation = (body: unknown): boolean | null => {
  if (typeof body !== "object" || body === null || !("reviewed" in body)) {
    return null;
  }
  const reviewed = (body as { reviewed?: unknown }).reviewed;
  return typeof reviewed === "boolean" ? reviewed : null;
};
