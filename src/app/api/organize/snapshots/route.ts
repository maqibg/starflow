import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { formatDateTime } from "@/lib/cron";
import { listSnapshots } from "@/lib/snapshot";

/**
 * 列出最近的整理快照，供设置页选择恢复到哪一份。
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const snapshots = await listSnapshots(session.user.id, 10);

    return NextResponse.json({
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        label: snapshot.label,
        listCount: snapshot.listCount,
        noteCount: snapshot.noteCount,
        repoCount: snapshot.repoCount,
        createdAt: formatDateTime(snapshot.createdAt),
      })),
    });
  } catch (error) {
    console.error("List snapshots error:", error);
    return NextResponse.json(
      { error: "Failed to list snapshots" },
      { status: 500 }
    );
  }
}
