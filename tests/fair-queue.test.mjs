import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateFairQueueOrder,
  getNextSubmissionRound,
  getSubmissionRound,
  sortByQueueOrder,
} from "../lib/fair-queue.ts";

const entry = (id, order, submissionRound, extras = {}) => ({
  id,
  order,
  submissionRound,
  timestamp: new Date(order),
  ...extras,
});

const insertFairly = (queue, item) => [
  ...queue,
  {
    ...item,
    order: allocateFairQueueOrder(queue, item.submissionRound),
  },
];

test("legacy submissions default to the first round", () => {
  assert.equal(getSubmissionRound({}), 1);
  assert.equal(getNextSubmissionRound([{}, {}]), 3);
});

test("late first and second submissions enter their fair rounds", () => {
  let queue = [
    entry("A1", 1_000, 1),
    entry("B1", 2_000, 1),
    entry("A2", 3_000, 2),
    entry("A3", 4_000, 3),
  ];

  queue = insertFairly(queue, { id: "C1", submissionRound: 1 });
  queue = insertFairly(queue, { id: "B2", submissionRound: 2 });

  assert.deepEqual(
    sortByQueueOrder(queue).map((item) => item.id),
    ["A1", "B1", "C1", "A2", "B2", "A3"],
  );
});

test("manual cross-round overrides remain ahead of later automatic inserts", () => {
  let queue = [
    entry("A3", 500, 3, { manualOrderOverride: true }),
    entry("A1", 1_000, 1),
    entry("B1", 2_000, 1),
    entry("A2", 3_000, 2),
  ];

  queue = insertFairly(queue, { id: "C1", submissionRound: 1 });

  assert.deepEqual(
    sortByQueueOrder(queue).map((item) => item.id),
    ["A3", "A1", "B1", "C1", "A2"],
  );
});

test("replacement data can retain its round and queue position", () => {
  const original = entry("A2", 2_500, 2, {
    manualOrderOverride: true,
  });
  const replacement = {
    ...original,
    id: "A2 replacement",
  };

  assert.equal(replacement.order, original.order);
  assert.equal(getSubmissionRound(replacement), 2);
  assert.equal(replacement.manualOrderOverride, true);
});
