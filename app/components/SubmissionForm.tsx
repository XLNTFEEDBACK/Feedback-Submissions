"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

export default function SubmissionForm() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const isChannelOwner = session?.user?.isChannelOwner ?? false;
  const isMember = session?.user?.isMember ?? false;
  const subscriberStatus = session?.user?.isSubscriber;
  const membershipTier = session?.user?.membershipTier ?? null;
  const [soundcloudLink, setSoundcloudLink] = useState("");
  const [priority, setPriority] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitted(true);
        setSoundcloudLink("");
        setPriority(false);

        // Redirect to queue page
        window.location.href = "/queue";
      } else {
        setError(data.error || "Failed to submit track.");
      }
    } catch {
      setError("Failed to submit track.");
    } finally {
      setLoading(false);
    }
  };

  const showModal = status === "unauthenticated";

  return (
    <div className="relative bg-black min-h-screen w-full flex flex-col items-center py-10">
      {status === "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 text-white">
          Loading...
        </div>
      )}

      {showModal && (
        <div className="absolute inset-0 z-20 flex items-start justify-center bg-black/80 px-4 pt-24">
          <div className="w-full max-w-xl rounded-lg bg-gray-900 p-8 text-center shadow-xl border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">
              Sign in to submit your track
            </h2>
            <p className="text-gray-300 mb-6">
              Connect with your Google account to access the submission form.
            </p>
            <button
              onClick={() => signIn("google")}
              className="w-full bg-red-600 hover:bg-red-700 px-6 py-3 rounded text-white font-semibold transition"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="w-full bg-black py-6 mb-6 opacity-100">
        <h1 className="text-3xl font-bold text-white text-center">Submit Your Track</h1>
      </header>

      <form
        onSubmit={handleSubmit}
        className={`flex flex-col gap-4 w-full max-w-xl p-6 bg-gray-900 rounded-md transition ${
          showModal ? "opacity-30 pointer-events-none" : "opacity-100"
        }`}
      >
        <div className="text-white">
          Signed in as{" "}
          <span className="font-semibold">
            {session?.user?.email ?? "unknown user"}
          </span>
          {isChannelOwner && (
            <span className="ml-2 inline-flex items-center rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold uppercase">
              Channel Owner
            </span>
          )}
          {isAdmin && (
            <span className="ml-2 inline-flex items-center rounded bg-green-700 px-2 py-0.5 text-xs font-semibold uppercase">
              Admin
            </span>
          )}
          {!isAdmin && !isChannelOwner && (
            <span className="ml-2 text-sm text-gray-400">(standard access)</span>
          )}
          {isMember && (
            <span className="ml-2 inline-flex items-center rounded bg-purple-700 px-2 py-0.5 text-xs font-semibold uppercase">
              Member{membershipTier ? ` – ${membershipTier}` : ""}
            </span>
          )}
          {!isMember && (
            <span className="ml-2 inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs font-semibold uppercase">
              Not a Member
            </span>
          )}
          {subscriberStatus === true && (
            <span className="ml-2 inline-flex items-center rounded bg-orange-500 px-2 py-0.5 text-xs font-semibold uppercase">
              Subscriber
            </span>
          )}
          {subscriberStatus === false && (
            <span className="ml-2 inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs font-semibold uppercase">
              Not Subscribed
            </span>
          )}
          {subscriberStatus == null && (
            <span className="ml-2 inline-flex items-center rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold uppercase">
              Subscription Unknown
            </span>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="ml-4 rounded border border-gray-600 px-3 py-1 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Sign out
          </button>
        </div>

        <label className="flex flex-col gap-1 text-white">
          SoundCloud Link:
          <input
            type="url"
            value={soundcloudLink}
            onChange={(e) => setSoundcloudLink(e.target.value)}
            required
            className="border border-gray-700 rounded px-2 py-1 bg-black text-white"
            placeholder="https://soundcloud.com/your-track"
          />
        </label>

        {isAdmin ? (
          <label className="flex items-center gap-2 text-white">
            Priority (admins only):
            <input
              type="checkbox"
              checked={priority}
              onChange={(e) => setPriority(e.target.checked)}
            />
          </label>
        ) : isMember ? (
          <p className="text-sm text-purple-300">
            You&apos;re a YouTube member! Your submission jumps the queue automatically.
          </p>
        ) : (
          <p className="text-sm text-gray-400">
            Become a YouTube member of XLNTSOUND to get priority placement.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit Track"}
        </button>

        {submitted && (
          <p className="text-green-500 font-semibold mt-2">We Got Your Track!</p>
        )}
        {error && <p className="text-red-500 font-semibold mt-2">{error}</p>}
      </form>
    </div>
  );
}
