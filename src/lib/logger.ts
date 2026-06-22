// Минимальный структурный логгер с уровнями (M-1). Заменяет россыпь console.*.
// Порог берётся из LOG_LEVEL (debug|info|warn|error); по умолчанию debug в dev,
// info в проде. Формат: `[level] [scope] …`. Scope — обычно домен или reqId.

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function thresholdLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
  if (fromEnv && fromEnv in ORDER) return fromEnv;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const threshold = ORDER[thresholdLevel()];

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Дочерний логгер с дополнительным scope (домен/reqId). */
  child(scope: string): Logger;
}

function emit(level: LogLevel, scope: string | undefined, args: unknown[]): void {
  if (ORDER[level] < threshold) return;
  const prefix = scope ? `[${level}] [${scope}]` : `[${level}]`;
  const sink =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(prefix, ...args);
}

export function createLogger(scope?: string): Logger {
  return {
    debug: (...args) => emit("debug", scope, args),
    info: (...args) => emit("info", scope, args),
    warn: (...args) => emit("warn", scope, args),
    error: (...args) => emit("error", scope, args),
    child: (childScope) =>
      createLogger(scope ? `${scope} ${childScope}` : childScope),
  };
}

/** Корневой логгер без scope. */
export const logger = createLogger();
