"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ADMIN_PLAYER_SESSION_COMPLETED_KEY,
  findNextPlayable,
  findPreviousQueueItem,
  shouldRestartCurrentTrack,
  sortPlayerQueue,
  type PlayerSubmission,
} from "@/lib/admin-player";
import { PlaybackController } from "@/lib/playback-controller";
import {
  getDropboxPlaybackUrl,
  getTrackDisplay,
  inferTrackProvider,
  isPrivateSoundCloudTrack,
  isShortenedSoundCloudLink,
  resolveTrackArtistName,
} from "@/lib/track-links";
import { db } from "../firebase/firebase";
import styles from "./player.module.css";

type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "caught-up";

type SoundCloudProgress = { currentPosition?: number };

type SoundCloudSound = {
  title?: string;
  artwork_url?: string;
  user?: { username?: string };
};

type SoundCloudWidget = {
  bind: (event: string, listener: (event?: SoundCloudProgress) => void) => void;
  unbind: (event: string) => void;
  play: () => void;
  pause: () => void;
  seekTo: (milliseconds: number) => void;
  setVolume: (volume: number) => void;
  getDuration: (callback: (milliseconds: number) => void) => void;
  getPosition: (callback: (milliseconds: number) => void) => void;
  isPaused: (callback: (paused: boolean) => void) => void;
  getCurrentSound: (callback: (sound: SoundCloudSound | null) => void) => void;
};

type PlaybackCheckpoint = { trackId: string; position: number };
type LoadedSource = { url: string; generation: number };

const PLAYER_VOLUME_KEY = "xlnt-admin-player-volume";
const PLAYER_MUTED_KEY = "xlnt-admin-player-muted";
const PLAYER_CHECKPOINT_KEY = "xlnt-admin-player-checkpoint";
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
    // Some browsers expose Media Session without every action.
  }
};

const getSoundCloudApi = () =>
  (
    window as unknown as {
      SC?: { Widget?: (iframe: HTMLIFrameElement) => SoundCloudWidget };
    }
  ).SC;

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

const getFallbackMetadata = (submission: PlayerSubmission) => {
  const trackDisplay = getTrackDisplay(
    submission.trackUrl,
    submission.provider,
  );
  return {
    artist: resolveTrackArtistName(
      submission.artistName,
      null,
      trackDisplay.artist,
    ),
    title:
      (submission.provider === "soundcloud" ? trackDisplay.track : null) ||
      submission.trackTitle?.trim() ||
      trackDisplay.display,
    artwork: null as string | null,
  };
};

const getEffectiveVolume = (volume: number, muted: boolean) =>
  muted ? 0 : volume;

