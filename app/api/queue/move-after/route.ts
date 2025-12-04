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

    const { submissionId, targetId } = await req.json();

    if (!submissionId || !targetId) {
      return NextResponse.json(
        { success: false, error: "Missing submissionId or targetId" },
        { status: 400 }
      );
    }

    const submissionRef = db.collection("submissions").doc(submissionId);
    const targetRef = db.collection("submissions").doc(targetId);

    const [submissionSnap, targetSnap] = await Promise.all([
      submissionRef.get(),
      targetRef.get(),
    ]);

    if (!submissionSnap.exists || !targetSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    // Get all submissions to find sorted order
    const allSubmissions = await db.collection("submissions").get();
    
    // Build array of submissions with their order values
    const submissionsWithOrder = allSubmissions.docs.map((doc) => {
      const data = doc.data();
      const order = typeof data.order === "number"
        ? data.order
        : (data.timestamp?.toMillis?.() ?? Date.now());
      return {
        id: doc.id,
        order,
      };
    });

    // Sort by order (ascending)
    submissionsWithOrder.sort((a, b) => a.order - b.order);

    // Find target submission index
    const targetIndex = submissionsWithOrder.findIndex((sub) => sub.id === targetId);
    
    if (targetIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Target submission not found in queue" },
        { status: 404 }
      );
    }

    // Find next submission after target (if exists)
    const nextIndex = targetIndex + 1;
    const targetOrder = submissionsWithOrder[targetIndex].order;

    let newOrder: number;
    
    if (nextIndex < submissionsWithOrder.length) {
      // There's a next submission - place between target and next
      const nextOrder = submissionsWithOrder[nextIndex].order;
      newOrder = (targetOrder + nextOrder) / 2;
    } else {
      // Target is the last item - place after it
      newOrder = targetOrder + 1;
    }

    // Update the submission being moved to have the new order
    await submissionRef.update({
      order: newOrder,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to move submission after target", error);
    return NextResponse.json(
      { success: false, error: "Failed to move submission after target" },
      { status: 500 }
    );
  }
}

