// Port of MimeKit/MessageImportance.cs.
//
// C#'s enum values serialize to the Importance header via
// value.ToString().ToLowerInvariant(); the string-union values ARE the
// lowercased header tokens so the mapping is the identity.

export const MessageImportance = {
  Low: 'low',
  Normal: 'normal',
  High: 'high',
} as const;

export type MessageImportance = (typeof MessageImportance)[keyof typeof MessageImportance];

export function isMessageImportance(value: unknown): value is MessageImportance {
  return value === 'low' || value === 'normal' || value === 'high';
}
