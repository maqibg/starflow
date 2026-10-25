import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatDateTime, nextRunAfter, validateCron } from "@/lib/cron";

const DEFAULT_CRON = "0 3 * * *";

/**
 * 读取定时同步配置。未配置时返回默认值，方便设置页直接渲染。
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schedule = await prisma.syncSchedule.findUnique({
      where: { userId: session.user.id },
    });

    const cron = schedule?.cron ?? DEFAULT_CRON;
    const next = nextRunAfter(cron, new Date());

    return NextResponse.json({
      enabled: schedule?.enabled ?? false,
      cron,
      lastRunAt: schedule?.lastRunAt ? formatDateTime(schedule.lastRunAt) : null,
      lastStatus: schedule?.lastStatus ?? null,
      lastError: schedule?.lastError ?? null,
      nextRun: next ? formatDateTime(next) : null,
      timeZone: process.env.TZ || "UTC",
    });
  } catch (error) {
    console.error("Read sync schedule error:", error);
    return NextResponse.json(
      { error: "Failed to read schedule" },
      { status: 500 }
    );
  }
}

/**
 * 保存定时同步配置。cron 表达式在写入前校验，非法直接返回 400 与原因。
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const enabled = Boolean(body?.enabled);
    const expression = typeof body?.cron === "string" ? body.cron.trim() : "";

    if (!expression) {
      return NextResponse.json(
        { error: "请填写 cron 表达式" },
        { status: 400 }
      );
    }

    const validated = validateCron(expression);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const schedule = await prisma.syncSchedule.upsert({
      where: { userId: session.user.id },
      update: {
        enabled,
        cron: validated.cron.expression,
      },
      create: {
        userId: session.user.id,
        enabled,
        cron: validated.cron.expression,
      },
    });

    return NextResponse.json({
      enabled: schedule.enabled,
      cron: schedule.cron,
      nextRun: validated.nextRun ? formatDateTime(validated.nextRun) : null,
      timeZone: process.env.TZ || "UTC",
    });
  } catch (error) {
    console.error("Save sync schedule error:", error);
    return NextResponse.json(
      { error: "Failed to save schedule" },
      { status: 500 }
    );
  }
}
