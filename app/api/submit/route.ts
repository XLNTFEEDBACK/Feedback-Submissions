import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../firebase/firebaseAdmin"; // Admin SDK import

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { soundcloudLink, priority } = await req.json();

    if (!soundcloudLink) {
      return NextResponse.json({ success: false, error: "Missing SoundCloud link." });
    }

    const isAdmin = session.user?.isAdmin ?? false;
    const isChannelOwner = session.user?.isChannelOwner ?? false;
    const isMember = session.user?.isMember ?? false;
    const isSubscriber = session.user?.isSubscriber ?? null;
    const membershipTier = session.user?.membershipTier ?? null;

    const requestedPriority = Boolean(priority);
    const derivedPriority =
      isMember || isChannelOwner || (isAdmin && requestedPriority);

    const now = Date.now();
    const orderBaseline = derivedPriority ? now - 1_000_000_000 : now;

    const submission = {
      soundcloudLink,
      email: session.user?.email || "",
      priority: derivedPriority,
      timestamp: new Date(),
      order: orderBaseline,
      isMember,
      membershipTier,
      isSubscriber,
      isChannelOwner,
      youtubeChannelId: session.user?.youtubeChannelId ?? null,
      submittedByRole: isChannelOwner
        ? "owner"
        : session.user?.role ?? "user",
    };

    // Add to Firestore using Admin SDK
    await db.collection("submissions").add(submission);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error submitting track:", err);
    return NextResponse.json({ success: false, error: "Failed to submit track." });
  }
}
