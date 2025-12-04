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

    // Check killswitch - prevent submissions when feedback is not active
    const configRef = db.collection("config").doc("submissions");
    const configDoc = await configRef.get();
    const config = configDoc.data();

    if (config?.submissionEnabled === false) {
      return NextResponse.json(
        { 
          success: false, 
          submissionsDisabled: true,
          error: "Submissions are currently disabled. Feedback sessions are not active at this time." 
        },
        { status: 403 }
      );
    }

    const {
      soundcloudLink,
      priority,
      instagramHandle,
      tiktokHandle,
      replaceExisting,
    }: {
      soundcloudLink?: string;
      priority?: boolean;
      instagramHandle?: string;
      tiktokHandle?: string;
      replaceExisting?: boolean;
    } = await req.json();

    if (!soundcloudLink) {
      return NextResponse.json({ success: false, error: "Missing SoundCloud link." });
    }

    const userChannelId = session.user?.youtubeChannelId?.toLowerCase();

    // Check if user already has a submission in the queue
    const submissionsRef = db.collection("submissions");
    const existingSubmissions = await submissionsRef
      .where("email", "==", session.user?.email || "")
      .get();

    // Also check by YouTube channel ID if available
    let existingByChannel: Awaited<ReturnType<typeof submissionsRef.get>> | null = null;
    if (userChannelId) {
      existingByChannel = await submissionsRef
        .where("youtubeChannelId", "==", userChannelId)
        .get();
    }

    // Combine results and find the first existing submission
    const allExisting: Awaited<ReturnType<typeof submissionsRef.get>>["docs"] = [];
    existingSubmissions.forEach((doc) => allExisting.push(doc));
    if (existingByChannel) {
      existingByChannel.forEach((doc) => {
        // Avoid duplicates
        if (!allExisting.find((d) => d.id === doc.id)) {
          allExisting.push(doc);
        }
      });
    }

    // If user has an existing submission and hasn't confirmed replacement
    if (allExisting.length > 0 && !replaceExisting) {
      const existingSubmission = allExisting[0].data();
      return NextResponse.json({
        success: false,
        alreadyExists: true,
        existingSubmissionId: allExisting[0].id,
        existingSoundcloudLink: existingSubmission.soundcloudLink,
      });
    }

    const isAdmin = session.user?.isAdmin ?? false;
    const isChannelOwner = session.user?.isChannelOwner ?? false;
    const isSubscriber = session.user?.isSubscriber ?? null;

    // Priority is disabled - all submissions go to the end of the queue
    const derivedPriority = false;

    const now = Date.now();
    const orderBaseline = now;

    const normalizeHandle = (handle?: string | null) => {
      if (typeof handle !== "string") return null;
      const trimmed = handle.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const submission = {
      soundcloudLink,
      email: session.user?.email || "",
      priority: derivedPriority,
      timestamp: new Date(),
      order: orderBaseline,
      isSubscriber,
      isChannelOwner,
      youtubeChannelId: session.user?.youtubeChannelId ?? null,
      youtubeChannelTitle: session.user?.youtubeChannelTitle ?? null,
      youtubeChannelAvatarUrl: session.user?.youtubeChannelAvatarUrl ?? null,
      submittedByRole: isChannelOwner
        ? "owner"
        : session.user?.role ?? "user",
      instagramHandle: normalizeHandle(instagramHandle),
      tiktokHandle: normalizeHandle(tiktokHandle),
    };

    // If replacing, update the existing submission; otherwise add a new one
    if (replaceExisting && allExisting.length > 0) {
      const existingDoc = allExisting[0];
      // Preserve the original timestamp and order for queue position
      const existingData = existingDoc.data();
      await existingDoc.ref.update({
        ...submission,
        timestamp: existingData.timestamp,
        order: existingData.order,
      });
    } else {
      // Add to Firestore using Admin SDK
      await db.collection("submissions").add(submission);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error submitting track:", err);
    return NextResponse.json({ success: false, error: "Failed to submit track." });
  }
}
