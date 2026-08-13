"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot } from "firebase/firestore";
import {
  findNextPlayable,
  getPlayerQueuePosition,
  sortPlayerQueue,
  type PlayerSubmission,
} from "@/lib/admin-player";
import {
  getDropboxPlaybackUrl,
  getTrackDisplay,
  inferTrackProvider,
  isPrivateSoundCloudTrack,
  isShortenedSoundCloudLink,
} from "@/lib/track-links";
import { db } from "../firebase/firebase";
import styles from "./player.module.css";

type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "caught-up"
  | "error";

type SoundCloudProgress = {
  currentPosition?: number;
};

type SoundCloudSound = {
  title?: string;
  artwork_url?: string;
  permalink_url?: string;
  user?: {
    username?: string;
    permalink_url?: string;
  };
};

type SoundCloudWidget = {
  bind: (event: string, listener: (event?: SoundCloudProgress) => void) => void;
  unbind: (event: string) => void;
  play: () => void;
  pause: () => void;
  seekTo: (milliseconds: number) => void;
  setVolume: (volume: number) => void;
  getDuration: (callback: (milliseconds: number) => void) => void;
  getCurrentSound: (callback: (sound: SoundCloudSound) => void) => void;
};

type DocumentPictureInPictureApi = {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>;
};

type PlaybackCheckpoint = {
  trackId: string;
  position: number;
};

const PLAYER_VOLUME_KEY = "xlnt-admin-player-volume";
const PLAYER_MUTED_KEY = "xlnt-admin-player-muted";
const PLAYER_CHECKPOINT_KEY = "xlnt-admin-player-checkpoint";
const SESSION_COMPLETED_KEY = "xlnt-admin-player-completed";
const PLAYBACK_CHANNEL = "xlnt-feedback-playback";
const LOAD_TIMEOUT_MS = 12_000;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const safeSetActionHandler = (
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
) => {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Browser does not implement this Media Session action.
  }
};

const getSoundCloudApi = () =>
  (
    window as unknown as {
      SC?: { Widget?: (iframe: HTMLIFrameElement) => SoundCloudWidget };
    }
  ).SC;

const getDocumentPipApi = () =>
  (
    window as unknown as {
      documentPictureInPicture?: DocumentPictureInPictureApi;
    }
  ).documentPictureInPicture;

