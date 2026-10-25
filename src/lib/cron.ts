/**
 * 轻量 cron 解析，避免为定时同步引入额外依赖。
 *
 * 支持两种写法：
 *   5 段：分 时 日 月 周（标准 cron）
 *   6 段：秒 分 时 日 月 周（Quartz 风格，如 0 0 3 * * ?）
 *
 * 秒位只接受 0、*、?：调度器按分钟检查，声明具体秒值没有意义，
 * 这里直接报错而不是静默忽略，避免用户以为能精确到秒。
 */

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  dayRestricted: boolean;
  weekdayRestricted: boolean;
  expression: string;
}

/**
 * 解析单字段。支持 `*`、`?`、`a`、`a-b`、`a-b/n`、`/n` 与逗号组合。
 */
function parseField(
  field: string,
  min: number,
  max: number,
  label: string
): Set<number> {
  const result = new Set<number>();

  for (const rawPart of field.split(",")) {
    const part = rawPart.trim();
    if (!part) {
      throw new Error(`${label}字段存在空白项`);
    }

    let step = 1;
    let base = part;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      base = part.slice(0, slash);
      const stepText = part.slice(slash + 1);
      if (!/^\d+$/.test(stepText) || Number(stepText) === 0) {
        throw new Error(`${label}字段的步长 "${stepText}" 不是正整数`);
      }
      step = Number(stepText);
    }

    let start: number;
    let end: number;

    if (base === "*" || base === "?") {
      start = min;
      end = max;
    } else if (base.includes("-")) {
      const [rawStart, rawEnd] = base.split("-");
      if (!/^\d+$/.test(rawStart) || !/^\d+$/.test(rawEnd)) {
        throw new Error(`${label}字段范围 "${base}" 必须由数字构成`);
      }
      start = Number(rawStart);
      end = Number(rawEnd);
    } else {
      if (!/^\d+$/.test(base)) {
        throw new Error(`${label}字段 "${base}" 不是数字`);
      }
      start = Number(base);
      end = slash === -1 ? start : max;
    }

    if (start < min || end > max || start > end) {
      throw new Error(`${label}字段 "${part}" 超出 ${min}-${max} 范围`);
    }

    for (let value = start; value <= end; value += step) {
      result.add(value);
    }
  }

  return result;
}

export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/).filter(Boolean);

  if (fields.length !== 5 && fields.length !== 6) {
    throw new Error(
      "Cron 表达式需要 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周）"
    );
  }

  let body = fields;
  if (fields.length === 6) {
    const second = fields[0];
    if (second !== "0" && second !== "*" && second !== "?") {
      throw new Error(
        `秒位只支持 0 或 *，当前为 "${second}"（调度精度为分钟）`
      );
    }
    body = fields.slice(1);
  }

  const [minuteField, hourField, dayField, monthField, weekdayField] = body;

  const minutes = parseField(minuteField, 0, 59, "分钟");
  const hours = parseField(hourField, 0, 23, "小时");
  const days = parseField(dayField, 1, 31, "日");
  const months = parseField(monthField, 1, 12, "月");
  const weekdays = parseField(weekdayField, 0, 7, "周");

  // 周日既可以写 0 也可以写 7，统一成 0
  if (weekdays.has(7)) {
    weekdays.delete(7);
    weekdays.add(0);
  }

  return {
    minutes,
    hours,
    days,
    months,
    weekdays,
    dayRestricted: dayField.includes("*") === false && dayField !== "?",
    weekdayRestricted:
      weekdayField.includes("*") === false && weekdayField !== "?",
    expression: expression.trim(),
  };
}

export function matchesCron(cron: ParsedCron, date: Date): boolean {
  if (!cron.minutes.has(date.getMinutes())) return false;
  if (!cron.hours.has(date.getHours())) return false;
  if (!cron.months.has(date.getMonth() + 1)) return false;

  const dayMatches = cron.days.has(date.getDate());
  const weekdayMatches = cron.weekdays.has(date.getDay());

  // 日与周同时被限定时按标准 cron 的 OR 语义，否则两者都要满足
  if (cron.dayRestricted && cron.weekdayRestricted) {
    return dayMatches || weekdayMatches;
  }

  return dayMatches && weekdayMatches;
}

/**
 * 从 from 之后开始，逐分钟找出下一个执行时间；一年内找不到则返回 null。
 * 只在保存配置时调用一次，逐分钟扫描的成本可以接受。
 */
export function nextRunAfter(cron: ParsedCron, from: Date): Date | null {
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(cron, cursor)) {
      return new Date(cursor.getTime());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

export type CronValidation =
  | { ok: true; cron: ParsedCron; nextRun: Date }
  | { ok: false; error: string };

export function validateCron(expression: string): CronValidation {
  try {
    const cron = parseCron(expression);
    const nextRun = nextRunAfter(cron, new Date());
    if (!nextRun) {
      return {
        ok: false,
        error: "该表达式在一年内不会触发，请检查日与月的组合",
      };
    }
    return { ok: true, cron, nextRun };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cron 表达式无效",
    };
  }
}

export function formatDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
