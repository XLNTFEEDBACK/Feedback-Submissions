import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { WriteResult } from "firebase-admin/firestore";
import { authOptions } from "@/lib/auth";
import { db } from "../../../firebase/firebaseAdmin";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin && !session?.user?.isChannelOwner) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const submissionsRef = db.collection("submissions");
    const snapshot = await submissionsRef.get();

    if (snapshot.empty) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    let batch = db.batch();
    let operations = 0;
    const commits: Array<Promise<WriteResult[]>> = [];
    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
      operations += 1;
      if (operations % 500 === 0) {
        commits.push(batch.commit());
        batch = db.batch();
      }
    });
    commits.push(batch.commit());
    await Promise.all(commits);

    return NextResponse.json({ success: true, deleted: snapshot.size });
  } catch (error) {
    console.error("Failed to clear submissions", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear submissions" },
      { status: 500 }
    );
  }
}
