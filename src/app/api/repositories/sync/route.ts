import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SyncError, syncUserStars } from "@/lib/sync";

/**
 * 手动同步星标仓库。
 * 具体逻辑在 src/lib/sync.ts，后台定时任务复用同一实现。
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await syncUserStars(session.user.id);

    return NextResponse.json({
      success: true,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof SyncError && error.kind === "no_token") {
      return NextResponse.json({ error: "No access token" }, { status: 401 });
    }

    console.error("Sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
