import { NextRequest, NextResponse } from "next/server";
import { db } from "../../firebase/firebaseAdmin"; // Admin SDK import

export async function POST(req: NextRequest) {
  try {
    const { soundcloudLink, email, priority } = await req.json();

    if (!soundcloudLink) {
      return NextResponse.json({ success: false, error: "Missing SoundCloud link." });
    }

    const submission = {
      soundcloudLink,
      email: email || "",
      priority: !!priority,  // ensures boolean
      timestamp: new Date(),
    };

    // Add to Firestore using Admin SDK
    await db.collection("submissions").add(submission);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error submitting track:", err);
    return NextResponse.json({ success: false, error: "Failed to submit track." });
  }
}


