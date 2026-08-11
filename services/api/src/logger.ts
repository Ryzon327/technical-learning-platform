export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  correlationId?: string;
  event?: string;
  metadata?: Record<string, unknown>;
}

const SECRET_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "apikey",
  "api_key",
  "service_role_key"
];

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (SECRET_KEYS.some((candidate) => key.toLowerCase().includes(candidate))) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeValue(nested);
      }
    }

    return sanitized;
  }

  return value;
}

export function createLogRecord(
  level: LogLevel,
  message: string,
  input: Omit<Partial<LogRecord>, "level" | "message" | "timestamp"> = {}
): LogRecord {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: input.service ?? "api",
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.event ? { event: input.event } : {}),
    ...(input.metadata
      ? { metadata: sanitizeValue(input.metadata) as Record<string, unknown> }
      : {})
  };
}

export function log(
  level: LogLevel,
  message: string,
  input?: Omit<Partial<LogRecord>, "level" | "message" | "timestamp">
): void {
  const record = createLogRecord(level, message, input);
  const serialized = JSON.stringify(record);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}
