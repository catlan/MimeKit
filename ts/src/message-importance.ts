// Port of MimeKit/MessageImportance.cs.
//
// C#'s enum values serialize to the Importance header via
// value.ToString().ToLowerInvariant(); the string-union values ARE the
// lowercased header tokens so the mapping is the identity.

/** Message importance values for the Importance header. */
export const MessageImportance = {
  /** The message is of low importance. */
  Low: 'low',
  /** The message is of normal importance. */
  Normal: 'normal',
  /** The message is of high importance. */
  High: 'high',
} as const;

/** A message importance value. */
export type MessageImportance = (typeof MessageImportance)[keyof typeof MessageImportance];

/**
 * Tests whether a value is a message importance.
 *
 * @param value The value to test.
 * @returns `true` if the value is a message importance.
 */
export function isMessageImportance(value: unknown): value is MessageImportance {
  return value === 'low' || value === 'normal' || value === 'high';
}
