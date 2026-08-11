import assert from "node:assert/strict";
import test from "node:test";

import {
  TrackValidationError,
  validateTrackSubmission,
} from "../lib/track-validation.ts";

const dropboxTrack =
  "https://www.dropbox.com/scl/fi/file-token/My-Mix.mp3?rlkey=secret&dl=0";

test("validates Dropbox audio with a bounded range request", async () => {
  const requests = [];
  const fetchMock = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(new Uint8Array([0]), {
      status: 206,
      headers: { "content-type": "audio/mpeg" },
    });
  };

  const result = await validateTrackSubmission(dropboxTrack, fetchMock);

  assert.equal(result.provider, "dropbox");
  assert.equal(result.trackTitle, "My-Mix");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.headers.Range, "bytes=0-0");
  assert.match(requests[0].url, /raw=1/);
  assert.doesNotMatch(requests[0].url, /dl=0/);
});

test("follows allowlisted Dropbox redirects", async () => {
  let requestCount = 0;
  const fetchMock = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(null, {
        status: 302,
        headers: {
          location: "https://dl.dropboxusercontent.com/content/file-token",
        },
      });
    }
    return new Response(new Uint8Array([0]), {
      status: 206,
      headers: { "content-type": "application/octet-stream" },
    });
  };

  await validateTrackSubmission(dropboxTrack, fetchMock);
  assert.equal(requestCount, 2);
});

test("rejects unsafe redirects and Dropbox permission pages", async () => {
  await assert.rejects(
    validateTrackSubmission(
      dropboxTrack,
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/audio.mp3" },
        }),
    ),
    (error) =>
      error instanceof TrackValidationError && /unsafe redirect/i.test(error.message),
  );

  await assert.rejects(
    validateTrackSubmission(
      dropboxTrack,
      async () =>
        new Response("Sign in", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    ),
    (error) =>
      error instanceof TrackValidationError && /anyone with the link/i.test(error.message),
  );
});

test("does not make a network request for SoundCloud links", async () => {
  const result = await validateTrackSubmission(
    "https://soundcloud.com/example/track/s-secret",
    async () => {
      throw new Error("fetch should not be called");
    },
  );

  assert.equal(result.provider, "soundcloud");
});
