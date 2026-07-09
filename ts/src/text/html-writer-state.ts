// Port of MimeKit/Text/HtmlWriterState.cs.

/** An enumeration of possible states of an {@link HtmlWriter}. */
export enum HtmlWriterState {
  /** The writer is not within a tag and can only write a tag or text. */
  Default = 'Default',
  /** The writer is inside a tag and can write an attribute, another tag, or text. */
  Tag = 'Tag',
  /** The writer is inside an attribute and can append a value, start another attribute, or write another tag or text. */
  Attribute = 'Attribute',
}
