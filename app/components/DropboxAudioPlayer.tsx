"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

export default function DropboxAudioPlayer({
  sourceUrl,
  playbackUrl,
  title,
  isPlaying,
  volume,
  isMuted,
  onPlay,
  onPause,
}: {
  sourceUrl: string;
  playbackUrl: string;
  title: string;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  onPlay: () => void;
  onPause: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = (isMuted ? 0 : volume) / 100;
  }, [isMuted, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isPlaying || audio.paused) return;
    audio.pause();
  }, [isPlaying]);

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setPlaybackError(null);
  }, [playbackUrl]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    setPlaybackError(null);
    setIsLoading(true);
    try {
      await audio.play();
    } catch {
      setIsLoading(false);
      setPlaybackError(
        "Dropbox could not start this file. Confirm the shared link is still public.",
      );
    }
  };

  const seek = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#07151d] via-black/80 to-[#071017] px-4 py-5 sm:px-5">
      <audio
        ref={audioRef}
        src={playbackUrl}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          );
          setIsLoading(false);
        }}
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setIsLoading(false);
          setPlaybackError(null);
          onPlay();
        }}
        onPause={onPause}
        onEnded={() => {
          setCurrentTime(0);
          onPause();
        }}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setPlaybackError(
            "This Dropbox audio is unavailable or cannot play in this browser.",
          );
        }}
      />

      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(0,229,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,229,255,0.035)_1px,transparent_1px)] [background-size:18px_18px]" />

      <div className="relative flex items-center gap-3 sm:gap-4">
        <motion.button
          type="button"
          onClick={togglePlayback}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border transition-all duration-300 sm:h-12 sm:w-12 ${
            isPlaying
              ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)] text-black shadow-[0_0_24px_rgba(0,229,255,0.4)]"
              : "border-[var(--accent-cyan)]/45 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20"
          }`}
          aria-label={isPlaying ? "Pause Dropbox audio" : "Play Dropbox audio"}
        >
          {isLoading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current" />
          ) : isPlaying ? (
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M3 2.5h3.5v11H3zM9.5 2.5H13v11H9.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="currentColor" className="ml-0.5 h-4 w-4">
              <path d="M3 1.8v12.4L14 8 3 1.8z" />
            </svg>
          )}
        </motion.button>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase tracking-[0.16em] text-white sm:text-sm">
                {title}
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--accent-cyan)]/70">
                Dropbox audio
              </p>
            </div>
            <span className="flex-shrink-0 font-mono text-[10px] text-white/45 sm:text-xs">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            disabled={!duration}
            aria-label="Audio position"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--accent-cyan)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-cyan)]"
            style={{
              background: `linear-gradient(to right, var(--accent-cyan) 0%, var(--accent-cyan) ${
                duration ? (currentTime / duration) * 100 : 0
              }%, rgba(255,255,255,0.1) ${
                duration ? (currentTime / duration) * 100 : 0
              }%, rgba(255,255,255,0.1) 100%)`,
            }}
          />
        </div>
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
        {playbackError ? (
          <p className="text-[10px] font-semibold text-[var(--accent-magenta)]">
            {playbackError}
          </p>
        ) : (
          <p className="text-[10px] text-white/35">
            Streamed directly from the submitted file
          </p>
        )}
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-[10px] font-black uppercase tracking-[0.15em] text-white/45 transition-colors hover:text-[var(--accent-cyan)]"
        >
          Open in Dropbox ↗
        </a>
      </div>
    </div>
  );
}
