import assert from "node:assert/strict";
import test from "node:test";

import {
  getDropboxPlaybackUrl,
  getTrackDisplay,
  inferTrackProvider,
  parseTrackLink,
} from "../lib/track-links.ts";

test("accepts public and private SoundCloud tracks", () => {
  const publicTrack = parseTrackLink(
    "https://soundcloud.com/example-artist/example-track",
  );
  const privateTrack = parseTrackLink(
    "https://soundcloud.com/example-artist/private-track/s-secret",
  );

  assert.equal(publicTrack.valid, true);
  assert.equal(publicTrack.valid && publicTrack.provider, "soundcloud");
  assert.equal(privateTrack.valid, true);
  assert.equal(privateTrack.valid && privateTrack.provider, "soundcloud");
});

test("accepts shortened SoundCloud links and rejects spoofed hosts", () => {
  assert.equal(parseTrackLink("https://on.soundcloud.com/abc123").valid, true);
  assert.deepEqual(
    parseTrackLink("https://soundcloud.com.evil.example/artist/track"),
    {
      valid: false,
      message: "Only SoundCloud and Dropbox shared links are supported.",
    },
  );
});

test("accepts modern Dropbox file links and preserves share keys", () => {
  const input =
    "https://www.dropbox.com/scl/fi/file-token/My_Mix-v4.mp3?rlkey=secret-key&st=tracking&dl=0";
  const parsed = parseTrackLink(input);
  const playbackUrl = getDropboxPlaybackUrl(input);

  assert.equal(parsed.valid, true);
  assert.equal(parsed.valid && parsed.provider, "dropbox");
  assert.equal(parsed.valid && parsed.trackTitle, "My_Mix-v4");
  assert.ok(playbackUrl);

  const playback = new URL(playbackUrl);
  assert.equal(playback.searchParams.get("rlkey"), "secret-key");
  assert.equal(playback.searchParams.get("st"), "tracking");
  assert.equal(playback.searchParams.get("raw"), "1");
  assert.equal(playback.searchParams.has("dl"), false);
});

test("accepts legacy Dropbox file links", () => {
  const parsed = parseTrackLink(
    "https://www.dropbox.com/s/legacy-token/track.wav?dl=0",
  );
  assert.equal(parsed.valid, true);
  assert.equal(parsed.valid && parsed.provider, "dropbox");
});

test("rejects Dropbox folders, unsupported files, non-HTTPS, and spoofed hosts", () => {
  assert.match(
    parseTrackLink(
      "https://www.dropbox.com/scl/fo/folder-token/Shared?rlkey=secret",
    ).message,
    /folders/i,
  );
  assert.match(
    parseTrackLink(
      "https://www.dropbox.com/scl/fi/file-token/notes.txt?rlkey=secret",
    ).message,
    /MP3/i,
  );
  assert.match(
    parseTrackLink(
      "http://www.dropbox.com/scl/fi/file-token/track.mp3?rlkey=secret",
    ).message,
    /HTTPS/i,
  );
  assert.equal(
    parseTrackLink(
      "https://www.dropbox.com.evil.example/scl/fi/file-token/track.mp3",
    ).valid,
    false,
  );
});

test("infers legacy SoundCloud records and formats Dropbox filenames", () => {
  const dropboxUrl =
    "https://www.dropbox.com/scl/fi/token/final_master.flac?rlkey=key";
  assert.equal(inferTrackProvider(dropboxUrl), "dropbox");
  assert.equal(
    inferTrackProvider("https://soundcloud.com/artist/track"),
    "soundcloud",
  );
  assert.equal(getTrackDisplay(dropboxUrl, "dropbox").display, "final_master");
});
