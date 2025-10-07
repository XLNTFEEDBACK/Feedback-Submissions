import { NextRequest, NextResponse } from "next/server";
import { db } from "../../firebase/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function POST(req: NextRequest) {
  const data = await req.json();
  const { soundcloudLink, email } = data;

  if (!soundcloudLink) {
    return NextResponse.json({ error: "Missing SoundCloud link" }, { status: 400 });
  }

  try {
    await addDoc(collection(db, "submissions"), {
      soundcloudLink,
      email: email || null,
      priority: false,          // normal users cannot set priority
      timestamp: serverTimestamp()
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to submit track" }, { status: 500 });
  }
}
