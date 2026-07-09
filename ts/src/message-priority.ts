// Port of MimeKit/MessagePriority.cs.
//
// The string-union values are the raw Priority header tokens C# writes.

/** Message priority values for the Priority header. */
export const MessagePriority = {
  /** The message is non-urgent. */
  NonUrgent: 'non-urgent',
  /** The message has normal priority. */
  Normal: 'normal',
  /** The message is urgent. */
  Urgent: 'urgent',
} as const;

/** A message priority value. */
export type MessagePriority = (typeof MessagePriority)[keyof typeof MessagePriority];

/**
 * Tests whether a value is a message priority.
 *
 * @param value The value to test.
 * @returns `true` if the value is a message priority.
 */
export function isMessagePriority(value: unknown): value is MessagePriority {
  return value === 'non-urgent' || value === 'normal' || value === 'urgent';
}
