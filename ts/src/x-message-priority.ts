// Port of MimeKit/XPriority.cs (XMessagePriority).
//
// C#'s enum is numeric (Highest=1..Lowest=5). The TS port keeps a name-based
// string union; the numeric level (for X-Priority header parsing/formatting)
// is recovered via xPriorityLevels / rawXPriorityValues.

/** X-Priority values ordered from highest to lowest. */
export const XMessagePriority = {
  /** The message has the highest priority. */
  Highest: 'highest',
  /** The message has high priority. */
  High: 'high',
  /** The message has normal priority. */
  Normal: 'normal',
  /** The message has low priority. */
  Low: 'low',
  /** The message has the lowest priority. */
  Lowest: 'lowest',
} as const;

/** An X-Priority value. */
export type XMessagePriority = (typeof XMessagePriority)[keyof typeof XMessagePriority];

// Index 1..5 -> value (index 0 unused; C# clamps parsed ints to [1,5]).
/** Maps numeric X-Priority levels 1 through 5 to priority values. */
export const xPriorityByLevel: readonly (XMessagePriority | null)[] = [
  null,
  XMessagePriority.Highest,
  XMessagePriority.High,
  XMessagePriority.Normal,
  XMessagePriority.Low,
  XMessagePriority.Lowest,
];

// value -> the raw "N (Name)" header token C# writes.
/** Maps X-Priority values to their raw header tokens. */
export const rawXPriorityValues: Record<XMessagePriority, string> = {
  highest: '1 (Highest)',
  high: '2 (High)',
  normal: '3 (Normal)',
  low: '4 (Low)',
  lowest: '5 (Lowest)',
};

/**
 * Tests whether a value is an X-Priority value.
 *
 * @param value The value to test.
 * @returns `true` if the value is an X-Priority value.
 */
export function isXMessagePriority(value: unknown): value is XMessagePriority {
  return value === 'highest' || value === 'high' || value === 'normal' || value === 'low' || value === 'lowest';
}
