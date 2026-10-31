import { randomBytes } from "node:crypto";
import { ZodError, type ZodType } from "zod";

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STOCK_INSUFFICIENT"
  | "DAILY_LIMIT"
  | "RATE_LIMITED"
  | "INTERNAL";

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STOCK_INSUFFICIENT: 409,
  DAILY_LIMIT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export type FieldErrors = Record<string, string[]>;

type ErrorExtra = { fieldErrors?: FieldErrors; errorId?: string };

/** Serializable error shape carried by a failed Result (safe to return from Server Actions). */
export type ResultError = {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
  errorId?: string;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: ResultError };

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;
  readonly errorId?: string;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string, extra: ErrorExtra = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = extra.fieldErrors;
    this.errorId = extra.errorId;
    this.httpStatus = HTTP_STATUS[code];
  }

  toResultError(): ResultError {
    const error: ResultError = { code: this.code, message: this.message };
    if (this.fieldErrors) error.fieldErrors = this.fieldErrors;
    if (this.errorId) error.errorId = this.errorId;
    return error;
  }
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string, extra?: ErrorExtra): Result<never> {
  return { ok: false, error: new DomainError(code, message, extra).toResultError() };
}

export function fromZod(error: ZodError): DomainError {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return new DomainError("VALIDATION", "Girilen bilgiler geçersiz", { fieldErrors });
}

export function safeAction<I, O>(
  schema: ZodType<I>,
  handler: (input: I) => Promise<O>,
): (raw: unknown) => Promise<Result<O>> {
  return async (raw) => {
    try {
      const input = schema.parse(raw);
      return ok(await handler(input));
    } catch (err) {
      if (err instanceof ZodError) return { ok: false, error: fromZod(err).toResultError() };
      if (err instanceof DomainError) return { ok: false, error: err.toResultError() };
      const errorId = randomBytes(4).toString("hex");
      console.error(`[safeAction] ${errorId}`, err);
      return fail("INTERNAL", "Beklenmeyen bir hata oluştu", { errorId });
    }
  };
}
