export type AppErrorCode =
  | "CONFIGURATION_ERROR"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "DEPENDENCY_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface AppErrorShape {
  code: AppErrorCode;
  message: string;
  retryable: boolean;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly correlationId?: string;
  readonly details?: Record<string, unknown>;

  constructor(input: AppErrorShape) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.correlationId = input.correlationId;
    this.details = input.details;
  }

  toJSON(): AppErrorShape {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.correlationId ? { correlationId: this.correlationId } : {}),
      ...(this.details ? { details: this.details } : {})
    };
  }
}
