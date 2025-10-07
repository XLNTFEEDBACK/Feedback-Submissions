import { NextRequest, NextResponse } from "next/server";
import { db } from "../../firebase/firebaseadmin"; // <- Admin SDK import

export async function POST(req: NextRequest) {
  try {
    const { soundcloudLink, email, priority } = await req.json();

    if (!soundcloudLink) {
      return NextResponse.json({ success: false, error: "Missing SoundCloud link." });
    }

    const submission = {
      soundcloudLink,
      email: email || "",
      priority: !!priority,  // in case you add priority checkbox later
      timestamp: new Date(),
    };

    await db.collection("submissions").add(submission);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error submitting track:", err);
    return NextResponse.json({ success: false, error: "Failed to submit track." });
  }
}

