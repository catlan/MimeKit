// Port of MimeKit/Text/HtmlTokenKind.cs.

/** The kinds of tokens that the {@link HtmlTokenizer} can emit. */
export enum HtmlTokenKind {
  /** A token consisting of CDATA. */
  CData = 'CData',
  /** An HTML comment token. */
  Comment = 'Comment',
  /** A token consisting of character data. */
  Data = 'Data',
  /** An HTML DOCTYPE token. */
  DocType = 'DocType',
  /** A token consisting of script data. */
  ScriptData = 'ScriptData',
  /** An HTML tag token. */
  Tag = 'Tag',
}
