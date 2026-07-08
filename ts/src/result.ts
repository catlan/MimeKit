/**
 * The non-throwing error model for mimekit-ts.
 *
 * MimeKit (C#) exposes almost every operation as a throwing `Parse` plus a
 * non-throwing `TryParse`. This port collapses each pair into a single
 * `parse(): Result<T>`; data errors are values, never exceptions. Only
 * programmer errors (invalid argument types, out-of-range indices — C#'s
 * `ArgumentException` family) throw native `TypeError`/`RangeError`.
 */

export type Result<T, E extends MimeError = MimeError> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E extends MimeError = MimeError> {
  readonly ok: false;
  readonly error: E;
}

/**
 * A structured, non-throwing error. `kind` is a stable machine-readable
 * discriminator (kebab-case); `offset` is the byte/char index into the input
 * where the problem was detected, when known.
 */
export interface MimeError {
  readonly kind: string;
  readonly message: string;
  readonly offset?: number;
  readonly cause?: MimeError;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E extends MimeError>(error: E): Err<E>;
export function err(kind: string, message: string, extra?: { offset?: number; cause?: MimeError }): Err;
export function err(
  errorOrKind: MimeError | string,
  message?: string,
  extra?: { offset?: number; cause?: MimeError },
): Err {
  if (typeof errorOrKind === 'string') {
    return { ok: false, error: mimeError(errorOrKind, message ?? errorOrKind, extra) };
  }
  return { ok: false, error: errorOrKind };
}

export function mimeError(
  kind: string,
  message: string,
  extra?: { offset?: number; cause?: MimeError },
): MimeError {
  return {
    kind,
    message,
    ...(extra?.offset !== undefined ? { offset: extra.offset } : {}),
    ...(extra?.cause !== undefined ? { cause: extra.cause } : {}),
  };
}

/**
 * Unwrap a Result in contexts where failure is a bug (tests, internal
 * invariants). Throws on Err — never use it on untrusted input paths.
 */
export function unwrap<T, E extends MimeError>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`unwrap() on Err: [${result.error.kind}] ${result.error.message}`);
  }
  return result.value;
}
