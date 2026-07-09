// Port of MimeKit/Text/HtmlTokenizerState.cs.

/** The HTML tokenizer state. */
export enum HtmlTokenizerState {
  /** The Data state. */
  Data = 'Data',
  /** The Character Reference In Data state. */
  CharacterReferenceInData = 'CharacterReferenceInData',
  /** The Rc Data state. */
  RcData = 'RcData',
  /** The Character Reference In Rc Data state. */
  CharacterReferenceInRcData = 'CharacterReferenceInRcData',
  /** The Raw Text state. */
  RawText = 'RawText',
  /** The Script Data state. */
  ScriptData = 'ScriptData',
  /** The Plain Text state. */
  PlainText = 'PlainText',
  /** The Tag Open state. */
  TagOpen = 'TagOpen',
  /** The End Tag Open state. */
  EndTagOpen = 'EndTagOpen',
  /** The Tag Name state. */
  TagName = 'TagName',
  /** The Rc Data Less Than state. */
  RcDataLessThan = 'RcDataLessThan',
  /** The Rc Data End Tag Open state. */
  RcDataEndTagOpen = 'RcDataEndTagOpen',
  /** The Rc Data End Tag Name state. */
  RcDataEndTagName = 'RcDataEndTagName',
  /** The Raw Text Less Than state. */
  RawTextLessThan = 'RawTextLessThan',
  /** The Raw Text End Tag Open state. */
  RawTextEndTagOpen = 'RawTextEndTagOpen',
  /** The Raw Text End Tag Name state. */
  RawTextEndTagName = 'RawTextEndTagName',
  /** The Script Data Less Than state. */
  ScriptDataLessThan = 'ScriptDataLessThan',
  /** The Script Data End Tag Open state. */
  ScriptDataEndTagOpen = 'ScriptDataEndTagOpen',
  /** The Script Data End Tag Name state. */
  ScriptDataEndTagName = 'ScriptDataEndTagName',
  /** The Script Data Escape Start state. */
  ScriptDataEscapeStart = 'ScriptDataEscapeStart',
  /** The Script Data Escape Start Dash state. */
  ScriptDataEscapeStartDash = 'ScriptDataEscapeStartDash',
  /** The Script Data Escaped state. */
  ScriptDataEscaped = 'ScriptDataEscaped',
  /** The Script Data Escaped Dash state. */
  ScriptDataEscapedDash = 'ScriptDataEscapedDash',
  /** The Script Data Escaped Dash Dash state. */
  ScriptDataEscapedDashDash = 'ScriptDataEscapedDashDash',
  /** The Script Data Escaped Less Than state. */
  ScriptDataEscapedLessThan = 'ScriptDataEscapedLessThan',
  /** The Script Data Escaped End Tag Open state. */
  ScriptDataEscapedEndTagOpen = 'ScriptDataEscapedEndTagOpen',
  /** The Script Data Escaped End Tag Name state. */
  ScriptDataEscapedEndTagName = 'ScriptDataEscapedEndTagName',
  /** The Script Data Double Escape Start state. */
  ScriptDataDoubleEscapeStart = 'ScriptDataDoubleEscapeStart',
  /** The Script Data Double Escaped state. */
  ScriptDataDoubleEscaped = 'ScriptDataDoubleEscaped',
  /** The Script Data Double Escaped Dash state. */
  ScriptDataDoubleEscapedDash = 'ScriptDataDoubleEscapedDash',
  /** The Script Data Double Escaped Dash Dash state. */
  ScriptDataDoubleEscapedDashDash = 'ScriptDataDoubleEscapedDashDash',
  /** The Script Data Double Escaped Less Than state. */
  ScriptDataDoubleEscapedLessThan = 'ScriptDataDoubleEscapedLessThan',
  /** The Script Data Double Escape End state. */
  ScriptDataDoubleEscapeEnd = 'ScriptDataDoubleEscapeEnd',
  /** The Before Attribute Name state. */
  BeforeAttributeName = 'BeforeAttributeName',
  /** The Attribute Name state. */
  AttributeName = 'AttributeName',
  /** The After Attribute Name state. */
  AfterAttributeName = 'AfterAttributeName',
  /** The Before Attribute Value state. */
  BeforeAttributeValue = 'BeforeAttributeValue',
  /** The Attribute Value Quoted state. */
  AttributeValueQuoted = 'AttributeValueQuoted',
  /** The Attribute Value Unquoted state. */
  AttributeValueUnquoted = 'AttributeValueUnquoted',
  /** The Character Reference In Attribute Value state. */
  CharacterReferenceInAttributeValue = 'CharacterReferenceInAttributeValue',
  /** The After Attribute Value Quoted state. */
  AfterAttributeValueQuoted = 'AfterAttributeValueQuoted',
  /** The Self Closing Start Tag state. */
  SelfClosingStartTag = 'SelfClosingStartTag',
  /** The Bogus Comment state. */
  BogusComment = 'BogusComment',
  /** The Markup Declaration Open state. */
  MarkupDeclarationOpen = 'MarkupDeclarationOpen',
  /** The Comment Start state. */
  CommentStart = 'CommentStart',
  /** The Comment Start Dash state. */
  CommentStartDash = 'CommentStartDash',
  /** The Comment state. */
  Comment = 'Comment',
  /** The Comment End Dash state. */
  CommentEndDash = 'CommentEndDash',
  /** The Comment End state. */
  CommentEnd = 'CommentEnd',
  /** The Comment End Bang state. */
  CommentEndBang = 'CommentEndBang',
  /** The Doc Type state. */
  DocType = 'DocType',
  /** The Before Doc Type Name state. */
  BeforeDocTypeName = 'BeforeDocTypeName',
  /** The Doc Type Name state. */
  DocTypeName = 'DocTypeName',
  /** The After Doc Type Name state. */
  AfterDocTypeName = 'AfterDocTypeName',
  /** The After Doc Type Public Keyword state. */
  AfterDocTypePublicKeyword = 'AfterDocTypePublicKeyword',
  /** The Before Doc Type Public Identifier state. */
  BeforeDocTypePublicIdentifier = 'BeforeDocTypePublicIdentifier',
  /** The Doc Type Public Identifier Quoted state. */
  DocTypePublicIdentifierQuoted = 'DocTypePublicIdentifierQuoted',
  /** The After Doc Type Public Identifier state. */
  AfterDocTypePublicIdentifier = 'AfterDocTypePublicIdentifier',
  /** The Between Doc Type Public And System Identifiers state. */
  BetweenDocTypePublicAndSystemIdentifiers = 'BetweenDocTypePublicAndSystemIdentifiers',
  /** The After Doc Type System Keyword state. */
  AfterDocTypeSystemKeyword = 'AfterDocTypeSystemKeyword',
  /** The Before Doc Type System Identifier state. */
  BeforeDocTypeSystemIdentifier = 'BeforeDocTypeSystemIdentifier',
  /** The Doc Type System Identifier Quoted state. */
  DocTypeSystemIdentifierQuoted = 'DocTypeSystemIdentifierQuoted',
  /** The After Doc Type System Identifier state. */
  AfterDocTypeSystemIdentifier = 'AfterDocTypeSystemIdentifier',
  /** The Bogus Doc Type state. */
  BogusDocType = 'BogusDocType',
  /** The CData Section state. */
  CDataSection = 'CDataSection',
  /** The End Of File state. */
  EndOfFile = 'EndOfFile',
}
