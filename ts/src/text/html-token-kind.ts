// Port of MimeKit/Text/HtmlTokenKind.cs.

/** The kinds of tokens that the HtmlTokenizer can emit. */
export enum HtmlTokenKind {
  CData = 'CData',
  Comment = 'Comment',
  Data = 'Data',
  DocType = 'DocType',
  ScriptData = 'ScriptData',
  Tag = 'Tag',
}
