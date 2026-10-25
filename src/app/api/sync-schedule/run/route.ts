import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SyncError, syncUserStars } from "@/lib/sync";

/**
 * 立即执行一次同步（设置页的「立即同步」按钮）。
 * 会同时刷新调度状态，避免同一分钟内定时任务重复执行。
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const startedAt = new Date();

  try {
    const result = await syncUserStars(userId);

    await prisma.syncSchedule.updateMany({
      where: { userId },
      data: { lastRunAt: startedAt, lastStatus: "success", lastError: null },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Manual sync error:", error);

    try {
      await prisma.syncSchedule.updateMany({
        where: { userId },
        data: {
          lastRunAt: startedAt,
          lastStatus: "error",
          lastError: message.slice(0, 500),
        },
      });
    } catch (updateError) {
      console.error("Record manual sync status error:", updateError);
    }

    if (error instanceof SyncError && error.kind === "no_token") {
      return NextResponse.json({ error: "No access token" }, { status: 401 });
    }

    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