export default function AdminPlayer({
  portalTarget = null,
}: {
  portalTarget?: HTMLElement | null;
}) {
  const [submissions, setSubmissions] = useState<PlayerSubmission[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [metadata, setMetadata] = useState({
    artist: "",
    title: "Ready to play",
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
  const [soundcloudSource, setSoundcloudSource] = useState<LoadedSource | null>(null);
  const [dropboxSource, setDropboxSource] = useState<LoadedSource | null>(null);
  const [soundcloudApiReady, setSoundcloudApiReady] = useState(false);

  const controllerRef = useRef<PlaybackController | null>(null);
  if (!controllerRef.current) controllerRef.current = new PlaybackController();
  const controller = controllerRef.current;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const soundcloudIframeRef = useRef<HTMLIFrameElement | null>(null);
  const soundcloudWidgetRef = useRef<SoundCloudWidget | null>(null);
  const submissionsRef = useRef<PlayerSubmission[]>([]);
  const currentIdRef = useRef<string | null>(null);
  const currentSubmissionRef = useRef<PlayerSubmission | null>(null);
  const statusRef = useRef<PlaybackStatus>("idle");
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const volumeRef = useRef(90);
  const mutedRef = useRef(false);
  const completedRef = useRef<Set<string>>(new Set());
  const failedRef = useRef<Set<string>>(new Set());
  const pendingAutoplayRef = useRef(false);
  const pendingSeekRef = useRef(0);
  const loadedTrackRef = useRef<{
    id: string;
    url: string;
    generation: number;
  } | null>(null);
  const restoredRef = useRef(false);
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const loadGenerationRef = useRef(0);
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

  const currentSubmission = useMemo(
    () => submissions.find((submission) => submission.id === currentId) ?? null,
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
        ADMIN_PLAYER_SESSION_COMPLETED_KEY,
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
    const unregisterDropbox = controller.register("dropbox", {
      load: (source, generation) => {
        setSoundcloudSource(null);
        setDropboxSource({ url: source, generation });
      },
      play: () => audioRef.current?.play(),
      pause: () => audioRef.current?.pause(),
      seek: (seconds) => {
        if (audioRef.current) audioRef.current.currentTime = seconds;
      },
      setVolume: (nextVolume) => {
        if (audioRef.current) audioRef.current.volume = nextVolume / 100;
      },
    });
    const unregisterSoundcloud = controller.register("soundcloud", {
      load: (source, generation) => {
        setDropboxSource(null);
        setSoundcloudSource({ url: source, generation });
      },
      play: () => soundcloudWidgetRef.current?.play(),
      pause: () => soundcloudWidgetRef.current?.pause(),
      seek: (seconds) => soundcloudWidgetRef.current?.seekTo(seconds * 1000),
      setVolume: (nextVolume) => soundcloudWidgetRef.current?.setVolume(nextVolume),
    });

    return () => {
      controller.clear();
      unregisterDropbox();
      unregisterSoundcloud();
    };
  }, [controller]);

  useEffect(() => {
    try {
      const savedVolume = Number.parseInt(
        localStorage.getItem(PLAYER_VOLUME_KEY) ?? "90",
        10,
      );
      if (Number.isFinite(savedVolume)) {
        const nextVolume = Math.min(100, Math.max(0, savedVolume));
        volumeRef.current = nextVolume;
        setVolume(nextVolume);
      }
      const nextMuted = localStorage.getItem(PLAYER_MUTED_KEY) === "true";
      mutedRef.current = nextMuted;
      setMuted(nextMuted);

      const completed = JSON.parse(
        sessionStorage.getItem(ADMIN_PLAYER_SESSION_COMPLETED_KEY) ?? "[]",
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
      // Safe defaults are already initialized.
    }

    const query = new URLSearchParams(window.location.search);
    if (query.get("popup") === "blocked") {
      setNotice("Popup blocked — player opened in this tab.");
      query.delete("popup");
      const nextQuery = query.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`,
      );
    }
  }, []);

  useEffect(() => {
    volumeRef.current = volume;
    mutedRef.current = muted;
    try {
      localStorage.setItem(PLAYER_VOLUME_KEY, String(volume));
      localStorage.setItem(PLAYER_MUTED_KEY, String(muted));
    } catch {
      // Playback still works when storage is blocked.
    }
    controller.setVolume(getEffectiveVolume(volume, muted));
  }, [controller, muted, volume]);

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
    const markReady = () => setSoundcloudApiReady(true);
    if (existing) {
      existing.addEventListener("load", markReady, { once: true });
      return () => existing.removeEventListener("load", markReady);
    }

    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.addEventListener("load", markReady, { once: true });
    document.body.appendChild(script);
    return () => script.removeEventListener("load", markReady);
  }, []);

  const broadcastClaim = useCallback(() => {
    broadcastRef.current?.postMessage({
      type: "claim",
      sender: instanceIdRef.current,
    });
  }, []);

  const pauseActive = useCallback(() => {
    if (!currentSubmissionRef.current) return;
    pendingAutoplayRef.current = false;
    controller.pause();
    setStatus("paused");
  }, [controller]);
  pauseActiveRef.current = pauseActive;

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(PLAYBACK_CHANNEL);
    broadcastRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; sender?: string }>) => {
      if (event.data?.type === "reset-reviewed") {
        const resetCompleted = new Set<string>();
        const resetFailed = new Set<string>();
        completedRef.current = resetCompleted;
        failedRef.current = resetFailed;
        setSessionCompletedIds(resetCompleted);
        setFailedIds(resetFailed);
        setNotice("Queue review status reset.");
        return;
      }
      if (
        event.data?.type === "claim" &&
        event.data.sender !== instanceIdRef.current &&
        (statusRef.current === "playing" || statusRef.current === "loading")
      ) {
        pauseActiveRef.current();
        setNotice("Paused because another XLNT player started.");
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
    playerUrl.searchParams.set("show_user", "false");
    playerUrl.searchParams.set("single_active", "true");
    return playerUrl.toString();
  }, []);

  const startTrack = useCallback(
    (track: PlayerSubmission, autoplay: boolean, seek = 0) => {
      const isSameSource =
        loadedTrackRef.current?.id === track.id &&
        loadedTrackRef.current.url === track.trackUrl;
      const generation = ++loadGenerationRef.current;
      controller.activate(track.provider, generation);
      currentIdRef.current = track.id;
      currentSubmissionRef.current = track;
      pendingAutoplayRef.current = autoplay;
      pendingSeekRef.current = Math.max(0, seek);
      loadedTrackRef.current = {
        id: track.id,
        url: track.trackUrl,
        generation,
      };
      if (!isSameSource) attemptsRef.current.set(track.id, 0);

      setCurrentId(track.id);
      setStatus("loading");
      setError(null);
      setPosition(Math.max(0, seek));
      setDuration(0);
      setMetadata(getFallbackMetadata(track));

      if (track.provider === "dropbox") {
        setSoundcloudSource(null);
        const playbackUrl = getDropboxPlaybackUrl(track.trackUrl);
        if (!playbackUrl) {
          handleSourceFailureRef.current("This Dropbox link is not playable.");
          return;
        }
        const separator = playbackUrl.includes("?") ? "&" : "?";
        controller.load(
          "dropbox",
          `${playbackUrl}${separator}xlnt_load=${generation}`,
          generation,
        );
        return;
      }

      setDropboxSource(null);
      void buildSoundCloudUrl(track)
        .then((url) => {
          if (
            currentIdRef.current !== track.id ||
            !controller.isCurrent(generation)
          ) {
            return;
          }
          const playerUrl = new URL(url);
          playerUrl.searchParams.set("xlnt_load", String(generation));
          controller.load("soundcloud", playerUrl.toString(), generation);
        })
        .catch((loadError) => {
          if (
            currentIdRef.current !== track.id ||
            !controller.isCurrent(generation)
          ) {
            return;
          }
          handleSourceFailureRef.current(
            loadError instanceof Error
              ? loadError.message
              : "SoundCloud could not load this track.",
          );
        });
    },
    [buildSoundCloudUrl, controller],
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
        setError("Playback continued, but Reviewed did not save.");
      }
    },
    [],
  );

  const stopForQueueEnd = useCallback(
    (message = "All caught up") => {
      pendingAutoplayRef.current = false;
      controller.clear();
      setCurrentId(null);
      currentIdRef.current = null;
      currentSubmissionRef.current = null;
      loadedTrackRef.current = null;
      setSoundcloudSource(null);
      setDropboxSource(null);
      setPosition(0);
      setDuration(0);
      setStatus("caught-up");
      setMetadata({ artist: "", title: message, artwork: null });
    },
    [controller],
  );

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
            ? `${failedRef.current.size} unavailable`
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
      const currentLoad = loadedTrackRef.current;
      if (!current || !currentLoad || !controller.isCurrent(currentLoad.generation)) {
        return;
      }
      const attempts = attemptsRef.current.get(current.id) ?? 0;
      if (attempts < 1) {
        attemptsRef.current.set(current.id, attempts + 1);
        setNotice(`Retrying ${getFallbackMetadata(current).title}…`);
        startTrackRef.current(current, true, positionRef.current);
        return;
      }

      pendingAutoplayRef.current = false;
      controller.pause();
      const failed = new Set(failedRef.current);
      failed.add(current.id);
      failedRef.current = failed;
      setFailedIds(failed);
      setError(`${message} Skipped without marking Reviewed.`);

      const next = findNextPlayable(
        submissionsRef.current,
        completedRef.current,
        failed,
      );
      if (next) startTrackRef.current(next, true, 0);
      else stopForQueueEnd(`${failed.size} unavailable`);
    },
    [controller, stopForQueueEnd],
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
    const playResult = controller.play();
    if (playResult instanceof Promise) {
      void playResult.catch((playError: DOMException) => {
        pendingAutoplayRef.current = false;
        setStatus("paused");
        setNotice(
          playError.name === "NotAllowedError"
            ? "Press Play to allow audio."
            : "Playback could not resume. Press Play to retry.",
        );
      });
    }
  }, [broadcastClaim, controller]);

  const togglePlayback = useCallback(() => {
    if (statusRef.current === "playing") pauseActiveRef.current();
    else playActive();
  }, [playActive]);

  const handlePrevious = useCallback(() => {
    const current = currentSubmissionRef.current;
    if (current && shouldRestartCurrentTrack(positionRef.current)) {
      pendingSeekRef.current = 0;
      controller.seek(0);
      positionRef.current = 0;
      setPosition(0);
      return;
    }

    const previousSubmission = findPreviousQueueItem(
      submissionsRef.current,
      current?.id ?? null,
    );
    if (previousSubmission) {
      const keepPlaying =
        statusRef.current === "playing" || pendingAutoplayRef.current;
      startTrackRef.current(previousSubmission, keepPlaying, 0);
      return;
    }

    if (current) {
      controller.seek(0);
      positionRef.current = 0;
      setPosition(0);
    }
  }, [controller]);

  const handleNext = useCallback(() => {
    if (currentSubmissionRef.current) advanceAfterCurrent(true);
  }, [advanceAfterCurrent]);

  const handleSeek = useCallback(
    (seconds: number) => {
      if (!currentSubmissionRef.current || durationRef.current <= 0) return;
      const nextPosition = Math.min(
        durationRef.current,
        Math.max(0, seconds),
      );
      pendingSeekRef.current = nextPosition;
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      controller.seek(nextPosition);
      pendingSeekRef.current = 0;
    },
    [controller],
  );

  const handleVolumeChange = useCallback((value: number) => {
    const nextVolume = Math.min(100, Math.max(0, Math.round(value)));
    volumeRef.current = nextVolume;
    mutedRef.current = false;
    setVolume(nextVolume);
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      mutedRef.current = !value;
      return !value;
    });
  }, []);

  useEffect(() => {
    const submissionsCollection = collection(db, "submissions");
    return onSnapshot(
      submissionsCollection,
      (snapshot) => {
        const nextSubmissions: PlayerSubmission[] = snapshot.docs.flatMap(
          (document) => {
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
              },
            ];
          },
        );
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
            setNotice("Playback restored.");
            startTrackRef.current(savedTrack, false, checkpoint?.position ?? 0);
          } else if (sorted.length === 0) {
            setMetadata({
              artist: "",
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
          setNotice("Track changed — restarting.");
          startTrackRef.current(updated, statusRef.current === "playing", 0);
        }
      },
      () => {
        setQueueLoaded(true);
        setError("Live queue disconnected.");
      },
    );
  }, [stopForQueueEnd]);

  useEffect(() => {
    if (status !== "loading" || !currentId) return;
    const currentLoad = loadedTrackRef.current;
    if (!currentLoad) return;
    const timeout = window.setTimeout(() => {
      if (
        controller.isCurrent(currentLoad.generation) &&
        statusRef.current === "loading"
      ) {
        handleSourceFailureRef.current(
          `${getFallbackMetadata(currentSubmissionRef.current!).title} did not become ready.`,
        );
      }
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [controller, currentId, dropboxSource, soundcloudSource, status]);

  useEffect(() => {
    if (
      !soundcloudApiReady ||
      !soundcloudSource ||
      !soundcloudIframeRef.current
    ) {
      return;
    }
    const api = getSoundCloudApi();
    if (!api?.Widget) return;

    const widget = api.Widget(soundcloudIframeRef.current);
    soundcloudWidgetRef.current = widget;
    const { generation } = soundcloudSource;
    const trackId = currentIdRef.current;
    const isCurrent = () =>
      controller.isCurrent(generation) && currentIdRef.current === trackId;

    const ready = () => {
      if (!isCurrent()) return;
      controller.setVolume(
        getEffectiveVolume(volumeRef.current, mutedRef.current),
      );
      widget.getDuration((milliseconds) => {
        if (isCurrent()) setDuration(milliseconds / 1000);
      });
      widget.getCurrentSound((sound) => {
        if (!isCurrent()) return;
        const submittedArtistName = currentSubmissionRef.current?.artistName?.trim();
        setMetadata((previous) => ({
          artist: resolveTrackArtistName(
            submittedArtistName,
            sound?.user?.username,
            previous.artist,
          ),
          title: sound?.title?.trim() || previous.title,
          artwork: sound?.artwork_url || previous.artwork,
        }));
      });
      if (pendingSeekRef.current > 0) {
        widget.seekTo(pendingSeekRef.current * 1000);
        pendingSeekRef.current = 0;
      }
      if (pendingAutoplayRef.current) widget.play();
      else setStatus("paused");
    };
    const play = () => {
      if (!isCurrent()) return;
      pendingAutoplayRef.current = false;
      broadcastClaim();
      setStatus("playing");
      setError(null);
    };
    const pause = () => {
      if (isCurrent() && statusRef.current !== "loading") setStatus("paused");
    };
    const progress = (event?: SoundCloudProgress) => {
      if (isCurrent() && typeof event?.currentPosition === "number") {
        const nextPosition = event.currentPosition / 1000;
        positionRef.current = nextPosition;
        setPosition(nextPosition);
      }
    };
    const finish = () => {
      if (isCurrent()) finishCurrentRef.current();
    };
    const widgetError = () => {
      if (isCurrent()) {
        handleSourceFailureRef.current("SoundCloud could not play this track.");
      }
    };

    const syncWidgetState = () => {
      if (!isCurrent()) return;
      widget.getDuration((milliseconds) => {
        if (!isCurrent() || milliseconds <= 0) return;
        const nextDuration = milliseconds / 1000;
        durationRef.current = nextDuration;
        setDuration(nextDuration);
      });
      widget.getPosition((milliseconds) => {
        if (!isCurrent() || milliseconds < 0) return;
        const nextPosition = milliseconds / 1000;
        positionRef.current = nextPosition;
        setPosition(nextPosition);
      });
      widget.isPaused((paused) => {
        if (!isCurrent()) return;
        if (!paused) {
          pendingAutoplayRef.current = false;
          setStatus("playing");
          setError(null);
        } else if (
          statusRef.current === "playing" &&
          !pendingAutoplayRef.current
        ) {
          setStatus("paused");
        }
      });
    };

    widget.bind("ready", ready);
    widget.bind("play", play);
    widget.bind("pause", pause);
    widget.bind("play_progress", progress);
    widget.bind("finish", finish);
    widget.bind("error", widgetError);
    const stateSyncInterval = window.setInterval(syncWidgetState, 1000);
    syncWidgetState();
    return () => {
      window.clearInterval(stateSyncInterval);
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
  }, [broadcastClaim, controller, soundcloudApiReady, soundcloudSource]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: metadata.title,
      artist: metadata.artist,
      album: "Feedback Queue",
      artwork: metadata.artwork
        ? [{ src: metadata.artwork, sizes: "500x500" }]
        : undefined,
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    safeSetActionHandler("play", () => playActive());
    safeSetActionHandler("pause", () => pauseActiveRef.current());
    safeSetActionHandler("previoustrack", () => handlePrevious());
    safeSetActionHandler("nexttrack", () => handleNext());

    return () => {
      safeSetActionHandler("play", null);
      safeSetActionHandler("pause", null);
      safeSetActionHandler("previoustrack", null);
      safeSetActionHandler("nexttrack", null);
    };
  }, [handleNext, handlePrevious, isPlaying, metadata, playActive]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a")) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNext, handlePrevious, toggleMute, togglePlayback]);

  const canPlay = Boolean(currentSubmission || nextAvailable);
  const canGoPrevious = Boolean(currentSubmission || submissions.length);

  const playerSurface = (
    <main className={styles.pageShell}>
      <article className={styles.playerPanel} aria-label="Feedback player">
        <div className={styles.trackHeader}>
          <div className={styles.trackInfo}>
            <p className={styles.artistName}>{metadata.artist}</p>
            <h1 title={metadata.title}>{metadata.title}</h1>
          </div>
          {currentSubmission && (
            <a
              href={currentSubmission.trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.providerLink}
              title={`Open in ${currentSubmission.provider === "dropbox" ? "Dropbox" : "SoundCloud"}`}
            >
              {currentSubmission.provider === "dropbox" ? "Dropbox" : "SoundCloud"}
              <ExternalIcon />
            </a>
          )}
        </div>

        <div className={styles.timeline}>
          <input
            type="range"
            min="0"
            max={duration > 0 ? duration : 0}
            step="0.1"
            value={duration > 0 ? Math.min(position, duration) : 0}
            onChange={(event) => handleSeek(Number(event.target.value))}
            disabled={!currentSubmission || duration <= 0}
            aria-label="Track position"
            className={styles.seekSlider}
            style={{
              "--progress": `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%`,
            } as React.CSSProperties}
          />
          <div className={styles.timeLabels}>
            <span>{formatTime(position)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className={styles.controlRow}>
          <div className={styles.transportControls}>
            <button
              type="button"
              onClick={handlePrevious}
              disabled={!canGoPrevious}
              className={styles.iconButton}
              aria-label="Previous track or restart"
              title="Previous or restart"
            >
              <PreviousIcon />
            </button>
            <button
              type="button"
              onClick={togglePlayback}
              disabled={!canPlay}
              className={styles.playButton}
              aria-label={isPlaying ? "Pause" : "Play"}
              title={isPlaying ? "Pause" : "Play"}
            >
              {status === "loading" ? (
                <span className={styles.spinner} />
              ) : isPlaying ? (
                <PauseIcon />
              ) : (
                <PlayIcon />
              )}
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!currentSubmission}
              className={styles.iconButton}
              aria-label="Mark reviewed and play next"
              title="Mark Reviewed and play next"
            >
              <NextIcon />
            </button>
          </div>

          <div className={styles.volumeControl}>
            <button
              type="button"
              onClick={toggleMute}
              className={styles.volumeButton}
              aria-label={muted ? "Unmute" : "Mute"}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? <MutedIcon /> : <VolumeIcon />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={muted ? 0 : volume}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
              aria-label="Volume"
              className={styles.volumeSlider}
              style={{
                "--volume": `${muted ? 0 : volume}%`,
              } as React.CSSProperties}
            />
          </div>
        </div>

        <div className={styles.messageArea} aria-live="polite">
          {!queueLoaded && <span>Connecting…</span>}
          {notice && (
            <button type="button" onClick={() => setNotice(null)}>
              {notice}
            </button>
          )}
          {error && (
            <button
              type="button"
              className={styles.errorMessage}
              onClick={() => setError(null)}
            >
              {error}
            </button>
          )}
        </div>
      </article>

    </main>
  );

  const mediaDock = (
    <div className={styles.mediaDock} aria-hidden="true">
        {dropboxSource && (
          <audio
            key={dropboxSource.generation}
            ref={audioRef}
            src={dropboxSource.url}
            preload="auto"
            onLoadedMetadata={(event) => {
              const { generation } = dropboxSource;
              if (!controller.isCurrent(generation)) return;
              const audio = event.currentTarget;
              const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
              durationRef.current = nextDuration;
              setDuration(nextDuration);
              audio.volume =
                getEffectiveVolume(volumeRef.current, mutedRef.current) / 100;
              if (pendingSeekRef.current > 0) {
                const nextPosition = Math.min(
                  pendingSeekRef.current,
                  audio.duration || pendingSeekRef.current,
                );
                audio.currentTime = nextPosition;
                pendingSeekRef.current = 0;
              }
              if (pendingAutoplayRef.current) {
                const playResult = controller.play();
                if (playResult instanceof Promise) {
                  void playResult.catch((playError: DOMException) => {
                    if (!controller.isCurrent(generation)) return;
                    pendingAutoplayRef.current = false;
                    setStatus("paused");
                    setNotice(
                      playError.name === "NotAllowedError"
                        ? "Press Play to allow audio."
                        : "Playback could not start.",
                    );
                  });
                }
              } else {
                setStatus("paused");
              }
            }}
            onTimeUpdate={(event) => {
              if (!controller.isCurrent(dropboxSource.generation)) return;
              const nextPosition = event.currentTarget.currentTime;
              positionRef.current = nextPosition;
              setPosition(nextPosition);
            }}
            onDurationChange={(event) => {
              if (!controller.isCurrent(dropboxSource.generation)) return;
              const nextDuration = event.currentTarget.duration;
              if (Number.isFinite(nextDuration)) {
                durationRef.current = nextDuration;
                setDuration(nextDuration);
              }
            }}
            onPlay={() => {
              if (!controller.isCurrent(dropboxSource.generation)) return;
              pendingAutoplayRef.current = false;
              broadcastClaim();
              setStatus("playing");
              setError(null);
            }}
            onPause={() => {
              if (
                controller.isCurrent(dropboxSource.generation) &&
                !audioRef.current?.ended &&
                statusRef.current !== "loading"
              ) {
                setStatus("paused");
              }
            }}
            onEnded={() => {
              if (controller.isCurrent(dropboxSource.generation)) {
                finishCurrentRef.current();
              }
            }}
            onError={() => {
              if (controller.isCurrent(dropboxSource.generation)) {
                handleSourceFailureRef.current(
                  "Dropbox could not play this audio file.",
                );
              }
            }}
          />
        )}
        {soundcloudSource && (
          <iframe
            key={soundcloudSource.generation}
            ref={soundcloudIframeRef}
            title="SoundCloud playback engine"
            src={soundcloudSource.url}
            allow="autoplay"
            tabIndex={-1}
          />
        )}
    </div>
  );

  return (
    <>
      {portalTarget ? createPortal(playerSurface, portalTarget) : playerSurface}
      {mediaDock}
    </>
  );
}

type IconProps = { className?: string };

function PreviousIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M6.5 5v14M18 6.5 9.5 12l8.5 5.5v-11Z" />
    </svg>
  );
}

function NextIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M17.5 5v14M6 6.5l8.5 5.5L6 17.5v-11Z" />
    </svg>
  );
}

function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m8 5 11 7-11 7V5Z" />
    </svg>
  );
}

function PauseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8 5v14M16 5v14" />
    </svg>
  );
}

function VolumeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M5 10v4h4l5 4V6l-5 4H5ZM17 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

function MutedIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M5 10v4h4l5 4V6l-5 4H5ZM17 10l4 4M21 10l-4 4" />
    </svg>
  );
}

function ExternalIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M14 5h5v5M19 5l-8 8M18 13v5H6V6h5" />
    </svg>
  );
}
