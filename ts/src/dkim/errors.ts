// DKIM/ARC exception types.
//
// The DKIM/ARC public API mirrors MimeKit's throwing surface (Verify returns a
// boolean/result and throws on malformed input) rather than the Result-union
// convention used by the parser: the ported tests assert on these exact
// exception kinds. Programmer errors (null/invalid arguments — C#'s
// ArgumentNullException / ArgumentException family) throw native TypeError.

/** Thrown when a DKIM/ARC header value is malformed (C#: `FormatException`). */
export class FormatException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatException';
  }
}

/** Thrown when a DNS TXT record cannot be parsed (C#: `ParseException`). */
export class ParseException extends Error {
  /** The start offset of the error within the record. */
  readonly tokenIndex: number;
  /** The end offset of the error within the record. */
  readonly errorIndex: number;

  constructor(message: string, tokenIndex: number, errorIndex: number) {
    super(message);
    this.name = 'ParseException';
    this.tokenIndex = tokenIndex;
    this.errorIndex = errorIndex;
  }
}
