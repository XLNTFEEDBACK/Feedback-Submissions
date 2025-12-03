"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const getTrackDisplay = (url: string) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length >= 2) {
      const artist = decodeURIComponent(segments[segments.length - 2]);
      const track = decodeURIComponent(segments[segments.length - 1]);
      return {
        artist,
        track,
        display: `${artist} – ${track}`,
      };
    }

    if (segments.length === 1) {
      const track = decodeURIComponent(segments[0]);
      return {
        artist: null,
        track,
        display: track,
      };
    }
  } catch {
    // noop
  }

  return {
    artist: null,
    track: null,
    display: url,
  };
};

export default function SubmissionForm() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const isChannelOwner = session?.user?.isChannelOwner ?? false;
  const isMember = session?.user?.isMember ?? false;
  const subscriberStatus = session?.user?.isSubscriber;
  const membershipTier = session?.user?.membershipTier ?? null;
  const youtubeChannelTitle = session?.user?.youtubeChannelTitle ?? null;
  const youtubeChannelAvatar = session?.user?.youtubeChannelAvatarUrl ?? null;
  const [soundcloudLink, setSoundcloudLink] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [tiktokHandle, setTiktokHandle] = useState("");
  const [priority, setPriority] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<{
    soundcloudLink: string;
    instagramHandle: string;
    tiktokHandle: string;
    priority: boolean;
  } | null>(null);
  const [existingSubmissionId, setExistingSubmissionId] = useState<string | null>(null);
  const [existingSoundcloudLink, setExistingSoundcloudLink] = useState<string | null>(null);

  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin && priority) {
      setPriority(false);
    }
  }, [isAdmin, priority]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSubmitted(false);

    try {
      const payload: Record<string, unknown> = {
        soundcloudLink,
      };
      if (isAdmin) {
        payload.priority = priority;
      }
      if (instagramHandle.trim()) {
        payload.instagramHandle = instagramHandle.trim();
      }
      if (tiktokHandle.trim()) {
        payload.tiktokHandle = tiktokHandle.trim();
      }

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitted(true);
        setSoundcloudLink("");
        setInstagramHandle("");
        setTiktokHandle("");
        setPriority(false);
        setShowReplaceModal(false);
        setPendingSubmission(null);

        setTimeout(() => {
          router.push("/queue");
        }, 500);
      } else if (data.alreadyExists) {
        setPendingSubmission({
          soundcloudLink,
          instagramHandle,
          tiktokHandle,
          priority,
        });
        setExistingSubmissionId(data.existingSubmissionId);
        setExistingSoundcloudLink(data.existingSoundcloudLink);
        setShowReplaceModal(true);
        setLoading(false);
      } else {
        setError(data.error || "Failed to submit track.");
        setLoading(false);
      }
    } catch {
      setError("Failed to submit track.");
      setLoading(false);
    }
  };

  const handleReplaceSubmission = async () => {
    if (!pendingSubmission) return;

    setLoading(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        soundcloudLink: pendingSubmission.soundcloudLink,
        replaceExisting: true,
      };
      if (isAdmin) {
        payload.priority = pendingSubmission.priority;
      }
      if (pendingSubmission.instagramHandle.trim()) {
        payload.instagramHandle = pendingSubmission.instagramHandle.trim();
      }
      if (pendingSubmission.tiktokHandle.trim()) {
        payload.tiktokHandle = pendingSubmission.tiktokHandle.trim();
      }

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitted(true);
        setSoundcloudLink("");
        setInstagramHandle("");
        setTiktokHandle("");
        setPriority(false);
        setShowReplaceModal(false);
        setPendingSubmission(null);
        setExistingSubmissionId(null);
        setExistingSoundcloudLink(null);

        setTimeout(() => {
          router.push("/queue");
        }, 500);
      } else {
        setError(data.error || "Failed to replace track.");
        setLoading(false);
      }
    } catch {
      setError("Failed to replace track.");
      setLoading(false);
    }
  };

  const handleCancelReplace = () => {
    setShowReplaceModal(false);
    setPendingSubmission(null);
    setExistingSubmissionId(null);
    setExistingSoundcloudLink(null);
    setLoading(false);
  };

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      console.log(
        "[session] youtube profile",
        {
          channelId: session.user.youtubeChannelId ?? null,
          title: session.user.youtubeChannelTitle ?? null,
          avatar: session.user.youtubeChannelAvatarUrl ?? null,
          isMember: session.user.isMember ?? null,
          membershipTier: session.user.membershipTier ?? null,
          isSubscriber: session.user.isSubscriber ?? null,
          role: session.user.role ?? null,
        }
      );
    }
  }, [status, session?.user]);

  const showModal = status === "unauthenticated";

  return (
    <div className="relative min-h-screen w-full text-white">
      {/* Navigation buttons in top right */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-4 right-4 z-10 flex gap-2"
      >
        <Link
          href="/queue"
          className="group relative overflow-hidden rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white/80 transition-all duration-300 hover:border-[var(--accent-cyan)] hover:text-white backdrop-blur-md hover:shadow-[0_0_20px_rgba(0,229,255,0.3)]"
        >
          <span className="relative z-10">View Queue</span>
          <span className="absolute inset-0 bg-gradient-to-r from-[var(--accent-cyan)]/0 via-[var(--accent-cyan)]/10 to-[var(--accent-cyan)]/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="group relative overflow-hidden rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white/80 transition-all duration-300 hover:border-red-500 hover:text-white backdrop-blur-md hover:shadow-[0_0_20px_rgba(255,0,0,0.3)]"
        >
          <span className="relative z-10">Sign Out</span>
          <span className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/10 to-red-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </button>
      </motion.div>

      {/* Loading State */}
      <AnimatePresence>
        {status === "loading" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-[var(--accent-cyan)]" />
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">Loading...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sign In Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 px-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] p-10 text-center shadow-[0_40px_120px_-40px_rgba(0,229,255,0.4)] relative"
            >
              {/* Accent glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[var(--accent-cyan)] to-transparent opacity-80" />

              <h2 className="text-3xl font-black uppercase tracking-[0.2em] text-white mb-4">
                Sign In Required
              </h2>
              <p className="text-white/60 mb-8 text-sm leading-relaxed">
                Connect with your Google account to submit your track and join the feedback queue.
              </p>
              <motion.button
                onClick={() => signIn("google")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-blue-500 px-8 py-4 text-sm font-black uppercase tracking-[0.25em] text-black shadow-[0_20px_60px_-20px_rgba(0,229,255,0.6)] transition-all duration-300 hover:shadow-[0_20px_60px_-10px_rgba(0,229,255,0.8)]"
              >
                Sign In with Google
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Replace Track Modal */}
      <AnimatePresence>
        {showReplaceModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 px-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--accent-amber)]/30 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] p-10 shadow-[0_40px_120px_-40px_rgba(255,184,0,0.4)] relative"
            >
              {/* Accent glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[var(--accent-amber)] to-transparent opacity-80" />

              <h2 className="text-3xl font-black uppercase tracking-[0.2em] text-white mb-4">
                Already in Queue
              </h2>
              <p className="text-white/60 mb-4 text-sm">
                You already have a track in the queue:
              </p>
              {existingSoundcloudLink && (
                <div className="mb-6 rounded-xl border border-white/10 bg-black/40 p-5">
                  <p className="text-base font-bold text-white mb-2">
                    {getTrackDisplay(existingSoundcloudLink).display}
                  </p>
                  <a
                    href={existingSoundcloudLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent-cyan)] hover:text-white transition-colors duration-200 break-all"
                  >
                    {existingSoundcloudLink}
                  </a>
                </div>
              )}
              <p className="text-white/60 mb-8 text-sm">
                Would you like to replace it with your new track?
              </p>
              <div className="flex gap-3">
                <motion.button
                  onClick={handleReplaceSubmission}
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 rounded-full bg-gradient-to-r from-[var(--accent-amber)] to-orange-500 px-6 py-4 text-sm font-black uppercase tracking-[0.25em] text-black shadow-lg transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,184,0,0.5)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Replacing..." : "Yes, Replace"}
                </motion.button>
                <motion.button
                  onClick={handleCancelReplace}
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 rounded-full border border-white/20 bg-white/5 px-6 py-4 text-sm font-black uppercase tracking-[0.25em] text-white/70 transition-all duration-300 hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Form */}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`mx-auto w-full max-w-2xl flex flex-col gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-dark)] p-8 shadow-[0_40px_120px_-40px_rgba(255,0,170,0.5)] transition-all duration-300 ${
          showModal || showReplaceModal ? "pointer-events-none opacity-30 blur-sm" : "opacity-100"
        }`}
      >
        {/* User Info Section */}
        <div className="flex flex-col gap-4 pb-6 border-b border-white/10">
          <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
            <span>
              Signed in as{" "}
              <span className="font-bold text-white">
                {session?.user?.email ?? "unknown user"}
              </span>
            </span>
          </div>

          {youtubeChannelTitle && (
            <div className="flex items-center gap-3">
              {youtubeChannelAvatar && (
                <Image
                  src={youtubeChannelAvatar}
                  alt={youtubeChannelTitle}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border-2 border-white/20 object-cover"
                />
              )}
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-[0.15em] text-white/50">
                  YouTube Channel
                </span>
                <span className="text-sm font-bold text-white">
                  {youtubeChannelTitle}
                </span>
              </div>
            </div>
          )}

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {isChannelOwner && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-blue-500 to-cyan-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M8 0l2.469 4.995 5.531.805-4 3.894.944 5.506-4.944-2.598-4.944 2.598.944-5.506-4-3.894 5.531-.805z" />
                </svg>
                Owner
              </span>
            )}
            {isAdmin && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-emerald-500 to-green-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                </svg>
                Admin
              </span>
            )}
            {isMember && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-purple-600 to-[var(--accent-magenta)] px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M8 12l-3.5 2.1 1-4-3-2.6 4-.3L8 3l1.5 4.2 4 .3-3 2.6 1 4z" />
                </svg>
                Member{membershipTier ? ` ${membershipTier}` : ""}
              </span>
            )}
            {subscriberStatus === true && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-orange-500 to-[var(--accent-amber)] px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M15 8L1 15V1l14 7z" />
                </svg>
                Subscriber
              </span>
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="flex flex-col gap-5">
          {/* SoundCloud Link Input */}
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
              SoundCloud Link:
            </span>
            <div className="relative">
              <input
                type="url"
                value={soundcloudLink}
                onChange={(e) => setSoundcloudLink(e.target.value)}
                onFocus={() => setFocusedInput("soundcloud")}
                onBlur={() => setFocusedInput(null)}
                required
                className={`w-full rounded-xl border bg-black/40 px-4 py-3.5 text-sm text-white placeholder-white/40 transition-all duration-300 focus:outline-none ${
                  focusedInput === "soundcloud"
                    ? "border-[var(--accent-cyan)] ring-2 ring-[var(--accent-cyan)]/30 bg-black/60 shadow-[0_0_20px_rgba(0,229,255,0.2)]"
                    : "border-white/10 hover:border-white/20"
                }`}
                placeholder="https://soundcloud.com/your-track"
              />
              {focusedInput === "soundcloud" && (
                <motion.div
                  layoutId="input-glow"
                  className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-[var(--accent-cyan)] to-blue-500 opacity-20 blur-sm -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </div>
          </label>

          {/* Instagram Input */}
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
              Instagram (optional):
            </span>
            <div className="relative">
              <input
                type="text"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                onFocus={() => setFocusedInput("instagram")}
                onBlur={() => setFocusedInput(null)}
                className={`w-full rounded-xl border bg-black/40 px-4 py-3.5 text-sm text-white placeholder-white/40 transition-all duration-300 focus:outline-none ${
                  focusedInput === "instagram"
                    ? "border-[var(--accent-cyan)] ring-2 ring-[var(--accent-cyan)]/30 bg-black/60 shadow-[0_0_20px_rgba(0,229,255,0.2)]"
                    : "border-white/10 hover:border-white/20"
                }`}
                placeholder="@username or full URL"
              />
              {focusedInput === "instagram" && (
                <motion.div
                  layoutId="input-glow"
                  className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-[var(--accent-cyan)] to-blue-500 opacity-20 blur-sm -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </div>
          </label>

          {/* TikTok Input */}
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
              TikTok (optional):
            </span>
            <div className="relative">
              <input
                type="text"
                value={tiktokHandle}
                onChange={(e) => setTiktokHandle(e.target.value)}
                onFocus={() => setFocusedInput("tiktok")}
                onBlur={() => setFocusedInput(null)}
                className={`w-full rounded-xl border bg-black/40 px-4 py-3.5 text-sm text-white placeholder-white/40 transition-all duration-300 focus:outline-none ${
                  focusedInput === "tiktok"
                    ? "border-[var(--accent-cyan)] ring-2 ring-[var(--accent-cyan)]/30 bg-black/60 shadow-[0_0_20px_rgba(0,229,255,0.2)]"
                    : "border-white/10 hover:border-white/20"
                }`}
                placeholder="@username or full URL"
              />
              {focusedInput === "tiktok" && (
                <motion.div
                  layoutId="input-glow"
                  className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-[var(--accent-cyan)] to-blue-500 opacity-20 blur-sm -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </div>
          </label>
        </div>

        {/* Priority / Member Status */}
        {isAdmin ? (
          <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4 cursor-pointer transition-all duration-300 hover:border-[var(--accent-cyan)]/50 hover:bg-white/10">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
              Priority (Admins Only)
            </span>
            <input
              type="checkbox"
              checked={priority}
              onChange={(e) => setPriority(e.target.checked)}
              className="h-5 w-5 cursor-pointer accent-[var(--accent-cyan)] rounded transition-all"
            />
          </label>
        ) : isMember ? (
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-purple-200 flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M8 12l-3.5 2.1 1-4-3-2.6 4-.3L8 3l1.5 4.2 4 .3-3 2.6 1 4z" />
              </svg>
              You&apos;re a YouTube member! Your submission jumps the queue automatically.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Become a YouTube member of XLNTSOUND to get priority placement.
            </p>
          </div>
        )}

        {/* Submit Button */}
        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
          className="rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-blue-500 px-8 py-4 text-sm font-black uppercase tracking-[0.3em] text-black shadow-[0_20px_60px_-20px_rgba(0,229,255,0.6)] transition-all duration-300 hover:shadow-[0_20px_60px_-10px_rgba(0,229,255,0.8)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              Submitting...
            </span>
          ) : (
            "Submit Track"
          )}
        </motion.button>

        {/* Success/Error Messages */}
        <AnimatePresence>
          {submitted && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center text-sm font-bold text-emerald-400"
            >
              ✓ We got your track!
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border border-[var(--accent-magenta)]/30 bg-[var(--accent-magenta)]/10 px-4 py-3 text-center text-sm font-bold text-[var(--accent-magenta)]"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.form>
    </div>
  );
}
