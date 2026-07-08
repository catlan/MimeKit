// Port of MimeKit/MessagePriority.cs.
//
// The string-union values are the raw Priority header tokens C# writes.

export const MessagePriority = {
  NonUrgent: 'non-urgent',
  Normal: 'normal',
  Urgent: 'urgent',
} as const;

export type MessagePriority = (typeof MessagePriority)[keyof typeof MessagePriority];

export function isMessagePriority(value: unknown): value is MessagePriority {
  return value === 'non-urgent' || value === 'normal' || value === 'urgent';
}
