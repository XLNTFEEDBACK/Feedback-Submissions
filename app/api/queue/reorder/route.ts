import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../firebase/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { currentId, targetId } = await req.json();

    if (!currentId || !targetId) {
      return NextResponse.json(
        { success: false, error: "Missing currentId or targetId" },
        { status: 400 }
      );
    }

    const currentRef = db.collection("submissions").doc(currentId);
    const targetRef = db.collection("submissions").doc(targetId);

    const [currentSnap, targetSnap] = await Promise.all([
      currentRef.get(),
      targetRef.get(),
    ]);

    if (!currentSnap.exists || !targetSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    const currentOrder = currentSnap.data()?.order ?? currentSnap.createTime?.toMillis?.() ?? Date.now();
    const targetOrder = targetSnap.data()?.order ?? targetSnap.createTime?.toMillis?.() ?? Date.now();

    const batch = db.batch();
    batch.update(currentRef, { order: targetOrder });
    batch.update(targetRef, { order: currentOrder });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reorder submissions", error);
    return NextResponse.json(
      { success: false, error: "Failed to reorder submissions" },
      { status: 500 }
    );
  }
}
