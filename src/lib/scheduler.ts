import prisma from "@/lib/prisma";
import { matchesCron, parseCron, type ParsedCron } from "@/lib/cron";
import { syncUserStars } from "@/lib/sync";

/**
 * 后台定时同步调度器。
 *
 * 由 instrumentation 在服务启动时拉起，每 30 秒检查一次：
 * 配置了 cron 且当前分钟命中、且本分钟还没跑过的用户，执行一次星标同步。
 * 应用需要常驻运行（容器不退出）定时才会生效。
 */

const CHECK_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let ticking = false;
let schemaWarningShown = false;

function isSameMinute(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes()
  );
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2021"
  );
}

async function runSchedule(
  scheduleId: string,
  userId: string,
  at: Date
): Promise<void> {
  try {
    const result = await syncUserStars(userId);
    await prisma.syncSchedule.update({
      where: { id: scheduleId },
      data: { lastRunAt: at, lastStatus: "success", lastError: null },
    });
    console.log(
      `[scheduler] 用户 ${userId} 定时同步完成，共 ${result.count} 个仓库`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[scheduler] 用户 ${userId} 定时同步失败: ${message}`);

    try {
      await prisma.syncSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: at,
          lastStatus: "error",
          lastError: message.slice(0, 500),
        },
      });
    } catch (updateError) {
      console.error("[scheduler] 写入失败状态时出错:", updateError);
    }
  }
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;

  try {
    const now = new Date();
    const schedules = await prisma.syncSchedule.findMany({
      where: { enabled: true },
    });

    for (const schedule of schedules) {
      let parsed: ParsedCron;
      try {
        parsed = parseCron(schedule.cron);
      } catch (error) {
        console.error(
          `[scheduler] 用户 ${schedule.userId} 的表达式无效（${schedule.cron}）：`,
          error instanceof Error ? error.message : error
        );
        continue;
      }

      if (!matchesCron(parsed, now)) continue;
      // 同一分钟内只执行一次，避免 30 秒检查间隔造成重复同步
      if (schedule.lastRunAt && isSameMinute(schedule.lastRunAt, now)) continue;

      await runSchedule(schedule.id, schedule.userId, now);
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      if (!schemaWarningShown) {
        schemaWarningShown = true;
        console.error(
          "[scheduler] 数据库缺少定时同步相关数据表，已跳过检查。" +
            "请在服务器执行 prisma db push 同步表结构后重启容器。"
        );
      }
      return;
    }
    console.error("[scheduler] 检查定时任务失败:", error);
  } finally {
    ticking = false;
  }
}

export function startScheduler(): void {
  if (timer) return;

  timer = setInterval(() => {
    void tick();
  }, CHECK_INTERVAL_MS);
  // 不因这个定时器阻止进程退出
  timer.unref?.();

  console.log(
    `[scheduler] 定时同步检查已启动，检查间隔 ${CHECK_INTERVAL_MS / 1000} 秒`
  );
  void tick();
}
