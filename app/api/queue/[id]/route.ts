import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  TrackValidationError,
  validateTrackSubmission,
} from "@/lib/track-validation";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../../firebase/firebaseAdmin";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: submissionId } = await context.params;

    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: "Missing submission id" },
        { status: 400 }
      );
    }

    const submissionRef = db.collection("submissions").doc(submissionId);
    await submissionRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete submission", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete submission" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: submissionId } = await context.params;

    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: "Missing submission id" },
        { status: 400 }
      );
    }

    const submissionRef = db.collection("submissions").doc(submissionId);
    const submissionDoc = await submissionRef.get();

    if (!submissionDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    const submissionData = submissionDoc.data();
    const userEmail = session.user?.email?.toLowerCase();
    const userChannelId = session.user?.youtubeChannelId?.toLowerCase();
    const submissionEmail = submissionData?.email?.toLowerCase();
    const submissionChannelId = submissionData?.youtubeChannelId?.toLowerCase();

    // Check if user owns this submission (by email or YouTube channel ID)
    // Admins can edit any submission
    const isOwner =
      (userEmail && userEmail === submissionEmail) ||
      (userChannelId && submissionChannelId && userChannelId === submissionChannelId);
    const isAdmin = session.user?.isAdmin ?? false;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, error: "You can only edit your own submissions" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      trackUrl,
      soundcloudLink,
      artistName,
      instagramHandle,
      tiktokHandle,
      priority: priorityUpdate,
    }: {
      trackUrl?: string;
      soundcloudLink?: string;
      artistName?: string;
      instagramHandle?: string;
      tiktokHandle?: string;
      priority?: boolean;
    } = body;

    const submittedTrackUrl = trackUrl ?? soundcloudLink;
    if (!submittedTrackUrl) {
      return NextResponse.json(
        { success: false, error: "Missing SoundCloud or Dropbox link" },
        { status: 400 }
      );
    }

    const validatedTrack = await validateTrackSubmission(submittedTrackUrl);
    const normalizedArtistName =
      typeof artistName === "string" ? artistName.trim() : "";

    if (!normalizedArtistName) {
      return NextResponse.json(
        { success: false, error: "Name or artist name is required." },
        { status: 400 },
      );
    }

    if (normalizedArtistName.length > 120) {
      return NextResponse.json(
        { success: false, error: "Name or artist name must be 120 characters or fewer." },
        { status: 400 },
      );
    }

    const normalizeHandle = (handle?: string | null) => {
      if (typeof handle !== "string") return null;
      const trimmed = handle.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const updateData: Record<string, unknown> = {
      trackUrl: validatedTrack.trackUrl,
      provider: validatedTrack.provider,
      trackTitle: validatedTrack.trackTitle,
      artistName: normalizedArtistName,
      soundcloudLink: FieldValue.delete(),
      instagramHandle: normalizeHandle(instagramHandle),
      tiktokHandle: normalizeHandle(tiktokHandle),
    };

    const existingTrackUrl = submissionData?.trackUrl ?? submissionData?.soundcloudLink;
    if (existingTrackUrl !== validatedTrack.trackUrl) {
      updateData.reviewedAt = FieldValue.delete();
    }

    // If admin is editing, they can also update priority
    if (isAdmin && typeof priorityUpdate === "boolean") {
      updateData.priority = priorityUpdate;
    }

    await submissionRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TrackValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }

    console.error("Failed to update submission", error);
    return NextResponse.json(
      { success: false, error: "Failed to update submission" },
      { status: 500 }
    );
  }
}
