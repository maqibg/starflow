import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatDateTime } from "@/lib/cron";
import { createOrganizeSnapshot } from "@/lib/snapshot";

type Target = "all" | "lists" | "notes";

const LABEL_PREFIX: Record<Target, string> = {
  all: "一键清除整理前",
  lists: "清除 Lists 前",
  notes: "清除笔记前",
};

/**
 * 清除整理结果（Lists / 笔记 / 全部）。
 * 删除前自动拍一张快照，可用 /api/organize/restore 整体恢复。
 * 只删整理出来的内容，不删仓库本身。
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const target: Target =
      body?.target === "lists" || body?.target === "notes"
        ? body.target
        : "all";

    // 先留底，再删除；此时数据还在，快照才是「整理前」的样子
    const snapshot = await createOrganizeSnapshot(
      userId,
      `${LABEL_PREFIX[target]} ${formatDateTime(new Date())}`
    );

    let clearedLists = 0;
    let clearedNotes = 0;

    if (target === "lists" || target === "all") {
      const lists = await prisma.list.findMany({
        where: { userId },
        select: { id: true },
      });
      clearedLists = lists.length;

      await prisma.listRepository.deleteMany({
        where: { list: { userId } },
      });
      await prisma.list.deleteMany({ where: { userId } });
    }

    if (target === "notes" || target === "all") {
      const result = await prisma.note.deleteMany({ where: { userId } });
      clearedNotes = result.count;
    }

    return NextResponse.json({
      success: true,
      target,
      clearedLists,
      clearedNotes,
      snapshotId: snapshot?.id ?? null,
      snapshotLabel: snapshot?.label ?? null,
    });
  } catch (error) {
    console.error("Organize clear error:", error);
    return NextResponse.json(
      { error: "Failed to clear organize data" },
      { status: 500 }
    );
  }
}
