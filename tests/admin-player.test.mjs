import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPlaybackHistory,
  clampVolume,
  findNextPlayable,
  getMiniPlayerPopupPlacement,
  getPlayerQueuePosition,
  parseReviewedMutation,
  shouldRestartCurrentTrack,
  sortPlayerQueue,
  takePreviousTrack,
} from "../lib/admin-player.ts";
import { PlaybackController } from "../lib/playback-controller.ts";

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

test("playback history avoids duplicate consecutive entries and skips removed tracks", () => {
  const history = appendPlaybackHistory([], "first");
  const unchanged = appendPlaybackHistory(history, "first");
  const complete = appendPlaybackHistory(unchanged, "second");

  assert.deepEqual(complete, ["first", "second"]);
  assert.deepEqual(takePreviousTrack(complete, new Set(["first"])), {
    trackId: "first",
    history: [],
  });
  assert.equal(takePreviousTrack([], new Set(["first"])), null);
});

test("Spotify-style previous restarts only after the threshold", () => {
  assert.equal(shouldRestartCurrentTrack(3), false);
  assert.equal(shouldRestartCurrentTrack(3.01), true);
  assert.equal(shouldRestartCurrentTrack(Number.NaN), false);
});

test("mini player placement anchors to the active screen's top-right work area", () => {
  assert.deepEqual(
    getMiniPlayerPopupPlacement({
      availLeft: 1440,
      availTop: 25,
      availWidth: 1920,
    }),
    { width: 420, height: 240, left: 2924, top: 41 },
  );
});

test("playback controller keeps volume and seek independent from load and play", () => {
  const calls = [];
  const controller = new PlaybackController();
  controller.register("soundcloud", {
    load: (source, generation) => calls.push(["load", source, generation]),
    play: () => calls.push(["play"]),
    pause: () => calls.push(["pause"]),
    seek: (seconds) => calls.push(["seek", seconds]),
    setVolume: (volume) => calls.push(["volume", volume]),
  });

  controller.activate("soundcloud", 1);
  controller.load("soundcloud", "track-a", 1);
  calls.length = 0;
  controller.setVolume(72.4);
  controller.seek(18);

  assert.deepEqual(calls, [["volume", 72], ["seek", 18]]);
});

test("playback controller ignores stale loads and controls only the active provider", () => {
  const calls = [];
  const controller = new PlaybackController();
  for (const provider of ["soundcloud", "dropbox"]) {
    controller.register(provider, {
      load: (source, generation) => calls.push([provider, "load", source, generation]),
      play: () => calls.push([provider, "play"]),
      pause: () => calls.push([provider, "pause"]),
      seek: (seconds) => calls.push([provider, "seek", seconds]),
      setVolume: (volume) => calls.push([provider, "volume", volume]),
    });
  }

  controller.activate("soundcloud", 1);
  controller.activate("dropbox", 2);
  assert.equal(controller.load("soundcloud", "stale", 1), false);
  assert.equal(controller.load("dropbox", "current", 2), true);
  controller.play();

  assert.deepEqual(calls, [
    ["soundcloud", "pause"],
    ["dropbox", "load", "current", 2],
    ["dropbox", "play"],
  ]);
});
