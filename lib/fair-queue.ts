export interface FairQueueTimestamp {
  toMillis?: () => number;
}

export interface FairQueueEntry {
  order?: number;
  timestamp?: FairQueueTimestamp | Date | null;
  submissionRound?: number;
  manualOrderOverride?: boolean;
}

const ORDER_GAP = 1_000;

export const getSubmissionRound = (entry: FairQueueEntry) => {
  const round = entry.submissionRound;
  return typeof round === "number" && Number.isInteger(round) && round > 0
    ? round
    : 1;
};

export const getQueueOrder = (entry: FairQueueEntry) => {
  if (typeof entry.order === "number" && Number.isFinite(entry.order)) {
    return entry.order;
  }

  if (entry.timestamp instanceof Date) {
    return entry.timestamp.getTime();
  }

  return entry.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
};

export const sortByQueueOrder = <T extends FairQueueEntry>(entries: T[]) =>
  entries.slice().sort((a, b) => {
    const orderDifference = getQueueOrder(a) - getQueueOrder(b);
    if (orderDifference !== 0) return orderDifference;

    const timestampA =
      a.timestamp instanceof Date
        ? a.timestamp.getTime()
        : a.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    const timestampB =
      b.timestamp instanceof Date
        ? b.timestamp.getTime()
        : b.timestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    return timestampA - timestampB;
  });

export const getNextSubmissionRound = (entries: FairQueueEntry[]) => {
  const highestStoredRound = entries.reduce(
    (highest, entry) => Math.max(highest, getSubmissionRound(entry)),
    0,
  );

  // Count protects queues containing multiple legacy records without a round.
  return Math.max(highestStoredRound, entries.length) + 1;
};

export const allocateFairQueueOrder = (
  entries: FairQueueEntry[],
  submissionRound: number,
) => {
  const sorted = sortByQueueOrder(entries);
  const firstLaterAutomaticIndex = sorted.findIndex(
    (entry) =>
      !entry.manualOrderOverride &&
      getSubmissionRound(entry) > submissionRound,
  );
  const insertionIndex =
    firstLaterAutomaticIndex === -1
      ? sorted.length
      : firstLaterAutomaticIndex;

  const previous = sorted[insertionIndex - 1];
  const next = sorted[insertionIndex];

  if (!previous && !next) return Date.now();
  if (!previous) return getQueueOrder(next) - ORDER_GAP;
  if (!next) return getQueueOrder(previous) + ORDER_GAP;

  const previousOrder = getQueueOrder(previous);
  const nextOrder = getQueueOrder(next);
  const midpoint = previousOrder + (nextOrder - previousOrder) / 2;

  if (Number.isFinite(midpoint) && midpoint > previousOrder && midpoint < nextOrder) {
    return midpoint;
  }

  // Existing queue values should normally leave ample space. This fallback
  // still gives a deterministic position if two historical values collide.
  return previousOrder + Number.EPSILON * Math.max(1, Math.abs(previousOrder));
};
