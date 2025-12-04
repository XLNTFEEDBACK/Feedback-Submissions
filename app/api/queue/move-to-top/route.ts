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

    const { submissionId } = await req.json();

    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: "Missing submissionId" },
        { status: 400 }
      );
    }

    const submissionRef = db.collection("submissions").doc(submissionId);
    const submissionSnap = await submissionRef.get();

    if (!submissionSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    // Get all submissions to find the lowest order value
    const allSubmissions = await db.collection("submissions").get();
    
    let lowestOrder = 0;
    allSubmissions.forEach((doc) => {
      const data = doc.data();
      const order = typeof data.order === "number" 
        ? data.order 
        : (data.timestamp?.toMillis?.() ?? Date.now());
      if (order < lowestOrder) {
        lowestOrder = order;
      }
    });

    // Set the submission's order to be lower than the lowest order
    // This ensures it appears at the top (lower order = higher priority)
    // Also set priority to true so it appears above other priority tracks
    const newOrder = lowestOrder - 1_000_000;

    await submissionRef.update({ 
      order: newOrder,
      priority: true 
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to move submission to top", error);
    return NextResponse.json(
      { success: false, error: "Failed to move submission to top" },
      { status: 500 }
    );
  }
}

