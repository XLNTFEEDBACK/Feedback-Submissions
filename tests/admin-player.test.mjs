import assert from "node:assert/strict";
import test from "node:test";
import {
  clampVolume,
  findNextPlayable,
  getPlayerQueuePosition,
  parseReviewedMutation,
  sortPlayerQueue,
} from "../lib/admin-player.ts";

const submission = (id, order, extras = {}) => ({
  id,
  order,
  trackUrl: `https://soundcloud.com/example/${id}`,
  provider: "soundcloud",
  ...extras,
});

test("sortPlayerQueue follows queue order without mutating the input", () => {
  const queue = [submission("third", 30), submission("first", 10), submission("second", 20)];
  assert.deepEqual(sortPlayerQueue(queue).map((item) => item.id), ["first", "second", "third"]);
  assert.deepEqual(queue.map((item) => item.id), ["third", "first", "second"]);
});

test("findNextPlayable skips durable reviews, session completions, and failures", () => {
  const queue = [
    submission("reviewed", 10, { reviewedAt: { toMillis: () => 1 } }),
    submission("completed", 20),
    submission("failed", 30),
    submission("ready", 40),
  ];

  assert.equal(
    findNextPlayable(queue, new Set(["completed"]), new Set(["failed"]))?.id,
    "ready",
  );
});

test("findNextPlayable uses the newest queue ordering on every call", () => {
  const queue = [submission("a", 10), submission("b", 20)];
  assert.equal(findNextPlayable(queue, new Set(), new Set())?.id, "a");

  queue[1].order = 5;
  assert.equal(findNextPlayable(queue, new Set(), new Set())?.id, "b");
});

test("findNextPlayable returns null after all submissions are handled", () => {
  const queue = [submission("a", 10), submission("b", 20)];
  assert.equal(findNextPlayable(queue, new Set(["a", "b"]), new Set()), null);
});

test("provider changes advance through the same continuous queue", () => {
  const queue = [
    submission("soundcloud-a", 10),
    { ...submission("dropbox-b", 20), provider: "dropbox" },
    submission("soundcloud-c", 30),
  ];
  const completed = new Set();

  assert.equal(findNextPlayable(queue, completed, new Set())?.id, "soundcloud-a");
  completed.add("soundcloud-a");
  assert.equal(findNextPlayable(queue, completed, new Set())?.id, "dropbox-b");
  completed.add("dropbox-b");
  assert.equal(findNextPlayable(queue, completed, new Set())?.id, "soundcloud-c");
});

test("getPlayerQueuePosition reports the visible FIFO position", () => {
  const queue = [submission("b", 20), submission("a", 10)];
  assert.deepEqual(getPlayerQueuePosition(queue, "b"), { current: 2, total: 2 });
  assert.equal(getPlayerQueuePosition(queue, "missing"), null);
});

test("clampVolume rounds and clamps values", () => {
  assert.equal(clampVolume(-10), 0);
  assert.equal(clampVolume(42.6), 43);
  assert.equal(clampVolume(120), 100);
});

test("parseReviewedMutation accepts only explicit booleans", () => {
  assert.equal(parseReviewedMutation({ reviewed: true }), true);
  assert.equal(parseReviewedMutation({ reviewed: false }), false);
  assert.equal(parseReviewedMutation({ reviewed: "true" }), null);
  assert.equal(parseReviewedMutation({}), null);
  assert.equal(parseReviewedMutation(null), null);
});
