import { NextResponse } from "next/server";
import { db } from "../../../firebase/firebaseAdmin";

export async function GET() {
  try {
    // Check killswitch - get submission status
    const configRef = db.collection("config").doc("submissions");
    const configDoc = await configRef.get();
    const config = configDoc.data();

    const submissionsEnabled = config?.submissionEnabled !== false;

    return NextResponse.json({ 
      submissionsEnabled 
    });
  } catch (error) {
    console.error("Error checking submission status:", error);
    // Default to enabled if there's an error
    return NextResponse.json({ 
      submissionsEnabled: true 
    });
  }
}

