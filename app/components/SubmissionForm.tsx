"use client";

import { useState } from "react";

export default function SubmissionForm() {
  const [soundcloudLink, setSoundcloudLink] = useState("");
  const [email, setEmail] = useState("");
  const [priority, setPriority] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSubmitted(false);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soundcloudLink, email, priority }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitted(true);
        setSoundcloudLink("");
        setEmail("");
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

  return (
    <div className="bg-black min-h-screen w-full flex flex-col items-center py-10">
      {/* Header */}
      <header className="w-full bg-black py-6 mb-6">
        <h1 className="text-3xl font-bold text-white text-center">XLNT FEEDBACK</h1>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-xl p-6 bg-gray-900 rounded-md"
      >
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

        <label className="flex flex-col gap-1 text-white">
          Your Email (optional):
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-gray-700 rounded px-2 py-1 bg-black text-white"
            placeholder="example@example.com"
          />
        </label>

        <label className="flex items-center gap-2 text-white">
          Priority (for members/donors):
          <input
            type="checkbox"
            checked={priority}
            onChange={(e) => setPriority(e.target.checked)}
          />
        </label>

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


