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

    // Get all submissions to find the absolute lowest order value
    const allSubmissions = await db.collection("submissions").get();
    
    let lowestOrder = Number.MAX_SAFE_INTEGER;
    allSubmissions.forEach((doc) => {
      const data = doc.data();
      const order = typeof data.order === "number" 
        ? data.order 
        : (data.timestamp?.toMillis?.() ?? Date.now());
      if (order < lowestOrder) {
        lowestOrder = order;
      }
    });

    // Set the submission's order to be significantly lower than the lowest existing order
    // This ensures it appears at the absolute top when sorted by order
    // We subtract a large number to ensure it's always first
    const newOrder = lowestOrder - 10_000_000_000;

    // Update order only (priority is disabled)
    await submissionRef.update({ 
      order: newOrder
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