const parseCheckpoint = (): PlaybackCheckpoint | null => {
  try {
    const raw = localStorage.getItem(PLAYER_CHECKPOINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlaybackCheckpoint>;
    if (
      typeof parsed.trackId !== "string" ||
      typeof parsed.position !== "number" ||
      !Number.isFinite(parsed.position)
    ) {
      return null;
    }
    return { trackId: parsed.trackId, position: Math.max(0, parsed.position) };
  } catch {
    return null;
  }
};

const getFallbackMetadata = (submission: PlayerSubmission) => ({
  artist:
    submission.provider === "dropbox"
      ? submission.artistName?.trim() || "Unknown artist"
      : submission.artistName?.trim() || "SoundCloud artist",
  title:
    submission.trackTitle?.trim() ||
    getTrackDisplay(submission.trackUrl, submission.provider).display,
  artwork: null as string | null,
});

export default function AdminPlayer() {
  const [submissions, setSubmissions] = useState<PlayerSubmission[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [metadata, setMetadata] = useState({
    artist: "XLNT Feedback",
    title: "Ready to start the queue",
    artwork: null as string | null,
  });
  const [volume, setVolume] = useState(90);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionCompletedIds, setSessionCompletedIds] = useState<Set<string>>(
    new Set(),
  );
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [soundcloudSrc, setSoundcloudSrc] = useState<string | null>(null);
  const [dropboxSrc, setDropboxSrc] = useState<string | null>(null);
  const [soundcloudApiReady, setSoundcloudApiReady] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipSupported, setPipSupported] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const soundcloudIframeRef = useRef<HTMLIFrameElement | null>(null);
  const soundcloudWidgetRef = useRef<SoundCloudWidget | null>(null);
  const submissionsRef = useRef<PlayerSubmission[]>([]);
  const currentIdRef = useRef<string | null>(null);
  const currentSubmissionRef = useRef<PlayerSubmission | null>(null);
  const statusRef = useRef<PlaybackStatus>("idle");
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const completedRef = useRef<Set<string>>(new Set());
  const failedRef = useRef<Set<string>>(new Set());
  const pendingAutoplayRef = useRef(false);
  const pendingSeekRef = useRef(0);
  const loadedTrackRef = useRef<{ id: string; url: string } | null>(null);
  const restoredRef = useRef(false);
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const loadTokenRef = useRef(0);
  const checkpointSavedAtRef = useRef(0);
  const instanceIdRef = useRef(
    `player-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const pauseActiveRef = useRef<() => void>(() => undefined);
  const finishCurrentRef = useRef<() => void>(() => undefined);
  const handleSourceFailureRef = useRef<(message: string) => void>(() => undefined);
  const startTrackRef = useRef<
    (track: PlayerSubmission, autoplay: boolean, seek?: number) => void
  >(() => undefined);

  const sortedSubmissions = useMemo(
    () => sortPlayerQueue(submissions),
    [submissions],
  );
  const currentSubmission = useMemo(
    () => submissions.find((submission) => submission.id === currentId) ?? null,
    [currentId, submissions],
  );
  const queuePosition = useMemo(
    () => getPlayerQueuePosition(submissions, currentId),
    [currentId, submissions],
  );
  const nextAvailable = useMemo(
    () => findNextPlayable(submissions, sessionCompletedIds, failedIds),
    [failedIds, sessionCompletedIds, submissions],
  );
  const isPlaying = status === "playing";

  useEffect(() => {
    submissionsRef.current = submissions;
  }, [submissions]);

  useEffect(() => {
    currentIdRef.current = currentId;
    currentSubmissionRef.current = currentSubmission;
  }, [currentId, currentSubmission]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    positionRef.current = position;
    durationRef.current = duration;
  }, [duration, position]);

  useEffect(() => {
    completedRef.current = sessionCompletedIds;
    try {
      sessionStorage.setItem(
        SESSION_COMPLETED_KEY,
        JSON.stringify([...sessionCompletedIds]),
      );
    } catch {
      // Storage can be unavailable in hardened browser modes.
    }
  }, [sessionCompletedIds]);

  useEffect(() => {
    failedRef.current = failedIds;
  }, [failedIds]);

  useEffect(() => {
    try {
      const savedVolume = Number.parseInt(
        localStorage.getItem(PLAYER_VOLUME_KEY) ?? "90",
        10,
      );
      if (Number.isFinite(savedVolume)) {
        setVolume(Math.min(100, Math.max(0, savedVolume)));
      }
      setMuted(localStorage.getItem(PLAYER_MUTED_KEY) === "true");

      const completed = JSON.parse(
        sessionStorage.getItem(SESSION_COMPLETED_KEY) ?? "[]",
      ) as unknown;
      if (
        Array.isArray(completed) &&
        completed.every((item) => typeof item === "string")
      ) {
        const restored = new Set(completed);
        completedRef.current = restored;
        setSessionCompletedIds(restored);
      }
    } catch {
      // Use safe defaults when storage is unavailable or malformed.
    }

    setPipSupported(Boolean(getDocumentPipApi()));
  }, []);

  useEffect(() => {
    localStorage.setItem(PLAYER_VOLUME_KEY, String(volume));
    localStorage.setItem(PLAYER_MUTED_KEY, String(muted));

    const effectiveVolume = muted ? 0 : volume;
    if (audioRef.current) audioRef.current.volume = effectiveVolume / 100;
    soundcloudWidgetRef.current?.setVolume(effectiveVolume);
  }, [muted, volume]);

  useEffect(() => {
    if (!currentId) {
      if (status === "idle" || status === "caught-up") {
        localStorage.removeItem(PLAYER_CHECKPOINT_KEY);
      }
      return;
    }

    const now = Date.now();
    if (now - checkpointSavedAtRef.current < 900 && status === "playing") return;
    checkpointSavedAtRef.current = now;
    localStorage.setItem(
      PLAYER_CHECKPOINT_KEY,
      JSON.stringify({ trackId: currentId, position }),
    );
  }, [currentId, position, status]);

  useEffect(() => {
    if (getSoundCloudApi()?.Widget) {
      setSoundcloudApiReady(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://w.soundcloud.com/player/api.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => setSoundcloudApiReady(true), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.addEventListener("load", () => setSoundcloudApiReady(true), {
      once: true,
    });
    document.body.appendChild(script);
  }, []);

  const broadcastClaim = useCallback(() => {
    broadcastRef.current?.postMessage({
      type: "claim",
      sender: instanceIdRef.current,
    });
  }, []);

  const pauseActive = useCallback(() => {
    const current = currentSubmissionRef.current;
    if (!current) return;

    pendingAutoplayRef.current = false;
    if (current.provider === "dropbox") {
      audioRef.current?.pause();
    } else {
      soundcloudWidgetRef.current?.pause();
    }
    setStatus("paused");
  }, []);
  pauseActiveRef.current = pauseActive;

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(PLAYBACK_CHANNEL);
    broadcastRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; sender?: string }>) => {
      if (
        event.data?.type === "claim" &&
        event.data.sender !== instanceIdRef.current &&
        (statusRef.current === "playing" || statusRef.current === "loading")
      ) {
        pauseActiveRef.current();
        setNotice("Paused because another XLNT player started on this computer.");
      }
    };

    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, []);

  const buildSoundCloudUrl = useCallback(async (track: PlayerSubmission) => {
    let playableUrl = track.trackUrl;
    let embedUrl: string | null = null;

    if (
      isShortenedSoundCloudLink(track.trackUrl) ||
      isPrivateSoundCloudTrack(track.trackUrl)
    ) {
      const response = await fetch("/api/soundcloud/check-private", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: track.trackUrl }),
      });
      if (!response.ok) throw new Error("SoundCloud could not resolve this link.");
      const data = (await response.json()) as {
        finalUrl?: string;
        embedUrl?: string;
      };
      playableUrl = data.finalUrl || playableUrl;
      embedUrl = data.embedUrl || null;
    }

    const playerUrl = new URL(embedUrl ?? "https://w.soundcloud.com/player/");
    if (!embedUrl) playerUrl.searchParams.set("url", playableUrl);
    playerUrl.searchParams.set("auto_play", "false");
    playerUrl.searchParams.set("color", "#00e5ff");
    playerUrl.searchParams.set("hide_related", "true");
    playerUrl.searchParams.set("show_comments", "false");
    playerUrl.searchParams.set("show_reposts", "false");
    playerUrl.searchParams.set("show_teaser", "false");
    playerUrl.searchParams.set("show_user", "true");
    playerUrl.searchParams.set("single_active", "true");
    playerUrl.searchParams.set("xlnt_load", String(loadTokenRef.current));
    return playerUrl.toString();
  }, []);

  const startTrack = useCallback(
    (track: PlayerSubmission, autoplay: boolean, seek = 0) => {
      loadTokenRef.current += 1;
      currentIdRef.current = track.id;
      currentSubmissionRef.current = track;
      pendingAutoplayRef.current = autoplay;
      pendingSeekRef.current = Math.max(0, seek);
      loadedTrackRef.current = { id: track.id, url: track.trackUrl };
      attemptsRef.current.set(track.id, attemptsRef.current.get(track.id) ?? 0);

      setCurrentId(track.id);
      setStatus("loading");
      setError(null);
      setPosition(Math.max(0, seek));
      setDuration(0);
      setMetadata(getFallbackMetadata(track));

      audioRef.current?.pause();
      soundcloudWidgetRef.current?.pause();

      if (track.provider === "dropbox") {
        const playbackUrl = getDropboxPlaybackUrl(track.trackUrl);
        if (!playbackUrl) {
          handleSourceFailureRef.current("This Dropbox link is not playable.");
          return;
        }
        setSoundcloudSrc(null);
        setDropboxSrc(`${playbackUrl}${playbackUrl.includes("?") ? "&" : "?"}xlnt_load=${loadTokenRef.current}`);
        return;
      }

      setDropboxSrc(null);
      void buildSoundCloudUrl(track)
        .then((url) => {
          if (currentIdRef.current !== track.id) return;
          setSoundcloudSrc(url);
        })
        .catch((loadError) => {
          if (currentIdRef.current !== track.id) return;
          handleSourceFailureRef.current(
            loadError instanceof Error
              ? loadError.message
              : "SoundCloud could not load this track.",
          );
        });
    },
    [buildSoundCloudUrl],
  );
  startTrackRef.current = startTrack;

  const persistReviewed = useCallback(
    async (id: string, reviewed: boolean, attempt = 0): Promise<void> => {
      try {
        const response = await fetch(`/api/queue/${id}/review`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewed }),
        });
        if (!response.ok) throw new Error("Review update failed");
      } catch {
        if (attempt < 2) {
          window.setTimeout(
            () => void persistReviewed(id, reviewed, attempt + 1),
            1000 * 2 ** attempt,
          );
          return;
        }
        setError("Playback continued, but the Reviewed badge did not save. Retry from the queue.");
      }
    },
    [],
  );

  const stopForQueueEnd = useCallback((message?: string) => {
    pendingAutoplayRef.current = false;
    setCurrentId(null);
    currentIdRef.current = null;
    currentSubmissionRef.current = null;
    loadedTrackRef.current = null;
    setPosition(0);
    setDuration(0);
    setStatus("caught-up");
    setMetadata({
      artist: "XLNT Feedback",
      title: message ?? "All caught up",
      artwork: null,
    });
  }, []);

  const advanceAfterCurrent = useCallback(
    (markReviewed: boolean) => {
      const current = currentSubmissionRef.current;
      if (!current) return;

      pauseActiveRef.current();
      let completed = completedRef.current;
      if (markReviewed) {
        completed = new Set(completedRef.current);
        completed.add(current.id);
        completedRef.current = completed;
        setSessionCompletedIds(completed);
        void persistReviewed(current.id, true);
      }

      const next = findNextPlayable(
        submissionsRef.current,
        completed,
        failedRef.current,
      );
      if (next) {
        startTrackRef.current(next, true, 0);
      } else {
        stopForQueueEnd(
          failedRef.current.size > 0
            ? `All playable tracks handled · ${failedRef.current.size} unavailable`
            : "All caught up",
        );
      }
    },
    [persistReviewed, stopForQueueEnd],
  );

  const finishCurrent = useCallback(() => {
    advanceAfterCurrent(true);
  }, [advanceAfterCurrent]);
  finishCurrentRef.current = finishCurrent;

  const handleSourceFailure = useCallback(
    (message: string) => {
      const current = currentSubmissionRef.current;
      if (!current) return;
      const attempts = attemptsRef.current.get(current.id) ?? 0;

      if (attempts < 1) {
        attemptsRef.current.set(current.id, attempts + 1);
        setNotice(`Retrying ${getFallbackMetadata(current).title}…`);
        startTrackRef.current(current, true, positionRef.current);
        return;
      }

      pauseActiveRef.current();
      const failed = new Set(failedRef.current);
      failed.add(current.id);
      failedRef.current = failed;
      setFailedIds(failed);
      setError(`${message} Skipped without marking it Reviewed.`);

      const next = findNextPlayable(
        submissionsRef.current,
        completedRef.current,
        failed,
      );
      if (next) {
        startTrackRef.current(next, true, 0);
      } else {
        stopForQueueEnd(`No more playable tracks · ${failed.size} unavailable`);
      }
    },
    [stopForQueueEnd],
  );
  handleSourceFailureRef.current = handleSourceFailure;

  const playActive = useCallback(() => {
    const current = currentSubmissionRef.current;
    if (!current) {
      const next = findNextPlayable(
        submissionsRef.current,
        completedRef.current,
        failedRef.current,
      );
      if (next) startTrackRef.current(next, true, 0);
      return;
    }

    setError(null);
    setNotice(null);
    pendingAutoplayRef.current = true;
    broadcastClaim();

    if (
      loadedTrackRef.current?.id !== current.id ||
      loadedTrackRef.current.url !== current.trackUrl
    ) {
      startTrackRef.current(current, true, positionRef.current);
      return;
    }

    setStatus("loading");
    if (current.provider === "dropbox") {
      const audio = audioRef.current;
      if (!audio) return;
      void audio.play().catch((playError: DOMException) => {
        setStatus("paused");
        setNotice(
          playError.name === "NotAllowedError"
            ? "Your browser blocked automatic playback. Press Play to continue."
            : "Dropbox could not resume. Press Play to retry.",
        );
      });
    } else if (soundcloudWidgetRef.current) {
      soundcloudWidgetRef.current.play();
    }
  }, [broadcastClaim]);

  const togglePlayback = useCallback(() => {
    if (statusRef.current === "playing") pauseActiveRef.current();
    else playActive();
  }, [playActive]);

  const replayTenSeconds = useCallback(() => {
    const current = currentSubmissionRef.current;
    if (!current) return;
    const nextPosition = Math.max(0, positionRef.current - 10);
    if (current.provider === "dropbox" && audioRef.current) {
      audioRef.current.currentTime = nextPosition;
    } else {
      soundcloudWidgetRef.current?.seekTo(nextPosition * 1000);
    }
    setPosition(nextPosition);
  }, []);

  const handleNext = useCallback(() => {
    if (currentSubmissionRef.current) advanceAfterCurrent(true);
  }, [advanceAfterCurrent]);

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(Math.min(100, Math.max(0, Math.round(value))));
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((value) => !value), []);

  useEffect(() => {
    const submissionsCollection = collection(db, "submissions");
    return onSnapshot(
      submissionsCollection,
      (snapshot) => {
        const nextSubmissions: PlayerSubmission[] = snapshot.docs.flatMap((document) => {
          const data = document.data();
          const trackUrl = data.trackUrl ?? data.soundcloudLink;
          if (typeof trackUrl !== "string" || !trackUrl) return [];

          return [
            {
              id: document.id,
              trackUrl,
              provider: inferTrackProvider(trackUrl, data.provider),
              trackTitle: data.trackTitle ?? null,
              artistName: data.artistName ?? null,
              order: data.order,
              timestamp: data.timestamp ?? null,
              reviewedAt: data.reviewedAt ?? null,
              youtubeChannelTitle: data.youtubeChannelTitle ?? null,
            },
          ];
        });
        const sorted = sortPlayerQueue(nextSubmissions);
        submissionsRef.current = sorted;
        setSubmissions(sorted);
        setQueueLoaded(true);

        if (!restoredRef.current) {
          restoredRef.current = true;
          const checkpoint = parseCheckpoint();
          const savedTrack = checkpoint
            ? sorted.find(
                (item) => item.id === checkpoint.trackId && !item.reviewedAt,
              )
            : null;
          if (savedTrack) {
            setNotice("Playback restored. Press Play when you are ready.");
            startTrackRef.current(savedTrack, false, checkpoint?.position ?? 0);
          } else if (sorted.length === 0) {
            setMetadata({
              artist: "XLNT Feedback",
              title: "Queue is empty",
              artwork: null,
            });
          } else if (
            !findNextPlayable(sorted, completedRef.current, failedRef.current)
          ) {
            stopForQueueEnd();
          }
          return;
        }

        const activeId = currentIdRef.current;
        if (!activeId) return;
        const previous = currentSubmissionRef.current;
        const updated = sorted.find((item) => item.id === activeId);
        if (!updated) {
          pauseActiveRef.current();
          const next = findNextPlayable(
            sorted,
            completedRef.current,
            failedRef.current,
          );
          if (next) startTrackRef.current(next, true, 0);
          else stopForQueueEnd(sorted.length ? "All caught up" : "Queue is empty");
          return;
        }

        currentSubmissionRef.current = updated;
        if (previous && previous.trackUrl !== updated.trackUrl) {
          setNotice("The active submission changed. Restarting it from the beginning.");
          startTrackRef.current(updated, statusRef.current === "playing", 0);
        }
      },
      () => {
        setQueueLoaded(true);
        setError("The live queue disconnected. Check your internet connection.");
      },
    );
  }, [stopForQueueEnd]);

  useEffect(() => {
    if (status !== "loading" || !currentId) return;
    const timeout = window.setTimeout(
      () =>
        handleSourceFailureRef.current(
          `${getFallbackMetadata(currentSubmissionRef.current!).title} did not become ready.`,
        ),
      LOAD_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [currentId, soundcloudSrc, dropboxSrc, status]);

  useEffect(() => {
    if (!soundcloudApiReady || !soundcloudSrc || !soundcloudIframeRef.current) return;
    const api = getSoundCloudApi();
    if (!api?.Widget) return;

    const widget = api.Widget(soundcloudIframeRef.current);
    soundcloudWidgetRef.current = widget;
    const currentTrackId = currentIdRef.current;

    const ready = () => {
      if (currentIdRef.current !== currentTrackId) return;
      widget.setVolume(muted ? 0 : volume);
      widget.getDuration((milliseconds) => setDuration(milliseconds / 1000));
      widget.getCurrentSound((sound) => {
        setMetadata((previous) => ({
          artist: sound.user?.username?.trim() || previous.artist,
          title: sound.title?.trim() || previous.title,
          artwork: sound.artwork_url || previous.artwork,
        }));
      });
      if (pendingSeekRef.current > 0) {
        widget.seekTo(pendingSeekRef.current * 1000);
      }
      if (pendingAutoplayRef.current) widget.play();
      else setStatus("paused");
    };
    const play = () => {
      if (currentIdRef.current !== currentTrackId) return;
      attemptsRef.current.set(currentTrackId ?? "", 0);
      broadcastClaim();
      setStatus("playing");
      setError(null);
    };
    const pause = () => {
      if (
        currentIdRef.current === currentTrackId &&
        statusRef.current !== "loading"
      ) {
        setStatus("paused");
      }
    };
    const progress = (event?: SoundCloudProgress) => {
      if (
        currentIdRef.current === currentTrackId &&
        typeof event?.currentPosition === "number"
      ) {
        setPosition(event.currentPosition / 1000);
      }
    };
    const finish = () => {
      if (currentIdRef.current === currentTrackId) finishCurrentRef.current();
    };
    const widgetError = () => {
      if (currentIdRef.current === currentTrackId) {
        handleSourceFailureRef.current("SoundCloud could not play this track.");
      }
    };

    widget.bind("ready", ready);
    widget.bind("play", play);
    widget.bind("pause", pause);
    widget.bind("play_progress", progress);
    widget.bind("finish", finish);
    widget.bind("error", widgetError);

    return () => {
      for (const event of [
        "ready",
        "play",
        "pause",
        "play_progress",
        "finish",
        "error",
      ]) {
        try {
          widget.unbind(event);
        } catch {
          // Ignore teardown errors from a reloading cross-origin iframe.
        }
      }
      if (soundcloudWidgetRef.current === widget) soundcloudWidgetRef.current = null;
    };
  }, [broadcastClaim, muted, soundcloudApiReady, soundcloudSrc, volume]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: metadata.title,
      artist: metadata.artist,
      album: "XLNT Feedback Queue",
      artwork: metadata.artwork
        ? [{ src: metadata.artwork, sizes: "500x500" }]
        : undefined,
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    safeSetActionHandler("play", () => playActive());
    safeSetActionHandler("pause", () => pauseActiveRef.current());
    safeSetActionHandler("nexttrack", () => handleNext());
    safeSetActionHandler("seekbackward", () => replayTenSeconds());

    return () => {
      safeSetActionHandler("play", null);
      safeSetActionHandler("pause", null);
      safeSetActionHandler("nexttrack", null);
      safeSetActionHandler("seekbackward", null);
    };
  }, [handleNext, isPlaying, metadata, playActive, replayTenSeconds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a")) return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key.toLowerCase() === "r" || event.key === "ArrowLeft") {
        event.preventDefault();
        replayTenSeconds();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        handleNext();
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleMute();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        handleVolumeChange(volume + (event.key === "ArrowUp" ? 5 : -5));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNext, handleVolumeChange, replayTenSeconds, toggleMute, togglePlayback, volume]);

  const openPip = useCallback(async () => {
    const api = getDocumentPipApi();
    if (!api) return;

    try {
      const nextWindow = await api.requestWindow({ width: 420, height: 190 });
      nextWindow.document.title = "XLNT Feedback Player";
      document
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((node) => nextWindow.document.head.appendChild(node.cloneNode(true)));
      nextWindow.document.body.className = styles.pipBody;
      nextWindow.addEventListener(
        "pagehide",
        () => setPipWindow((current) => (current === nextWindow ? null : current)),
        { once: true },
      );
      setPipWindow(nextWindow);
    } catch {
      setError("The floating player could not open. Allow Picture-in-Picture and try again.");
    }
  }, []);

  const closePip = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  const panel = (
    <PlayerPanel
      current={currentSubmission}
      status={status}
      metadata={metadata}
      position={position}
      duration={duration}
      queuePosition={queuePosition}
      queueTotal={sortedSubmissions.length}
      hasNext={Boolean(currentSubmission || nextAvailable)}
      hasNewTrack={status === "caught-up" && Boolean(nextAvailable)}
      volume={volume}
      muted={muted}
      onTogglePlayback={togglePlayback}
      onReplay={replayTenSeconds}
      onNext={handleNext}
      onMute={toggleMute}
      onVolume={handleVolumeChange}
      floating={Boolean(pipWindow)}
    />
  );

  return (
    <main className={styles.pageShell}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Admin playback</p>
          <h1>XLNT Feedback Player</h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/queue" className={styles.secondaryButton}>
            Back to queue
          </Link>
          {pipWindow ? (
            <button type="button" onClick={closePip} className={styles.floatButton}>
              Return player
            </button>
          ) : (
            <button
              type="button"
              onClick={openPip}
              disabled={!pipSupported}
              className={styles.floatButton}
            >
              Float player
            </button>
          )}
        </div>
      </header>

      <section className={styles.playerStage} aria-label="Admin queue player">
        {pipWindow ? (
          <div className={styles.floatingPlaceholder}>
            <span className={styles.liveOrb} />
            <strong>Player is floating</strong>
            <p>Audio continues here. Close the floating window to return the controls.</p>
            <button type="button" onClick={closePip} className={styles.secondaryButton}>
              Return controls
            </button>
          </div>
        ) : (
          panel
        )}
      </section>

      <div className={styles.messageStack} aria-live="polite">
        {!queueLoaded && <p className={styles.notice}>Connecting to the live queue…</p>}
        {notice && (
          <button type="button" className={styles.notice} onClick={() => setNotice(null)}>
            {notice}
          </button>
        )}
        {error && (
          <button type="button" className={styles.error} onClick={() => setError(null)}>
            {error}
          </button>
        )}
        {!pipSupported && (
          <p className={styles.browserNote}>
            This player works normally here. Use current Chrome or Edge for an always-on-top
            floating window.
          </p>
        )}
      </div>

      <footer className={styles.shortcutBar}>
        <span><kbd>Space</kbd> Play / pause</span>
        <span><kbd>R</kbd> Replay 10s</span>
        <span><kbd>N</kbd> Next</span>
        <span><kbd>M</kbd> Mute</span>
      </footer>

      <div className={styles.mediaDock} aria-hidden="true">
        <audio
          ref={audioRef}
          src={dropboxSrc ?? undefined}
          preload="auto"
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget;
            setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
            if (pendingSeekRef.current > 0) {
              audio.currentTime = Math.min(pendingSeekRef.current, audio.duration || pendingSeekRef.current);
            }
            audio.volume = (muted ? 0 : volume) / 100;
            if (pendingAutoplayRef.current) {
              void audio.play().catch((playError: DOMException) => {
                setStatus("paused");
                setNotice(
                  playError.name === "NotAllowedError"
                    ? "Your browser blocked automatic playback. Press Play to continue."
                    : "Dropbox could not start. Press Play to retry.",
                );
              });
            } else {
              setStatus("paused");
            }
          }}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onDurationChange={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (Number.isFinite(nextDuration)) setDuration(nextDuration);
          }}
          onPlay={() => {
            attemptsRef.current.set(currentIdRef.current ?? "", 0);
            broadcastClaim();
            setStatus("playing");
            setError(null);
          }}
          onPause={() => {
            if (!audioRef.current?.ended && statusRef.current !== "loading") {
              setStatus("paused");
            }
          }}
          onEnded={() => finishCurrentRef.current()}
          onError={() => {
            if (dropboxSrc) {
              handleSourceFailureRef.current("Dropbox could not play this audio file.");
            }
          }}
        />
        {soundcloudSrc && (
          <iframe
            ref={soundcloudIframeRef}
            title="SoundCloud playback engine"
            src={soundcloudSrc}
            allow="autoplay"
            tabIndex={-1}
          />
        )}
      </div>

      {pipWindow && createPortal(panel, pipWindow.document.body)}
    </main>
  );
}

function PlayerPanel({
  current,
  status,
  metadata,
  position,
  duration,
  queuePosition,
  queueTotal,
  hasNext,
  hasNewTrack,
  volume,
  muted,
  onTogglePlayback,
  onReplay,
  onNext,
  onMute,
  onVolume,
  floating,
}: {
  current: PlayerSubmission | null;
  status: PlaybackStatus;
  metadata: { artist: string; title: string; artwork: string | null };
  position: number;
  duration: number;
  queuePosition: { current: number; total: number } | null;
  queueTotal: number;
  hasNext: boolean;
  hasNewTrack: boolean;
  volume: number;
  muted: boolean;
  onTogglePlayback: () => void;
  onReplay: () => void;
  onNext: () => void;
  onMute: () => void;
  onVolume: (volume: number) => void;
  floating: boolean;
}) {
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const statusLabel =
    status === "playing"
      ? "Live"
      : status === "loading"
        ? "Loading"
        : hasNewTrack
          ? "New track ready"
          : status === "caught-up"
            ? "Caught up"
            : status === "error"
              ? "Needs attention"
              : current
                ? "Paused"
                : queueTotal
                  ? "Ready"
                  : "Queue empty";
  const canPlay = Boolean(current || hasNext);

  return (
    <article className={`${styles.playerPanel} ${floating ? styles.floatingPanel : ""}`}>
      <div className={styles.panelGrid} aria-hidden="true" />
      <header className={styles.panelHeader}>
        <div className={styles.brandLockup}>
          <span className={styles.brandMark}>X</span>
          <span>XLNT Feedback</span>
        </div>
        <div className={styles.queueStatus}>
          <span>
            {queuePosition
              ? `${queuePosition.current} of ${queuePosition.total}`
              : `${queueTotal} queued`}
          </span>
          <span className={`${styles.statusPill} ${status === "playing" ? styles.statusLive : ""}`}>
            <span className={styles.statusDot} />
            {statusLabel}
          </span>
        </div>
      </header>

      <div className={styles.trackInfo}>
        <p className={styles.artistName}>{metadata.artist}</p>
        <div className={styles.titleRow}>
          <h2 title={metadata.title}>{metadata.title}</h2>
          {current && (
            <a
              href={current.trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.providerLink}
              title={`Open in ${current.provider === "dropbox" ? "Dropbox" : "SoundCloud"}`}
            >
              {current.provider === "dropbox" ? "Dropbox" : "SoundCloud"} ↗
            </a>
          )}
        </div>
      </div>

      <div className={styles.timeline}>
        <span>{formatTime(position)}</span>
        <div className={styles.progressTrack} aria-label="Track progress">
          <span className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <span>{formatTime(duration)}</span>
      </div>

      <div className={styles.transportRow}>
        <button
          type="button"
          onClick={onReplay}
          disabled={!current}
          className={styles.transportButton}
          aria-label="Replay 10 seconds"
          title="Replay 10 seconds (R)"
        >
          <span className={styles.replayIcon}>↶</span>
          <span>10</span>
        </button>

        <button
          type="button"
          onClick={onTogglePlayback}
          disabled={!canPlay}
          className={`${styles.playButton} ${status === "playing" ? styles.playingButton : ""}`}
          aria-label={status === "playing" ? "Pause" : "Play"}
        >
          {status === "loading" ? (
            <span className={styles.spinner} />
          ) : status === "playing" ? (
            <span className={styles.pauseIcon}><i /><i /></span>
          ) : (
            <span className={styles.playIcon} />
          )}
          <span>{status === "playing" ? "Pause" : current ? "Resume" : "Start"}</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!current}
          className={styles.nextButton}
          aria-label="Mark reviewed and play next track"
          title="Mark Reviewed and play next (N)"
        >
          Next <span>›</span>
        </button>

        <div className={styles.volumeControl}>
          <button
            type="button"
            onClick={onMute}
            className={styles.muteButton}
            aria-label={muted ? "Unmute" : "Mute"}
            title={muted ? "Unmute (M)" : "Mute (M)"}
          >
            {muted || volume === 0 ? "×" : volume < 45 ? "◖" : "◕"}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={muted ? 0 : volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            aria-label="Volume"
            className={styles.volumeSlider}
            style={{ "--volume": `${muted ? 0 : volume}%` } as React.CSSProperties}
          />
        </div>
      </div>
    </article>
  );
}
