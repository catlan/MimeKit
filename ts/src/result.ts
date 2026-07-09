/**
 * The non-throwing error model for mimekit-ts.
 *
 * MimeKit (C#) exposes almost every operation as a throwing `Parse` plus a
 * non-throwing `TryParse`. This port collapses each pair into a single
 * `parse(): Result<T>`; data errors are values, never exceptions. Only
 * programmer errors (invalid argument types, out-of-range indices — C#'s
 * `ArgumentException` family) throw native `TypeError`/`RangeError`.
 */

/**
 * The non-throwing result of an operation that may fail because of malformed
 * MIME data.
 *
 * @typeParam T - The value type returned on success.
 * @typeParam E - The structured error type returned on failure.
 */
export type Result<T, E extends MimeError = MimeError> = Ok<T> | Err<E>;

/**
 * A successful {@link Result}.
 *
 * @typeParam T - The contained value type.
 */
export interface Ok<T> {
  /** Discriminates this result as successful. */
  readonly ok: true;
  /** The successful value. */
  readonly value: T;
}

/**
 * A failed {@link Result}.
 *
 * @typeParam E - The structured error type.
 */
export interface Err<E extends MimeError = MimeError> {
  /** Discriminates this result as failed. */
  readonly ok: false;
  /** The structured error describing the failure. */
  readonly error: E;
}

/**
 * A structured, non-throwing error. `kind` is a stable machine-readable
 * discriminator (kebab-case); `offset` is the byte/char index into the input
 * where the problem was detected, when known.
 */
export interface MimeError {
  /** Stable machine-readable discriminator, usually kebab-case. */
  readonly kind: string;
  /** Human-readable error message. */
  readonly message: string;
  /** Byte or character offset where the problem was detected, when known. */
  readonly offset?: number;
  /** Underlying structured cause, when a parser layers errors. */
  readonly cause?: MimeError;
}

/**
 * Create a successful {@link Result}.
 *
 * @param value - The value to wrap.
 * @returns A successful result containing `value`.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create a failed {@link Result}.
 *
 * @param error - The structured error to wrap.
 * @returns A failed result containing `error`.
 */
export function err<E extends MimeError>(error: E): Err<E>;
/**
 * Create a failed {@link Result} from error parts.
 *
 * @param kind - Stable machine-readable discriminator.
 * @param message - Human-readable error message.
 * @param extra - Optional offset or cause details.
 * @returns A failed result containing a {@link MimeError}.
 */
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

/**
 * Create a structured MIME error value.
 *
 * @param kind - Stable machine-readable discriminator.
 * @param message - Human-readable error message.
 * @param extra - Optional offset or cause details.
 * @returns A {@link MimeError}.
 */
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
 *
 * @param result - The result to unwrap.
 * @returns The successful value.
 * @throws {Error} The result is an {@link Err}.
 */
export function unwrap<T, E extends MimeError>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`unwrap() on Err: [${result.error.kind}] ${result.error.message}`);
  }
  return result.value;
}
