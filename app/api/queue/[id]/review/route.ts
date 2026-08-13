import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parseReviewedMutation } from "@/lib/admin-player";
import { db } from "../../../../firebase/firebaseAdmin";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing submission id" },
        { status: 400 },
      );
    }

    const reviewed = parseReviewedMutation(await request.json());

    if (reviewed === null) {
      return NextResponse.json(
        { success: false, error: "reviewed must be a boolean" },
        { status: 400 },
      );
    }

    const submissionRef = db.collection("submissions").doc(id);
    const submission = await submissionRef.get();
    if (!submission.exists) {
      return NextResponse.json(
        { success: false, error: "Submission not found" },
        { status: 404 },
      );
    }

    await submissionRef.update({
      reviewedAt: reviewed ? FieldValue.serverTimestamp() : FieldValue.delete(),
    });

    return NextResponse.json({ success: true, reviewed });
  } catch (error) {
    console.error("Failed to update submission review state", error);
    return NextResponse.json(
      { success: false, error: "Failed to update review state" },
      { status: 500 },
    );
  }
}
