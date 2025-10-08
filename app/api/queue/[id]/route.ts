import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../firebase/firebaseAdmin";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const submissionId = params.id;

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
