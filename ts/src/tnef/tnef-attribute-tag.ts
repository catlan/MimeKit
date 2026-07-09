/** A TNEF attribute tag. */
export const TnefAttributeTag = {
  /** A Null TNEF attribute. */
  Null: 0,
  /** The Owner TNEF attribute. */
  Owner: 393216,
  /** The SentFor TNEF attribute. */
  SentFor: 393217,
  /** The Delegate TNEF attribute. */
  Delegate: 393218,
  /** The OriginalMessageClass TNEF attribute. */
  OriginalMessageClass: 458758,
  /** The DateStart TNEF attribute. */
  DateStart: 196614,
  /** The DateEnd TNEF attribute. */
  DateEnd: 196615,
  /** The AidOwner TNEF attribute. */
  AidOwner: 327688,
  /** The RequestResponse TNEF attribute. */
  RequestResponse: 262153,
  /** The From TNEF attribute. */
  From: 32768,
  /** The Subject TNEF attribute. */
  Subject: 98308,
  /** The DateSent TNEF attribute. */
  DateSent: 229381,
  /** The DateReceived TNEF attribute. */
  DateReceived: 229382,
  /** The MessageStatus TNEF attribute. */
  MessageStatus: 425991,
  /** The MessageClass TNEF attribute. */
  MessageClass: 491528,
  /** The MessageId TNEF attribute. */
  MessageId: 98313,
  /** The ParentId TNEF attribute. */
  ParentId: 98314,
  /** The ConversationId TNEF attribute. */
  ConversationId: 98315,
  /** The Body TNEF attribute. */
  Body: 163852,
  /** The Priority TNEF attribute. */
  Priority: 294925,
  /** The AttachData TNEF attribute. */
  AttachData: 425999,
  /** The AttachTitle TNEF attribute. */
  AttachTitle: 98320,
  /** The AttachMetaFile TNEF attribute. */
  AttachMetaFile: 426001,
  /** The AttachCreateDate TNEF attribute. */
  AttachCreateDate: 229394,
  /** The AttachModifyDate TNEF attribute. */
  AttachModifyDate: 229395,
  /** The DateModified TNEF attribute. */
  DateModified: 229408,
  /** The AttachTransportFilename TNEF attribute. */
  AttachTransportFilename: 430081,
  /** The AttachRenderData TNEF attribute. */
  AttachRenderData: 430082,
  /** The MapiProperties TNEF attribute. */
  MapiProperties: 430083,
  /** The RecipientTable TNEF attribute. */
  RecipientTable: 430084,
  /** The Attachment TNEF attribute. */
  Attachment: 430085,
  /** The TnefVersion TNEF attribute. */
  TnefVersion: 561158,
  /** The OemCodepage TNEF attribute. */
  OemCodepage: 430087,
} as const;
/** Numeric value of a TnefAttributeTag. */
export type TnefAttributeTag = typeof TnefAttributeTag[keyof typeof TnefAttributeTag];
/** Get a display name for a TnefAttributeTag value. */
export function tnefAttributeTagName(value: number): string {
  return TnefAttributeTagNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefAttributeTagNames = new Map<number, string>([
  [0, 'Null'],
  [393216, 'Owner'],
  [393217, 'SentFor'],
  [393218, 'Delegate'],
  [458758, 'OriginalMessageClass'],
  [196614, 'DateStart'],
  [196615, 'DateEnd'],
  [327688, 'AidOwner'],
  [262153, 'RequestResponse'],
  [32768, 'From'],
  [98308, 'Subject'],
  [229381, 'DateSent'],
  [229382, 'DateReceived'],
  [425991, 'MessageStatus'],
  [491528, 'MessageClass'],
  [98313, 'MessageId'],
  [98314, 'ParentId'],
  [98315, 'ConversationId'],
  [163852, 'Body'],
  [294925, 'Priority'],
  [425999, 'AttachData'],
  [98320, 'AttachTitle'],
  [426001, 'AttachMetaFile'],
  [229394, 'AttachCreateDate'],
  [229395, 'AttachModifyDate'],
  [229408, 'DateModified'],
  [430081, 'AttachTransportFilename'],
  [430082, 'AttachRenderData'],
  [430083, 'MapiProperties'],
  [430084, 'RecipientTable'],
  [430085, 'Attachment'],
  [561158, 'TnefVersion'],
  [430087, 'OemCodepage'],
]);

/**
 * TNEF attribute type bit masks encoded into attribute tags.
 */
export const TnefAttributeType = {
  /** A triples attribute type. */
  Triples: 0x00000000,
  /** A string attribute type. */
  String: 0x00010000,
  /** A text attribute type. */
  Text: 0x00020000,
  /** A date attribute type. */
  Date: 0x00030000,
  /** A 16-bit signed integer attribute type. */
  Short: 0x00040000,
  /** A 32-bit signed integer attribute type. */
  Long: 0x00050000,
  /** A byte sequence attribute type. */
  Byte: 0x00060000,
  /** A 16-bit unsigned integer attribute type. */
  Word: 0x00070000,
  /** A 32-bit unsigned integer attribute type. */
  DWord: 0x00080000,
  /** The maximum attribute type marker. */
  Max: 0x00090000,
} as const;
/**
 * Numeric value of a TNEF attribute type.
 */
export type TnefAttributeType = typeof TnefAttributeType[keyof typeof TnefAttributeType];
