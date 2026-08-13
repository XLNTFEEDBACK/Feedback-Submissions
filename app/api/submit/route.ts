import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { FieldValue } from "firebase-admin/firestore";
import { authOptions } from "@/lib/auth";
import {
  allocateFairQueueOrder,
  getNextSubmissionRound,
  getQueueOrder,
  getSubmissionRound,
  sortByQueueOrder,
} from "@/lib/fair-queue";
import {
  TrackValidationError,
  validateTrackSubmission,
} from "@/lib/track-validation";
import { db } from "../../firebase/firebaseAdmin";

type ExistingSubmissionSummary = {
  id: string;
  trackUrl: string | null;
  trackTitle: string | null;
  artistName: string | null;
};

const normalizeHandle = (handle?: string | null) => {
  if (typeof handle !== "string") return null;
  const trimmed = handle.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const configRef = db.collection("config").doc("submissions");
    const initialConfig = (await configRef.get()).data();
    if (initialConfig?.submissionEnabled === false) {
      return NextResponse.json(
        {
          success: false,
          submissionsDisabled: true,
          error:
            "Submissions are currently disabled. Feedback sessions are not active at this time.",
        },
        { status: 403 },
      );
    }

    const {
      trackUrl,
      soundcloudLink,
      artistName,
      instagramHandle,
      tiktokHandle,
      replaceExisting,
      replaceSubmissionId,
    }: {
      trackUrl?: string;
      soundcloudLink?: string;
      artistName?: string;
      instagramHandle?: string;
      tiktokHandle?: string;
      replaceExisting?: boolean;
      replaceSubmissionId?: string;
    } = await req.json();

    const submittedTrackUrl = trackUrl ?? soundcloudLink;
    if (!submittedTrackUrl) {
      return NextResponse.json(
        { success: false, error: "Missing SoundCloud or Dropbox link." },
        { status: 400 },
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
        {
          success: false,
          error: "Name or artist name must be 120 characters or fewer.",
        },
        { status: 400 },
      );
    }

    const normalizedEmail = session.user?.email?.trim().toLowerCase() ?? "";
    const normalizedChannelId =
      session.user?.youtubeChannelId?.trim().toLowerCase() ?? "";
    const isChannelOwner = session.user?.isChannelOwner ?? false;
    const isSubscriber = session.user?.isSubscriber ?? null;
    const submissionsRef = db.collection("submissions");
    const newSubmissionRef = submissionsRef.doc();

    const commonSubmission = {
      trackUrl: validatedTrack.trackUrl,
      provider: validatedTrack.provider,
      trackTitle: validatedTrack.trackTitle,
      artistName: normalizedArtistName,
      email: normalizedEmail,
      priority: false,
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

    const result = await db.runTransaction(async (transaction) => {
      const configDoc = await transaction.get(configRef);
      const queueSnapshot = await transaction.get(submissionsRef);
      const config = configDoc.data();

      if (config?.submissionEnabled === false) {
        return { kind: "disabled" as const };
      }

      const allDocuments = queueSnapshot.docs;
      const existingDocuments = allDocuments.filter((document) => {
        const data = document.data();
        const documentEmail =
          typeof data.email === "string" ? data.email.toLowerCase() : "";
        const documentChannelId =
          typeof data.youtubeChannelId === "string"
            ? data.youtubeChannelId.toLowerCase()
            : "";
        return Boolean(
          (normalizedEmail && documentEmail === normalizedEmail) ||
            (normalizedChannelId && documentChannelId === normalizedChannelId),
        );
      });
      const sortedExistingDocuments = sortByQueueOrder(
        existingDocuments.map((document) => {
          const data = document.data();
          return {
            document,
            data,
            order: data.order,
            timestamp: data.timestamp,
            submissionRound: data.submissionRound,
            manualOrderOverride: data.manualOrderOverride,
          };
        }),
      );
      const wantsReplacement = Boolean(
        replaceSubmissionId || replaceExisting,
      );
      const allowMultipleSubmissions =
        config?.allowMultipleSubmissions === true;

      if (
        sortedExistingDocuments.length > 0 &&
        !allowMultipleSubmissions &&
        !wantsReplacement
      ) {
        const existingSubmissions: ExistingSubmissionSummary[] =
          sortedExistingDocuments.map(({ document, data }) => ({
            id: document.id,
            trackUrl:
              typeof data.trackUrl === "string"
                ? data.trackUrl
                : typeof data.soundcloudLink === "string"
                  ? data.soundcloudLink
                  : null,
            trackTitle:
              typeof data.trackTitle === "string" ? data.trackTitle : null,
            artistName:
              typeof data.artistName === "string" ? data.artistName : null,
          }));

        return {
          kind: "alreadyExists" as const,
          existingSubmissions,
        };
      }

      if (wantsReplacement) {
        const replacement = replaceSubmissionId
          ? sortedExistingDocuments.find(
              ({ document }) => document.id === replaceSubmissionId,
            )
          : sortedExistingDocuments[0];

        if (!replacement) {
          return { kind: "invalidReplacement" as const };
        }

        const existingData = replacement.document.data();
        transaction.update(replacement.document.ref, {
          ...commonSubmission,
          soundcloudLink: FieldValue.delete(),
          reviewedAt: FieldValue.delete(),
          timestamp: existingData.timestamp ?? new Date(),
          order:
            typeof existingData.order === "number"
              ? existingData.order
              : getQueueOrder(existingData),
          submissionRound: getSubmissionRound(existingData),
          manualOrderOverride: existingData.manualOrderOverride === true,
        });
        transaction.set(
          configRef,
          { queueRevision: FieldValue.increment(1) },
          { merge: true },
        );
        return { kind: "success" as const };
      }

      const existingEntries = sortedExistingDocuments.map(({ data }) => data);
      const submissionRound =
        allowMultipleSubmissions && existingEntries.length > 0
          ? getNextSubmissionRound(existingEntries)
          : 1;
      const queueEntries = allDocuments.map((document) => document.data());
      const order = allocateFairQueueOrder(queueEntries, submissionRound);

      transaction.create(newSubmissionRef, {
        ...commonSubmission,
        timestamp: new Date(),
        order,
        submissionRound,
        manualOrderOverride: false,
      });
      transaction.set(
        configRef,
        { queueRevision: FieldValue.increment(1) },
        { merge: true },
      );

      return { kind: "success" as const };
    });

    if (result.kind === "disabled") {
      return NextResponse.json(
        {
          success: false,
          submissionsDisabled: true,
          error:
            "Submissions are currently disabled. Feedback sessions are not active at this time.",
        },
        { status: 403 },
      );
    }

    if (result.kind === "invalidReplacement") {
      return NextResponse.json(
        { success: false, error: "The selected submission is no longer available." },
        { status: 409 },
      );
    }

    if (result.kind === "alreadyExists") {
      const firstExisting = result.existingSubmissions[0];
      return NextResponse.json({
        success: false,
        alreadyExists: true,
        existingSubmissionId: firstExisting?.id ?? null,
        existingTrackUrl: firstExisting?.trackUrl ?? null,
        existingSubmissions: result.existingSubmissions,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof TrackValidationError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 },
      );
    }

    console.error("Error submitting track:", err);
    return NextResponse.json(
      { success: false, error: "Failed to submit track." },
      { status: 500 },
    );
  }
}
