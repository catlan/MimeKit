/**
 * Port of MimeKit/ContentEncoding.cs.
 *
 * A string union instead of a numeric enum: values are the canonical wire
 * names, `'default'` means "no encoding at all".
 */
/**
 * Content-Transfer-Encoding values recognized by MimeKit.
 *
 * The string values are the canonical wire names used in MIME headers.
 */
export type ContentEncoding =
  | 'default'
  | '7bit'
  | '8bit'
  | 'binary'
  | 'base64'
  | 'quoted-printable'
  | 'uuencode';
