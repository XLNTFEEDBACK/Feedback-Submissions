"use client";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebase";

interface Submission {
  id: string;
  soundcloudLink: string;
  email?: string;
  priority?: boolean;
}

export default function QueuePage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  // Simple admin check
  const adminEmail = "xlntfeedback@gmail.com";
  const currentUserEmail = "xlntfeedback@gmail.com"; // For testing; replace with real user auth later
  const isAdmin = currentUserEmail === adminEmail;

  useEffect(() => {
    const q = query(
      collection(db, "submissions"),
      orderBy("priority", "desc"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs: Submission[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Submission[];
      setSubmissions(subs);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="bg-black min-h-screen w-full flex flex-col items-center py-10">
      {/* Header */}
      <header className="w-full bg-black py-6 mb-6">
        <h1 className="text-3xl font-bold text-white text-center">
          THE XLNT QUEUE
        </h1>
      </header>

      {isAdmin && (
        <div className="bg-yellow-300 text-black p-2 rounded mb-4 font-semibold">
          You are viewing as ADMIN
        </div>
      )}

      {submissions.length === 0 ? (
        <p className="text-white">No submissions yet.</p>
      ) : (
        submissions.map((sub, index) => (
          <div key={sub.id} className="mb-4 w-full max-w-3xl">
            {/* Submission number */}
            <p className="text-white font-semibold mb-1">
              #{index + 1}
            </p>

            <iframe
              width="100%"
              height="166"
              scrolling="no"
              frameBorder="no"
              allow="autoplay"
              src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(
                sub.soundcloudLink
              )}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`}
            ></iframe>
          </div>
        ))
      )}
    </div>
  );
}




