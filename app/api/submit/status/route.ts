import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../firebase/firebaseAdmin";

export async function GET() {
  try {
    // Check killswitch - get submission status
    const configRef = db.collection("config").doc("submissions");
    const configDoc = await configRef.get();
    const config = configDoc.data();

    const submissionsEnabled = config?.submissionEnabled !== false;
    const allowMultipleSubmissions =
      config?.allowMultipleSubmissions === true;

    return NextResponse.json({ 
      submissionsEnabled,
      allowMultipleSubmissions,
    });
  } catch (error) {
    console.error("Error checking submission status:", error);
    // Default to enabled if there's an error
    return NextResponse.json({ 
      submissionsEnabled: true,
      allowMultipleSubmissions: false,
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();
    const allowMultipleSubmissions =
      typeof body === "object" &&
      body !== null &&
      "allowMultipleSubmissions" in body
        ? (body as { allowMultipleSubmissions?: unknown })
            .allowMultipleSubmissions
        : undefined;

    if (typeof allowMultipleSubmissions !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          error: "allowMultipleSubmissions must be a boolean.",
        },
        { status: 400 },
      );
    }

    await db.collection("config").doc("submissions").set(
      { allowMultipleSubmissions },
      { merge: true },
    );

    return NextResponse.json({
      success: true,
      allowMultipleSubmissions,
    });
  } catch (error) {
    console.error("Error updating multiple-submission status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update submission settings." },
      { status: 500 },
    );
  }
}
