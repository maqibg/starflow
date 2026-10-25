import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { restoreOrganizeSnapshot } from "@/lib/snapshot";

/**
 * 恢复到快照时的整理状态。
 * 不传 snapshotId 时恢复最近一张；恢复会覆盖当前的 Lists 与笔记。
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const snapshotId =
      typeof body?.snapshotId === "string" && body.snapshotId
        ? body.snapshotId
        : undefined;

    const result = await restoreOrganizeSnapshot(session.user.id, snapshotId);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Organize restore error:", error);

    if (message === "没有找到可恢复的快照") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "快照内容已损坏，无法恢复" || message === "快照版本不受支持") {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    return NextResponse.json(
      { error: "Failed to restore snapshot" },
      { status: 500 }
    );
  }
}
