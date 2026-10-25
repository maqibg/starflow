import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatDateTime } from "@/lib/cron";
import { createOrganizeSnapshot } from "@/lib/snapshot";

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 删除前自动留底，误删可以用快照整体恢复
    const snapshot = await createOrganizeSnapshot(
      userId,
      `清除笔记前 ${formatDateTime(new Date())}`
    );

    // Delete all notes for this user
    await prisma.note.deleteMany({
      where: {
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      snapshotId: snapshot?.id ?? null,
    });
  } catch (error) {
    console.error("Clear notes error:", error);
    return NextResponse.json(
      { error: "Failed to clear notes" },
      { status: 500 }
    );
  }
}
