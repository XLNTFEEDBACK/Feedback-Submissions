"use client";

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useRouter } from "next/navigation";

export default function SubmissionForm() {
  const [soundcloudLink, setSoundcloudLink] = useState("");
  const [email, setEmail] = useState("");
  const [priority, setPriority] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(""); // <-- new
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!soundcloudLink) return;
    setIsSubmitting(true);

    try {
      // Add submission to Firestore
      await addDoc(collection(db, "submissions"), {
        soundcloudLink,
        email,
        timestamp: serverTimestamp(),
        priority,
      });

      // Reset form fields
      setSoundcloudLink("");
      setEmail("");
      setPriority(false);

      // Show success message
      setSuccessMessage("We Got Your Track!");

      // Wait 1.5 seconds, then redirect
      setTimeout(() => {
        router.push("/queue");
      }, 1500);
    } catch (error) {
      console.error("Error submitting:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl mx-auto mt-6 p-4 bg-white rounded shadow flex flex-col gap-4"
    >
      <label>
        SoundCloud Link:
        <input
          type="text"
          value={soundcloudLink}
          onChange={(e) => setSoundcloudLink(e.target.value)}
          className="mt-1 p-2 border rounded w-full"
          placeholder="https://soundcloud.com/..."
          required
        />
      </label>

      <label>
        Email (optional):
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 p-2 border rounded w-full"
          placeholder="your@email.com"
        />
      </label>

      <label className="flex items-center gap-2">
        Priority (for members/donors):
        <input
          type="checkbox"
          checked={priority}
          onChange={(e) => setPriority(e.target.checked)}
        />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className={`py-2 px-4 rounded text-white ${
          isSubmitting ? "bg-gray-400" : "bg-orange-500 hover:bg-orange-600"
        }`}
      >
        {isSubmitting ? "Submitting..." : "Submit"}
      </button>

      {successMessage && (
        <p className="mt-2 text-green-600 font-semibold">{successMessage}</p>
      )}
    </form>
  );
}



