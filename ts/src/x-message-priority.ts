// Port of MimeKit/XPriority.cs (XMessagePriority).
//
// C#'s enum is numeric (Highest=1..Lowest=5). The TS port keeps a name-based
// string union; the numeric level (for X-Priority header parsing/formatting)
// is recovered via xPriorityLevels / rawXPriorityValues.

export const XMessagePriority = {
  Highest: 'highest',
  High: 'high',
  Normal: 'normal',
  Low: 'low',
  Lowest: 'lowest',
} as const;

export type XMessagePriority = (typeof XMessagePriority)[keyof typeof XMessagePriority];

// Index 1..5 -> value (index 0 unused; C# clamps parsed ints to [1,5]).
export const xPriorityByLevel: readonly (XMessagePriority | null)[] = [
  null,
  XMessagePriority.Highest,
  XMessagePriority.High,
  XMessagePriority.Normal,
  XMessagePriority.Low,
  XMessagePriority.Lowest,
];

// value -> the raw "N (Name)" header token C# writes.
export const rawXPriorityValues: Record<XMessagePriority, string> = {
  highest: '1 (Highest)',
  high: '2 (High)',
  normal: '3 (Normal)',
  low: '4 (Low)',
  lowest: '5 (Lowest)',
};

export function isXMessagePriority(value: unknown): value is XMessagePriority {
  return value === 'highest' || value === 'high' || value === 'normal' || value === 'low' || value === 'lowest';
}
