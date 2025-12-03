"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

  const inputClass =
    "w-full rounded-md border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder-white/40 transition focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/30";
  const labelClass = "flex flex-col gap-2 text-sm font-semibold text-white/70";
  const badgeBase =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide";


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

        // Redirect to queue page after a brief delay to show success message
        setTimeout(() => {
          router.push("/queue");
        }, 500);
      } else if (data.alreadyExists) {
        // User already has a submission - show replace modal
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

        // Redirect to queue page after a brief delay to show success message
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
    <div className="relative min-h-screen w-full bg-transparent text-white">
      {/* Navigation buttons in top right */}
      <div className="fixed top-4 right-4 z-10 flex gap-2">
        <Link
          href="/queue"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 transition hover:border-pink-500 hover:text-white backdrop-blur-sm"
        >
          View Queue
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 transition hover:border-pink-500 hover:text-white backdrop-blur-sm"
        >
          Sign out
        </button>
      </div>

      {status === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 text-white">
          Loading...
        </div>
      )}

      {showModal && (
        <div className="absolute inset-0 z-20 flex items-start justify-center bg-black/80 px-4 pt-24">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-gradient-to-br from-[#111018] to-[#09070d] p-8 text-center shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-3">
              Sign in to submit your track
            </h2>
            <p className="text-white/60 mb-6 text-sm">
              Connect with your Google account to access the submission form.
            </p>
            <button
              onClick={() => signIn("google")}
              className="w-full rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:opacity-90"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      )}

      {showReplaceModal && (
        <div className="absolute inset-0 z-20 flex items-start justify-center bg-black/80 px-4 pt-24">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-gradient-to-br from-[#111018] to-[#09070d] p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-3">
              Already in Queue
            </h2>
            <p className="text-white/60 mb-4 text-sm">
              You already have a track in the queue:
            </p>
            {existingSoundcloudLink && (
              <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">
                  {getTrackDisplay(existingSoundcloudLink).display}
                </p>
                <a
                  href={existingSoundcloudLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/60 hover:text-white/80 mt-1 block break-all"
                >
                  {existingSoundcloudLink}
                </a>
              </div>
            )}
            <p className="text-white/60 mb-6 text-sm">
              Would you like to replace it with your new track?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleReplaceSubmission}
                disabled={loading}
                className="flex-1 rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Replacing..." : "Yes, Replace"}
              </button>
              <button
                onClick={handleCancelReplace}
                disabled={loading}
                className="flex-1 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white/70 transition hover:border-pink-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <form
        onSubmit={handleSubmit}
        className={`mx-auto w-full max-w-2xl flex flex-col gap-6 rounded-2xl border border-white/5 bg-[#0a0811]/80 p-8 shadow-[0_25px_70px_-30px_rgba(255,0,130,0.4)] backdrop-blur transition ${
          showModal || showReplaceModal ? "pointer-events-none opacity-30" : "opacity-100"
        }`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm tracking-wide text-white/70">
            <span>
              Signed in as{" "}
              <span className="font-semibold text-white">
                {session?.user?.email ?? "unknown user"}
              </span>
            </span>
            {!isAdmin && !isChannelOwner && (
              <span className="text-xs text-white/50 normal-case">
                (standard access)
              </span>
            )}
          </div>
          {youtubeChannelTitle && (
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/60">
              {youtubeChannelAvatar && (
                <Image
                  src={youtubeChannelAvatar}
                  alt={youtubeChannelTitle}
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full border border-white/20 object-cover"
                />
              )}
              <span className="text-white/70 normal-case tracking-normal">
                YouTube Channel:
                <span className="ml-2 text-white font-semibold uppercase tracking-[0.2em]">
                  {youtubeChannelTitle}
                </span>
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase">
            {isChannelOwner && (
              <span className={`${badgeBase} bg-blue-500/80 text-white`}>
                Channel Owner
              </span>
            )}
            {isAdmin && (
              <span className={`${badgeBase} bg-emerald-500/80 text-white`}>
                Admin
              </span>
            )}
            {isMember && (
              <span className={`${badgeBase} bg-purple-500/80 text-white`}>
                Member{membershipTier ? ` – ${membershipTier}` : ""}
              </span>
            )}
            {!isMember && (
              <span className={`${badgeBase} bg-white/10 text-white/70`}>
                Not a Member
              </span>
            )}
            {subscriberStatus === true && (
              <span className={`${badgeBase} bg-orange-500/80 text-white`}>
                Subscriber
              </span>
            )}
            {subscriberStatus === false && (
              <span className={`${badgeBase} bg-white/10 text-white/70`}>
                Not Subscribed
              </span>
            )}
            {subscriberStatus == null && (
              <span className={`${badgeBase} bg-white/10 text-white/60`}>
                Subscription Unknown
              </span>
            )}
          </div>
        </div>

        <label className={labelClass}>
          SoundCloud Link:
          <input
            type="url"
            value={soundcloudLink}
            onChange={(e) => setSoundcloudLink(e.target.value)}
            required
            className={inputClass}
            placeholder="https://soundcloud.com/your-track"
          />
        </label>

        <label className={labelClass}>
          Instagram Handle (optional):
          <input
            type="text"
            value={instagramHandle}
            onChange={(e) => setInstagramHandle(e.target.value)}
            className={inputClass}
            placeholder="@username or full URL"
          />
        </label>

        <label className={labelClass}>
          TikTok Handle (optional):
          <input
            type="text"
            value={tiktokHandle}
            onChange={(e) => setTiktokHandle(e.target.value)}
            className={inputClass}
            placeholder="@username or full URL"
          />
        </label>

        {isAdmin ? (
          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            <span>Priority (admins only)</span>
            <input
              type="checkbox"
              checked={priority}
              onChange={(e) => setPriority(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-pink-500"
            />
          </label>
        ) : isMember ? (
          <p className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-purple-200">
            You&apos;re a YouTube member! Your submission jumps the queue automatically.
          </p>
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
            Become a YouTube member of XLNTSOUND to get priority placement.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit Track"}
        </button>

        {submitted && (
          <p className="mt-2 text-sm font-semibold text-emerald-400">
            We got your track!
          </p>
        )}
        {error && (
          <p className="mt-2 text-sm font-semibold text-pink-400">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
