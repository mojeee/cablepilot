// Every call across the preload bridge returns a Result, never a raw exception (CLAUDE.md,
// Architecture). Errors carry a stable code, a plain-language message and a hint on what to do.

export interface AppError {
  code: string;
  message: string;
  hint: string;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: string, message: string, hint: string): Result<never> => ({
  ok: false,
  error: { code, message, hint },
});
