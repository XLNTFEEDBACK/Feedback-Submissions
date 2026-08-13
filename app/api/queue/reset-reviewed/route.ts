import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "../../../firebase/firebaseAdmin";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const snapshot = await db.collection("submissions").get();
    if (snapshot.empty) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    let batch = db.batch();
    let batchSize = 0;
    let updated = 0;
    const commits: Array<Promise<unknown>> = [];

    for (const document of snapshot.docs) {
      batch.update(document.ref, { reviewedAt: FieldValue.delete() });
      batchSize += 1;
      updated += 1;

      if (batchSize === 500) {
        commits.push(batch.commit());
        batch = db.batch();
        batchSize = 0;
      }
    }

    if (batchSize > 0) commits.push(batch.commit());
    await Promise.all(commits);

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("Failed to reset queue review state", error);
    return NextResponse.json(
      { success: false, error: "Failed to reset queue review state" },
      { status: 500 },
    );
  }
}
