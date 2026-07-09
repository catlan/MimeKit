import { TnefPropertyId, tnefPropertyIdName, type TnefPropertyId as TnefPropertyIdValue } from './tnef-property-id.js';
import { TnefPropertyType, type TnefPropertyType as TnefPropertyTypeValue } from './tnef-property-type.js';

const NAMED_MIN = 0x8000;
const NAMED_MAX = 0xfffe;
const MULTI_VALUED_FLAG = TnefPropertyType.MultiValued;

/**
 * A TNEF property tag.
 */
export class TnefPropertyTag {
  /**
   * The null TNEF property tag.
   */
  static readonly Null = new TnefPropertyTag(TnefPropertyId.Null, TnefPropertyType.Null);

  /**
   * Gets the property identifier.
   */
  readonly id: TnefPropertyIdValue;
  /**
   * Gets the TNEF property type.
   */
  readonly tnefType: TnefPropertyTypeValue;

  /**
   * Creates a new TNEF property tag from a 32-bit tag value.
   *
   * @param tag the encoded property tag.
   */
  constructor(tag: number);
  /**
   * Creates a new TNEF property tag from an identifier and type.
   *
   * @param id the property identifier.
   * @param type the TNEF property type.
   * @param multiValue whether the property contains multiple values.
   */
  constructor(id: TnefPropertyIdValue, type: TnefPropertyTypeValue, multiValue?: boolean);
  constructor(idOrTag: number, type?: number, multiValue = false) {
    if (type === undefined) {
      this.tnefType = ((idOrTag >>> 16) & 0xffff) as TnefPropertyTypeValue;
      this.id = (idOrTag & 0xffff) as TnefPropertyIdValue;
    } else {
      this.tnefType = ((type as number) | (multiValue ? MULTI_VALUED_FLAG : 0)) as TnefPropertyTypeValue;
      this.id = idOrTag as TnefPropertyIdValue;
    }
    Object.freeze(this);
  }

  /**
   * Gets whether the property contains multiple values.
   */
  get isMultiValued(): boolean {
    return ((this.tnefType as number) & MULTI_VALUED_FLAG) !== 0;
  }

  /**
   * Gets whether the property is a named property.
   */
  get isNamed(): boolean {
    return (this.id as number) >= NAMED_MIN && (this.id as number) <= NAMED_MAX;
  }

  /**
   * Gets the property type without the multi-valued flag.
   */
  get valueTnefType(): TnefPropertyTypeValue {
    return ((this.tnefType as number) & ~MULTI_VALUED_FLAG) as TnefPropertyTypeValue;
  }

  /**
   * Gets whether the TNEF property type is valid.
   */
  get isTnefTypeValid(): boolean {
    switch (this.valueTnefType) {
    case TnefPropertyType.I2:
    case TnefPropertyType.Long:
    case TnefPropertyType.R4:
    case TnefPropertyType.Double:
    case TnefPropertyType.Currency:
    case TnefPropertyType.AppTime:
    case TnefPropertyType.I8:
    case TnefPropertyType.String8:
    case TnefPropertyType.Unicode:
    case TnefPropertyType.SysTime:
    case TnefPropertyType.ClassId:
    case TnefPropertyType.Binary:
      return true;
    case TnefPropertyType.Boolean:
    case TnefPropertyType.Object:
      return !this.isMultiValued;
    default:
      return false;
    }
  }

  /**
   * Convert the property tag to a 32-bit integer value.
   *
   * @returns the encoded property tag.
   */
  toInt32(): number {
    return (((this.tnefType as number) & 0xffff) << 16) | ((this.id as number) & 0xffff);
  }

  /**
   * Serves as a hash function for this TNEF property tag.
   *
   * @returns a hash code suitable for hashing algorithms and data structures.
   */
  hashCode(): number {
    return this.toInt32();
  }

  /**
   * Determines whether another value is equal to this TNEF property tag.
   *
   * @param other the value to compare with this property tag.
   * @returns `true` if the values are equal; otherwise, `false`.
   */
  equals(other: unknown): boolean {
    return other instanceof TnefPropertyTag && other.id === this.id && other.tnefType === this.tnefType;
  }

  /**
   * Convert the property tag to a string representation.
   *
   * @returns a string representation of the property tag.
   */
  toString(): string {
    return `${tnefPropertyIdName(this.id)} (${propertyTypeName(this.valueTnefType)})`;
  }

  /**
   * Convert a String8 property tag to its Unicode equivalent.
   *
   * @returns the Unicode equivalent for String8 tags; otherwise, this tag.
   */
  toUnicode(): TnefPropertyTag {
    if (this.valueTnefType !== TnefPropertyType.String8)
      return this;
    const type = this.isMultiValued ? TnefPropertyType.Unicode | TnefPropertyType.MultiValued : TnefPropertyType.Unicode;
    return new TnefPropertyTag(this.id, type as TnefPropertyTypeValue);
  }
}

/** The MAPI property PR_AB_DEFAULT_DIR. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AbDefaultDir = new TnefPropertyTag(TnefPropertyId.AbDefaultDir, TnefPropertyType.Binary, false);
/**
 * The MAPI property PR_AB_DEFAULT_PAB.
 * The MAPI property PR_AB_DEFAULT_PAD.
 */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AbDefaultPab = new TnefPropertyTag(TnefPropertyId.AbDefaultPab, TnefPropertyType.Binary, false);
/** The MAPI property PR_AB_PROVIDER_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AbProviderId = new TnefPropertyTag(TnefPropertyId.AbProviderId, TnefPropertyType.Binary, false);
/** The MAPI property PR_AB_PROVIDERS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AbProviders = new TnefPropertyTag(TnefPropertyId.AbProviders, TnefPropertyType.Binary, false);
/** The MAPI property PR_AB_SEARCH_PATH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AbSearchPath = new TnefPropertyTag(TnefPropertyId.AbSearchPath, TnefPropertyType.Binary, true);
/** The MAPI property PR_AB_SEARCH_PATH_UPDATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AbSearchPathUpdate = new TnefPropertyTag(TnefPropertyId.AbSearchPathUpdate, TnefPropertyType.Binary, false);
/** The MAPI property PR_ACCESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Access = new TnefPropertyTag(TnefPropertyId.Access, TnefPropertyType.Long, false);
/** The MAPI property PR_ACCESS_LEVEL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AccessLevel = new TnefPropertyTag(TnefPropertyId.AccessLevel, TnefPropertyType.Long, false);
/** The MAPI property PR_ACCOUNT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AccountA = new TnefPropertyTag(TnefPropertyId.Account, TnefPropertyType.String8, false);
/** The MAPI property PR_ACCOUNT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AccountW = new TnefPropertyTag(TnefPropertyId.Account, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ACKNOWLEDGEMENT_MODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AcknowledgementMode = new TnefPropertyTag(TnefPropertyId.AcknowledgementMode, TnefPropertyType.Long, false);
/** The MAPI property PR_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AddrtypeA = new TnefPropertyTag(TnefPropertyId.Addrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AddrtypeW = new TnefPropertyTag(TnefPropertyId.Addrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ALTERNATE_RECIPIENT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AlternateRecipient = new TnefPropertyTag(TnefPropertyId.AlternateRecipient, TnefPropertyType.Binary, false);
/** The MAPI property PR_ALTERNATE_RECIPIENT_ALLOWED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AlternateRecipientAllowed = new TnefPropertyTag(TnefPropertyId.AlternateRecipientAllowed, TnefPropertyType.Boolean, false);
/** The MAPI property PR_ANR. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AnrA = new TnefPropertyTag(TnefPropertyId.Anr, TnefPropertyType.String8, false);
/** The MAPI property PR_ANR. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AnrW = new TnefPropertyTag(TnefPropertyId.Anr, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ASSISTANT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AssistantA = new TnefPropertyTag(TnefPropertyId.Assistant, TnefPropertyType.String8, false);
/** The MAPI property PR_ASSISTANT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AssistantW = new TnefPropertyTag(TnefPropertyId.Assistant, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ASSISTANT_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AssistantTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.AssistantTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_ASSISTANT_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AssistantTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.AssistantTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ASSOC_CONTENT_COUNT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AssocContentCount = new TnefPropertyTag(TnefPropertyId.AssocContentCount, TnefPropertyType.Long, false);
/** The MAPI property PR_ATTACH_ADDITIONAL_INFO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachAdditionalInfo = new TnefPropertyTag(TnefPropertyId.AttachAdditionalInfo, TnefPropertyType.Binary, false);
/** The MAPI property PR_ATTACH_CONTENT_BASE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachContentBaseA = new TnefPropertyTag(TnefPropertyId.AttachContentBase, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_CONTENT_BASE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachContentBaseW = new TnefPropertyTag(TnefPropertyId.AttachContentBase, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_CONTENT_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachContentIdA = new TnefPropertyTag(TnefPropertyId.AttachContentId, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_CONTENT_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachContentIdW = new TnefPropertyTag(TnefPropertyId.AttachContentId, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_CONTENT_LOCATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachContentLocationA = new TnefPropertyTag(TnefPropertyId.AttachContentLocation, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_CONTENT_LOCATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachContentLocationW = new TnefPropertyTag(TnefPropertyId.AttachContentLocation, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_DATA. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachDataBin = new TnefPropertyTag(TnefPropertyId.AttachData, TnefPropertyType.Binary, false);
/** The MAPI property PR_ATTACH_DATA. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachDataObj = new TnefPropertyTag(TnefPropertyId.AttachData, TnefPropertyType.Object, false);
/** The MAPI property PR_ATTACH_DISPOSITION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachDispositionA = new TnefPropertyTag(TnefPropertyId.AttachDisposition, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_DISPOSITION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachDispositionW = new TnefPropertyTag(TnefPropertyId.AttachDisposition, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_ENCODING. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachEncoding = new TnefPropertyTag(TnefPropertyId.AttachEncoding, TnefPropertyType.Binary, false);
/** The MAPI property PR_ATTACH_EXTENSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachExtensionA = new TnefPropertyTag(TnefPropertyId.AttachExtension, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_EXTENSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachExtensionW = new TnefPropertyTag(TnefPropertyId.AttachExtension, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_FILENAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachFilenameA = new TnefPropertyTag(TnefPropertyId.AttachFilename, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_FILENAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachFilenameW = new TnefPropertyTag(TnefPropertyId.AttachFilename, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_FLAGS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachFlags = new TnefPropertyTag(TnefPropertyId.AttachFlags, TnefPropertyType.Long, false);
/** The MAPI property PR_ATTACH_LONG_FILENAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachLongFilenameA = new TnefPropertyTag(TnefPropertyId.AttachLongFilename, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_LONG_FILENAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachLongFilenameW = new TnefPropertyTag(TnefPropertyId.AttachLongFilename, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_LONG_PATHNAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachLongPathnameA = new TnefPropertyTag(TnefPropertyId.AttachLongPathname, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_LONG_PATHNAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachLongPathnameW = new TnefPropertyTag(TnefPropertyId.AttachLongPathname, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACHMENT_CONTACTPHOTO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachmentContactPhoto = new TnefPropertyTag(TnefPropertyId.AttachmentContactPhoto, TnefPropertyType.Boolean, false);
/** The MAPI property PR_ATTACHMENT_FLAGS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachmentFlags = new TnefPropertyTag(TnefPropertyId.AttachmentFlags, TnefPropertyType.Long, false);
/** The MAPI property PR_ATTACHMENT_HIDDEN. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachmentHidden = new TnefPropertyTag(TnefPropertyId.AttachmentHidden, TnefPropertyType.Boolean, false);
/** The MAPI property PR_ATTACHMENT_LINKID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachmentLinkId = new TnefPropertyTag(TnefPropertyId.AttachmentLinkId, TnefPropertyType.Long, false);
/** The MAPI property PR_ATTACHMENT_X400_PARAMETERS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachmentX400Parameters = new TnefPropertyTag(TnefPropertyId.AttachmentX400Parameters, TnefPropertyType.Binary, false);
/** The MAPI property PR_ATTACH_METHOD. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachMethod = new TnefPropertyTag(TnefPropertyId.AttachMethod, TnefPropertyType.Long, false);
/** The MAPI property PR_ATTACH_MIME_SEQUENCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachMimeSequence = new TnefPropertyTag(TnefPropertyId.AttachMimeSequence, TnefPropertyType.Long, false);
/** The MAPI property PR_ATTACH_MIME_TAG. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachMimeTagA = new TnefPropertyTag(TnefPropertyId.AttachMimeTag, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_MIME_TAG. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachMimeTagW = new TnefPropertyTag(TnefPropertyId.AttachMimeTag, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_NETSCAPE_MAC_INFO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachNetscapeMacInfo = new TnefPropertyTag(TnefPropertyId.AttachNetscapeMacInfo, TnefPropertyType.Binary, false);
/** The MAPI property PR_ATTACH_NUM. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachNum = new TnefPropertyTag(TnefPropertyId.AttachNum, TnefPropertyType.Long, false);
/** The MAPI property PR_ATTACH_PATHNAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachPathnameA = new TnefPropertyTag(TnefPropertyId.AttachPathname, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_PATHNAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachPathnameW = new TnefPropertyTag(TnefPropertyId.AttachPathname, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ATTACH_RENDERING. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachRendering = new TnefPropertyTag(TnefPropertyId.AttachRendering, TnefPropertyType.Binary, false);
/** The MAPI property PR_ATTACH_SIZE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachSize = new TnefPropertyTag(TnefPropertyId.AttachSize, TnefPropertyType.Long, false);
/** The MAPI property PR_ATTACH_TAG. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachTag = new TnefPropertyTag(TnefPropertyId.AttachTag, TnefPropertyType.Binary, false);
/** The MAPI property PR_ATTACH_TRANSPORT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachTransportNameA = new TnefPropertyTag(TnefPropertyId.AttachTransportName, TnefPropertyType.String8, false);
/** The MAPI property PR_ATTACH_TRANSPORT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AttachTransportNameW = new TnefPropertyTag(TnefPropertyId.AttachTransportName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_AUTHORIZING_USERS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AuthorizingUsers = new TnefPropertyTag(TnefPropertyId.AuthorizingUsers, TnefPropertyType.Binary, false);
/** The MAPI property PR_AUTOFORWARDED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AutoForwarded = new TnefPropertyTag(TnefPropertyId.AutoForwarded, TnefPropertyType.Boolean, false);
/** The MAPI property PR_AUTOFORWARDING_COMMENT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AutoForwardingCommentA = new TnefPropertyTag(TnefPropertyId.AutoForwardingComment, TnefPropertyType.String8, false);
/** The MAPI property PR_AUTOFORWARDING_COMMENT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AutoForwardingCommentW = new TnefPropertyTag(TnefPropertyId.AutoForwardingComment, TnefPropertyType.Unicode, false);
/** The MAPI property PR_AUTORESPONSE_SUPPRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).AutoResponseSuppress = new TnefPropertyTag(TnefPropertyId.AutoResponseSuppress, TnefPropertyType.Long, false);
/** The MAPI property PR_BEEPER_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BeeperTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.BeeperTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_BEEPER_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BeeperTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.BeeperTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BIRTHDAY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Birthday = new TnefPropertyTag(TnefPropertyId.Birthday, TnefPropertyType.SysTime, false);
/** The MAPI property PR_BODY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyA = new TnefPropertyTag(TnefPropertyId.Body, TnefPropertyType.String8, false);
/** The MAPI property PR_BODY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyW = new TnefPropertyTag(TnefPropertyId.Body, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BODY_CONTENT_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyContentIdA = new TnefPropertyTag(TnefPropertyId.BodyContentId, TnefPropertyType.String8, false);
/** The MAPI property PR_BODY_CONTENT_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyContentIdW = new TnefPropertyTag(TnefPropertyId.BodyContentId, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BODY_CONTENT_LOCATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyContentLocationA = new TnefPropertyTag(TnefPropertyId.BodyContentLocation, TnefPropertyType.String8, false);
/** The MAPI property PR_BODY_CONTENT_LOCATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyContentLocationW = new TnefPropertyTag(TnefPropertyId.BodyContentLocation, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BODY_CRC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyCrc = new TnefPropertyTag(TnefPropertyId.BodyCrc, TnefPropertyType.Long, false);
/** The MAPI property PR_BODY_HTML. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyHtmlA = new TnefPropertyTag(TnefPropertyId.BodyHtml, TnefPropertyType.String8, false);
/** The MAPI property PR_BODY_HTML. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyHtmlB = new TnefPropertyTag(TnefPropertyId.BodyHtml, TnefPropertyType.Binary, false);
/** The MAPI property PR_BODY_HTML. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BodyHtmlW = new TnefPropertyTag(TnefPropertyId.BodyHtml, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BUSINESS2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Business2TelephoneNumberA = new TnefPropertyTag(TnefPropertyId.Business2TelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_BUSINESS2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Business2TelephoneNumberAMv = new TnefPropertyTag(TnefPropertyId.Business2TelephoneNumber, TnefPropertyType.String8, true);
/** The MAPI property PR_BUSINESS2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Business2TelephoneNumberW = new TnefPropertyTag(TnefPropertyId.Business2TelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BUSINESS2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Business2TelephoneNumberWMv = new TnefPropertyTag(TnefPropertyId.Business2TelephoneNumber, TnefPropertyType.Unicode, true);
/** The MAPI property PR_BUSINESS_ADDRESS_CITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessAddressCityA = new TnefPropertyTag(TnefPropertyId.BusinessAddressCity, TnefPropertyType.String8, false);
/** The MAPI property PR_BUSINESS_ADDRESS_CITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessAddressCityW = new TnefPropertyTag(TnefPropertyId.BusinessAddressCity, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BUSINESS_ADDRESS_COUNTRY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessAddressCountryA = new TnefPropertyTag(TnefPropertyId.BusinessAddressCountry, TnefPropertyType.String8, false);
/** The MAPI property PR_BUSINESS_ADDRESS_COUNTRY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessAddressCountryW = new TnefPropertyTag(TnefPropertyId.BusinessAddressCountry, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BUSINESS_ADDRESS_POSTAL_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessAddressPostalCodeA = new TnefPropertyTag(TnefPropertyId.BusinessAddressPostalCode, TnefPropertyType.String8, false);
/** The MAPI property PR_BUSINESS_ADDRESS_POSTAL_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessAddressPostalCodeW = new TnefPropertyTag(TnefPropertyId.BusinessAddressPostalCode, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BUSINESS_ADDRESS_POSTAL_STREET. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessAddressStreetA = new TnefPropertyTag(TnefPropertyId.BusinessAddressStreet, TnefPropertyType.String8, false);
/** The MAPI property PR_BUSINESS_ADDRESS_POSTAL_STREET. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessAddressStreetW = new TnefPropertyTag(TnefPropertyId.BusinessAddressStreet, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BUSINESS_FAX_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessFaxNumberA = new TnefPropertyTag(TnefPropertyId.BusinessFaxNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_BUSINESS_FAX_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessFaxNumberW = new TnefPropertyTag(TnefPropertyId.BusinessFaxNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_BUSINESS_HOME_PAGE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessHomePageA = new TnefPropertyTag(TnefPropertyId.BusinessHomePage, TnefPropertyType.String8, false);
/** The MAPI property PR_BUSINESS_HOME_PAGE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).BusinessHomePageW = new TnefPropertyTag(TnefPropertyId.BusinessHomePage, TnefPropertyType.Unicode, false);
/** The MAPI property PR_CALLBACK_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CallbackTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.CallbackTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_CALLBACK_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CallbackTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.CallbackTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_CAR_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CarTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.CarTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_CAR_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CarTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.CarTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_CHILDRENS_NAMES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ChildrensNamesA = new TnefPropertyTag(TnefPropertyId.ChildrensNames, TnefPropertyType.String8, true);
/** The MAPI property PR_CHILDRENS_NAMES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ChildrensNamesW = new TnefPropertyTag(TnefPropertyId.ChildrensNames, TnefPropertyType.Unicode, true);
/** The MAPI property PR_CLIENT_SUBMIT_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ClientSubmitTime = new TnefPropertyTag(TnefPropertyId.ClientSubmitTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_COMMENT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CommentA = new TnefPropertyTag(TnefPropertyId.Comment, TnefPropertyType.String8, false);
/** The MAPI property PR_COMMENT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CommentW = new TnefPropertyTag(TnefPropertyId.Comment, TnefPropertyType.Unicode, false);
/** The MAPI property PR_COMMON_VIEWS_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CommonViewsEntryId = new TnefPropertyTag(TnefPropertyId.CommonViewsEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_COMPANY_MAIN_PHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CompanyMainPhoneNumberA = new TnefPropertyTag(TnefPropertyId.CompanyMainPhoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_COMPANY_MAIN_PHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CompanyMainPhoneNumberW = new TnefPropertyTag(TnefPropertyId.CompanyMainPhoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_COMPANY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CompanyNameA = new TnefPropertyTag(TnefPropertyId.CompanyName, TnefPropertyType.String8, false);
/** The MAPI property PR_COMPANY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CompanyNameW = new TnefPropertyTag(TnefPropertyId.CompanyName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_COMPUTER_NETWORK_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ComputerNetworkNameA = new TnefPropertyTag(TnefPropertyId.ComputerNetworkName, TnefPropertyType.String8, false);
/** The MAPI property PR_COMPUTER_NETWORK_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ComputerNetworkNameW = new TnefPropertyTag(TnefPropertyId.ComputerNetworkName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_CONTACT_ADDRTYPES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContactAddrtypesA = new TnefPropertyTag(TnefPropertyId.ContactAddrtypes, TnefPropertyType.String8, true);
/** The MAPI property PR_CONTACT_ADDRTYPES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContactAddrtypesW = new TnefPropertyTag(TnefPropertyId.ContactAddrtypes, TnefPropertyType.Unicode, true);
/** The MAPI property PR_CONTACT_DEFAULT_ADDRESS_INDEX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContactDefaultAddressIndex = new TnefPropertyTag(TnefPropertyId.ContactDefaultAddressIndex, TnefPropertyType.Long, false);
/** The MAPI property PR_CONTACT_EMAIL_ADDRESSES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContactEmailAddressesA = new TnefPropertyTag(TnefPropertyId.ContactEmailAddresses, TnefPropertyType.String8, true);
/** The MAPI property PR_CONTACT_EMAIL_ADDRESSES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContactEmailAddressesW = new TnefPropertyTag(TnefPropertyId.ContactEmailAddresses, TnefPropertyType.Unicode, true);
/** The MAPI property PR_CONTACT_ENTRYIDS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContactEntryIds = new TnefPropertyTag(TnefPropertyId.ContactEntryIds, TnefPropertyType.Binary, true);
/** The MAPI property PR_CONTACT_VERSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContactVersion = new TnefPropertyTag(TnefPropertyId.ContactVersion, TnefPropertyType.ClassId, false);
/** The MAPI property PR_CONTAINER_CLASS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContainerClassA = new TnefPropertyTag(TnefPropertyId.ContainerClass, TnefPropertyType.String8, false);
/** The MAPI property PR_CONTAINER_CLASS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContainerClassW = new TnefPropertyTag(TnefPropertyId.ContainerClass, TnefPropertyType.Unicode, false);
/** The MAPI property PR_CONTAINER_CONTENTS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContainerContents = new TnefPropertyTag(TnefPropertyId.ContainerContents, TnefPropertyType.Object, false);
/** The MAPI property PR_CONTAINER_FLAGS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContainerFlags = new TnefPropertyTag(TnefPropertyId.ContainerFlags, TnefPropertyType.Long, false);
/** The MAPI property PR_CONTAINER_HIERARCHY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContainerHierarchy = new TnefPropertyTag(TnefPropertyId.ContainerHierarchy, TnefPropertyType.Object, false);
/** The MAPI property PR_CONTAINER_MODIFY_VERSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContainerModifyVersion = new TnefPropertyTag(TnefPropertyId.ContainerModifyVersion, TnefPropertyType.I8, false);
/** The MAPI property PR_CONTENT_CONFIDENTIALITY_ALGORITHM_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentConfidentialityAlgorithmId = new TnefPropertyTag(TnefPropertyId.ContentConfidentialityAlgorithmId, TnefPropertyType.Binary, false);
/** The MAPI property PR_CONTENT_CORRELATOR. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentCorrelator = new TnefPropertyTag(TnefPropertyId.ContentCorrelator, TnefPropertyType.Binary, false);
/** The MAPI property PR_CONTENT_COUNT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentCount = new TnefPropertyTag(TnefPropertyId.ContentCount, TnefPropertyType.Long, false);
/** The MAPI property PR_CONTENT_IDENTIFIER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentIdentifierA = new TnefPropertyTag(TnefPropertyId.ContentIdentifier, TnefPropertyType.String8, false);
/** The MAPI property PR_CONTENT_IDENTIFIER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentIdentifierW = new TnefPropertyTag(TnefPropertyId.ContentIdentifier, TnefPropertyType.Unicode, false);
/** The MAPI property PR_CONTENT_INTEGRITY_CHECK. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentIntegrityCheck = new TnefPropertyTag(TnefPropertyId.ContentIntegrityCheck, TnefPropertyType.Binary, false);
/** The MAPI property PR_CONTENT_LENGTH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentLength = new TnefPropertyTag(TnefPropertyId.ContentLength, TnefPropertyType.Long, false);
/** The MAPI property PR_CONTENT_RETURN_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentReturnRequested = new TnefPropertyTag(TnefPropertyId.ContentReturnRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_CONTENTS_SORT_ORDER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentsSortOrder = new TnefPropertyTag(TnefPropertyId.ContentsSortOrder, TnefPropertyType.Long, true);
/** The MAPI property PR_CONTENT_UNREAD. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ContentUnread = new TnefPropertyTag(TnefPropertyId.ContentUnread, TnefPropertyType.Long, false);
/** The MAPI property PR_CONTROL_FLAGS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ControlFlags = new TnefPropertyTag(TnefPropertyId.ControlFlags, TnefPropertyType.Long, false);
/** The MAPI property PR_CONTROL_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ControlId = new TnefPropertyTag(TnefPropertyId.ControlId, TnefPropertyType.Binary, false);
/** The MAPI property PR_CONTROL_STRUCTURE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ControlStructure = new TnefPropertyTag(TnefPropertyId.ControlStructure, TnefPropertyType.Binary, false);
/** The MAPI property PR_CONTROL_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ControlType = new TnefPropertyTag(TnefPropertyId.ControlType, TnefPropertyType.Long, false);
/** The MAPI property PR_CONVERSATION_INDEX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ConversationIndex = new TnefPropertyTag(TnefPropertyId.ConversationIndex, TnefPropertyType.Binary, false);
/** The MAPI property PR_CONVERSATION_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ConversationKey = new TnefPropertyTag(TnefPropertyId.ConversationKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_CONVERSATION_TOPIC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ConversationTopicA = new TnefPropertyTag(TnefPropertyId.ConversationTopic, TnefPropertyType.String8, false);
/** The MAPI property PR_CONVERSATION_TOPIC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ConversationTopicW = new TnefPropertyTag(TnefPropertyId.ConversationTopic, TnefPropertyType.Unicode, false);
/** The MAPI property PR_CONVERSION_EITS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ConversionEits = new TnefPropertyTag(TnefPropertyId.ConversionEits, TnefPropertyType.Binary, false);
/** The MAPI property PR_CONVERSION_PROHIBITED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ConversionProhibited = new TnefPropertyTag(TnefPropertyId.ConversionProhibited, TnefPropertyType.Boolean, false);
/** The MAPI property PR_CONVERSION_WITH_LOSS_PROHIBITED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ConversionWithLossProhibited = new TnefPropertyTag(TnefPropertyId.ConversionWithLossProhibited, TnefPropertyType.Boolean, false);
/** The MAPI property PR_CONVERTED_EITS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ConvertedEits = new TnefPropertyTag(TnefPropertyId.ConvertedEits, TnefPropertyType.Binary, false);
/** The MAPI property PR_CORRELATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Correlate = new TnefPropertyTag(TnefPropertyId.Correlate, TnefPropertyType.Boolean, false);
/** The MAPI property PR_CORRELATE_MTSID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CorrelateMtsid = new TnefPropertyTag(TnefPropertyId.CorrelateMtsid, TnefPropertyType.Binary, false);
/** The MAPI property PR_COUNTRY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CountryA = new TnefPropertyTag(TnefPropertyId.Country, TnefPropertyType.String8, false);
/** The MAPI property PR_COUNTRY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CountryW = new TnefPropertyTag(TnefPropertyId.Country, TnefPropertyType.Unicode, false);
/** The MAPI property PR_CREATE_TEMPLATES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CreateTemplates = new TnefPropertyTag(TnefPropertyId.CreateTemplates, TnefPropertyType.Object, false);
/** The MAPI property PR_CREATION_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CreationTime = new TnefPropertyTag(TnefPropertyId.CreationTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_CREATION_VERSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CreationVersion = new TnefPropertyTag(TnefPropertyId.CreationVersion, TnefPropertyType.I8, false);
/** The MAPI property PR_CURRENT_VERSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CurrentVersion = new TnefPropertyTag(TnefPropertyId.CurrentVersion, TnefPropertyType.I8, false);
/** The MAPI property PR_CUSTOMER_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CustomerIdA = new TnefPropertyTag(TnefPropertyId.CustomerId, TnefPropertyType.String8, false);
/** The MAPI property PR_CUSTOMER_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).CustomerIdW = new TnefPropertyTag(TnefPropertyId.CustomerId, TnefPropertyType.Unicode, false);
/** The MAPI property PR_DEFAULT_PROFILE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DefaultProfile = new TnefPropertyTag(TnefPropertyId.DefaultProfile, TnefPropertyType.Boolean, false);
/** The MAPI property PR_DEFAULT_STORE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DefaultStore = new TnefPropertyTag(TnefPropertyId.DefaultStore, TnefPropertyType.Boolean, false);
/** The MAPI property PR_DEFAULT_VIEW_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DefaultViewEntryId = new TnefPropertyTag(TnefPropertyId.DefaultViewEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_DEF_CREATE_DL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DefCreateDl = new TnefPropertyTag(TnefPropertyId.DefCreateDl, TnefPropertyType.Binary, false);
/** The MAPI property PR_DEF_CREATE_MAILUSER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DefCreateMailuser = new TnefPropertyTag(TnefPropertyId.DefCreateMailuser, TnefPropertyType.Binary, false);
/** The MAPI property PR_DEFERRED_DELIVERY_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DeferredDeliveryTime = new TnefPropertyTag(TnefPropertyId.DeferredDeliveryTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_DELEGATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Delegation = new TnefPropertyTag(TnefPropertyId.Delegation, TnefPropertyType.Binary, false);
/** The MAPI property PR_DELETE_AFTER_SUBMIT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DeleteAfterSubmit = new TnefPropertyTag(TnefPropertyId.DeleteAfterSubmit, TnefPropertyType.Boolean, false);
/** The MAPI property PR_DELIVER_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DeliverTime = new TnefPropertyTag(TnefPropertyId.DeliverTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_DELIVERY_POINT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DeliveryPoint = new TnefPropertyTag(TnefPropertyId.DeliveryPoint, TnefPropertyType.Long, false);
/** The MAPI property PR_DELTAX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Deltax = new TnefPropertyTag(TnefPropertyId.Deltax, TnefPropertyType.Long, false);
/** The MAPI property PR_DELTAY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Deltay = new TnefPropertyTag(TnefPropertyId.Deltay, TnefPropertyType.Long, false);
/** The MAPI property PR_DEPARTMENT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DepartmentNameA = new TnefPropertyTag(TnefPropertyId.DepartmentName, TnefPropertyType.String8, false);
/** The MAPI property PR_DEPARTMENT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DepartmentNameW = new TnefPropertyTag(TnefPropertyId.DepartmentName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_DEPTH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Depth = new TnefPropertyTag(TnefPropertyId.Depth, TnefPropertyType.Long, false);
/** The MAPI property PR_DETAILS_TABLE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DetailsTable = new TnefPropertyTag(TnefPropertyId.DetailsTable, TnefPropertyType.Object, false);
/** The MAPI property PR_DISCARD_REASON. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DiscardReason = new TnefPropertyTag(TnefPropertyId.DiscardReason, TnefPropertyType.Long, false);
/** The MAPI property PR_DISCLOSE_RECIPIENTS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DiscloseRecipients = new TnefPropertyTag(TnefPropertyId.DiscloseRecipients, TnefPropertyType.Boolean, false);
/** The MAPI property PR_DISCLOSURE_OF_RECIPIENTS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisclosureOfRecipients = new TnefPropertyTag(TnefPropertyId.DisclosureOfRecipients, TnefPropertyType.Boolean, false);
/** The MAPI property PR_DISCRETE_VALUES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DiscreteValues = new TnefPropertyTag(TnefPropertyId.DiscreteValues, TnefPropertyType.Boolean, false);
/** The MAPI property PR_DISC_VAL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DiscVal = new TnefPropertyTag(TnefPropertyId.DiscVal, TnefPropertyType.Boolean, false);
/** The MAPI property PR_DISPLAY_BCC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayBccA = new TnefPropertyTag(TnefPropertyId.DisplayBcc, TnefPropertyType.String8, false);
/** The MAPI property PR_DISPLAY_BCC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayBccW = new TnefPropertyTag(TnefPropertyId.DisplayBcc, TnefPropertyType.Unicode, false);
/** The MAPI property PR_DISPLAY_CC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayCcA = new TnefPropertyTag(TnefPropertyId.DisplayCc, TnefPropertyType.String8, false);
/** The MAPI property PR_DISPLAY_CC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayCcW = new TnefPropertyTag(TnefPropertyId.DisplayCc, TnefPropertyType.Unicode, false);
/** The MAPI property PR_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayNameA = new TnefPropertyTag(TnefPropertyId.DisplayName, TnefPropertyType.String8, false);
/** The MAPI property PR_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayNameW = new TnefPropertyTag(TnefPropertyId.DisplayName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_DISPLAY_NAME_PREFIX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayNamePrefixA = new TnefPropertyTag(TnefPropertyId.DisplayNamePrefix, TnefPropertyType.String8, false);
/** The MAPI property PR_DISPLAY_NAME_PREFIX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayNamePrefixW = new TnefPropertyTag(TnefPropertyId.DisplayNamePrefix, TnefPropertyType.Unicode, false);
/** The MAPI property PR_DISPLAY_TO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayToA = new TnefPropertyTag(TnefPropertyId.DisplayTo, TnefPropertyType.String8, false);
/** The MAPI property PR_DISPLAY_TO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayToW = new TnefPropertyTag(TnefPropertyId.DisplayTo, TnefPropertyType.Unicode, false);
/** The MAPI property PR_DISPLAY_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DisplayType = new TnefPropertyTag(TnefPropertyId.DisplayType, TnefPropertyType.Long, false);
/** The MAPI property PR_DL_EXPANSION_HISTORY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DlExpansionHistory = new TnefPropertyTag(TnefPropertyId.DlExpansionHistory, TnefPropertyType.Binary, false);
/** The MAPI property PR_DL_EXPANSION_PROHIBITED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).DlExpansionProhibited = new TnefPropertyTag(TnefPropertyId.DlExpansionProhibited, TnefPropertyType.Boolean, false);
/** The MAPI property PR_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).EmailAddressA = new TnefPropertyTag(TnefPropertyId.EmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).EmailAddressW = new TnefPropertyTag(TnefPropertyId.EmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_END_DATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).EndDate = new TnefPropertyTag(TnefPropertyId.EndDate, TnefPropertyType.SysTime, false);
/** The MAPI property PR_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).EntryId = new TnefPropertyTag(TnefPropertyId.EntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_EXPAND_BEGIN_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ExpandBeginTime = new TnefPropertyTag(TnefPropertyId.ExpandBeginTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_EXPANDED_BEGIN_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ExpandedBeginTime = new TnefPropertyTag(TnefPropertyId.ExpandedBeginTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_EXPANDED_END_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ExpandedEndTime = new TnefPropertyTag(TnefPropertyId.ExpandedEndTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_EXPAND_END_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ExpandEndTime = new TnefPropertyTag(TnefPropertyId.ExpandEndTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_EXPIRY_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ExpiryTime = new TnefPropertyTag(TnefPropertyId.ExpiryTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_EXPLICIT_CONVERSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ExplicitConversion = new TnefPropertyTag(TnefPropertyId.ExplicitConversion, TnefPropertyType.Long, false);
/** The MAPI property PR_FILTERING_HOOKS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FilteringHooks = new TnefPropertyTag(TnefPropertyId.FilteringHooks, TnefPropertyType.Binary, false);
/** The MAPI property PR_FINDER_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FinderEntryId = new TnefPropertyTag(TnefPropertyId.FinderEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_FOLDER_ASSOCIATED_CONTENTS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FolderAssociatedContents = new TnefPropertyTag(TnefPropertyId.FolderAssociatedContents, TnefPropertyType.Object, false);
/** The MAPI property PR_FOLDER_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FolderType = new TnefPropertyTag(TnefPropertyId.FolderType, TnefPropertyType.Long, false);
/** The MAPI property PR_FORM_CATEGORY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormCategoryA = new TnefPropertyTag(TnefPropertyId.FormCategory, TnefPropertyType.String8, false);
/** The MAPI property PR_FORM_CATEGORY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormCategoryW = new TnefPropertyTag(TnefPropertyId.FormCategory, TnefPropertyType.Unicode, false);
/** The MAPI property PR_FORM_CATEGORY_SUB. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormCategorySubA = new TnefPropertyTag(TnefPropertyId.FormCategorySub, TnefPropertyType.String8, false);
/** The MAPI property PR_FORM_CATEGORY_SUB. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormCategorySubW = new TnefPropertyTag(TnefPropertyId.FormCategorySub, TnefPropertyType.Unicode, false);
/** The MAPI property PR_FORM_CLSID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormClsid = new TnefPropertyTag(TnefPropertyId.FormClsid, TnefPropertyType.ClassId, false);
/** The MAPI property PR_FORM_CONTACT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormContactNameA = new TnefPropertyTag(TnefPropertyId.FormContactName, TnefPropertyType.String8, false);
/** The MAPI property PR_FORM_CONTACT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormContactNameW = new TnefPropertyTag(TnefPropertyId.FormContactName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_FORM_DESIGNER_GUID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormDesignerGuid = new TnefPropertyTag(TnefPropertyId.FormDesignerGuid, TnefPropertyType.ClassId, false);
/** The MAPI property PR_FORM_DESIGNER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormDesignerNameA = new TnefPropertyTag(TnefPropertyId.FormDesignerName, TnefPropertyType.String8, false);
/** The MAPI property PR_FORM_DESIGNER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormDesignerNameW = new TnefPropertyTag(TnefPropertyId.FormDesignerName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_FORM_HIDDEN. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormHidden = new TnefPropertyTag(TnefPropertyId.FormHidden, TnefPropertyType.Boolean, false);
/** The MAPI property PR_FORM_HOST_MAP. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormHostMap = new TnefPropertyTag(TnefPropertyId.FormHostMap, TnefPropertyType.Long, true);
/** The MAPI property PR_FORM_MESSAGE_BEHAVIOR. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormMessageBehavior = new TnefPropertyTag(TnefPropertyId.FormMessageBehavior, TnefPropertyType.Long, false);
/** The MAPI property PR_FORM_VERSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormVersionA = new TnefPropertyTag(TnefPropertyId.FormVersion, TnefPropertyType.String8, false);
/** The MAPI property PR_FORM_VERSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FormVersionW = new TnefPropertyTag(TnefPropertyId.FormVersion, TnefPropertyType.Unicode, false);
/** The MAPI property PR_FTP_SITE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FtpSiteA = new TnefPropertyTag(TnefPropertyId.FtpSite, TnefPropertyType.String8, false);
/** The MAPI property PR_FTP_SITE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).FtpSiteW = new TnefPropertyTag(TnefPropertyId.FtpSite, TnefPropertyType.Unicode, false);
/** The MAPI property PR_GENDER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Gender = new TnefPropertyTag(TnefPropertyId.Gender, TnefPropertyType.I2, false);
/** The MAPI property PR_GENERATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).GenerationA = new TnefPropertyTag(TnefPropertyId.Generation, TnefPropertyType.String8, false);
/** The MAPI property PR_GENERATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).GenerationW = new TnefPropertyTag(TnefPropertyId.Generation, TnefPropertyType.Unicode, false);
/** The MAPI property PR_GIVEN_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).GivenNameA = new TnefPropertyTag(TnefPropertyId.GivenName, TnefPropertyType.String8, false);
/** The MAPI property PR_GIVEN_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).GivenNameW = new TnefPropertyTag(TnefPropertyId.GivenName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_GOVERNMENT_ID_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).GovernmentIdNumberA = new TnefPropertyTag(TnefPropertyId.GovernmentIdNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_GOVERNMENT_ID_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).GovernmentIdNumberW = new TnefPropertyTag(TnefPropertyId.GovernmentIdNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HASATTACH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Hasattach = new TnefPropertyTag(TnefPropertyId.Hasattach, TnefPropertyType.Boolean, false);
/** The MAPI property PR_HEADER_FOLDER_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HeaderFolderEntryId = new TnefPropertyTag(TnefPropertyId.HeaderFolderEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_HOBBIES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HobbiesA = new TnefPropertyTag(TnefPropertyId.Hobbies, TnefPropertyType.String8, false);
/** The MAPI property PR_HOBBIES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HobbiesW = new TnefPropertyTag(TnefPropertyId.Hobbies, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Home2TelephoneNumberA = new TnefPropertyTag(TnefPropertyId.Home2TelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Home2TelephoneNumberAMv = new TnefPropertyTag(TnefPropertyId.Home2TelephoneNumber, TnefPropertyType.String8, true);
/** The MAPI property PR_HOME2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Home2TelephoneNumberW = new TnefPropertyTag(TnefPropertyId.Home2TelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Home2TelephoneNumberWMv = new TnefPropertyTag(TnefPropertyId.Home2TelephoneNumber, TnefPropertyType.Unicode, true);
/** The MAPI property PR_HOME_ADDRESS_CITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressCityA = new TnefPropertyTag(TnefPropertyId.HomeAddressCity, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME_ADDRESS_CITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressCityW = new TnefPropertyTag(TnefPropertyId.HomeAddressCity, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME_ADDRESS_COUNTRY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressCountryA = new TnefPropertyTag(TnefPropertyId.HomeAddressCountry, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME_ADDRESS_COUNTRY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressCountryW = new TnefPropertyTag(TnefPropertyId.HomeAddressCountry, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME_ADDRESS_POSTAL_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressPostalCodeA = new TnefPropertyTag(TnefPropertyId.HomeAddressPostalCode, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME_ADDRESS_POSTAL_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressPostalCodeW = new TnefPropertyTag(TnefPropertyId.HomeAddressPostalCode, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME_ADDRESS_POST_OFFICE_BOX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressPostOfficeBoxA = new TnefPropertyTag(TnefPropertyId.HomeAddressPostOfficeBox, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME_ADDRESS_POST_OFFICE_BOX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressPostOfficeBoxW = new TnefPropertyTag(TnefPropertyId.HomeAddressPostOfficeBox, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME_ADDRESS_STATE_OR_PROVINCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressStateOrProvinceA = new TnefPropertyTag(TnefPropertyId.HomeAddressStateOrProvince, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME_ADDRESS_STATE_OR_PROVINCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressStateOrProvinceW = new TnefPropertyTag(TnefPropertyId.HomeAddressStateOrProvince, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME_ADDRESS_STREET. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressStreetA = new TnefPropertyTag(TnefPropertyId.HomeAddressStreet, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME_ADDRESS_STREET. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeAddressStreetW = new TnefPropertyTag(TnefPropertyId.HomeAddressStreet, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME_FAX_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeFaxNumberA = new TnefPropertyTag(TnefPropertyId.HomeFaxNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME_FAX_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeFaxNumberW = new TnefPropertyTag(TnefPropertyId.HomeFaxNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_HOME_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.HomeTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_HOME_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).HomeTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.HomeTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ICON. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Icon = new TnefPropertyTag(TnefPropertyId.Icon, TnefPropertyType.Binary, false);
/** The MAPI property PR_IDENTITY_DISPLAY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IdentityDisplayA = new TnefPropertyTag(TnefPropertyId.IdentityDisplay, TnefPropertyType.String8, false);
/** The MAPI property PR_IDENTITY_DISPLAY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IdentityDisplayW = new TnefPropertyTag(TnefPropertyId.IdentityDisplay, TnefPropertyType.Unicode, false);
/** The MAPI property PR_IDENTITY_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IdentityEntryId = new TnefPropertyTag(TnefPropertyId.IdentityEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_IDENTITY_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IdentitySearchKey = new TnefPropertyTag(TnefPropertyId.IdentitySearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_IMPLICIT_CONVERSION_PROHIBITED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ImplicitConversionProhibited = new TnefPropertyTag(TnefPropertyId.ImplicitConversionProhibited, TnefPropertyType.Boolean, false);
/** The MAPI property PR_IMPORTANCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Importance = new TnefPropertyTag(TnefPropertyId.Importance, TnefPropertyType.Long, false);
/** The MAPI property PR_INCOMPLETE_COPY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IncompleteCopy = new TnefPropertyTag(TnefPropertyId.IncompleteCopy, TnefPropertyType.Boolean, false);
/** The Internet mail override charset. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).INetMailOverrideCharset = new TnefPropertyTag(TnefPropertyId.INetMailOverrideCharset, TnefPropertyType.Unicode, false);
/** The Internet mail override format. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).INetMailOverrideFormat = new TnefPropertyTag(TnefPropertyId.INetMailOverrideFormat, TnefPropertyType.Long, false);
/** The MAPI property PR_INITIAL_DETAILS_PANE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InitialDetailsPane = new TnefPropertyTag(TnefPropertyId.InitialDetailsPane, TnefPropertyType.Long, false);
/** The MAPI property PR_INITIALS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InitialsA = new TnefPropertyTag(TnefPropertyId.Initials, TnefPropertyType.String8, false);
/** The MAPI property PR_INITIALS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InitialsW = new TnefPropertyTag(TnefPropertyId.Initials, TnefPropertyType.Unicode, false);
/** The MAPI property PR_IN_REPLY_TO_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InReplyToIdA = new TnefPropertyTag(TnefPropertyId.InReplyToId, TnefPropertyType.String8, false);
/** The MAPI property PR_IN_REPLY_TO_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InReplyToIdW = new TnefPropertyTag(TnefPropertyId.InReplyToId, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INSTANCE_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InstanceKey = new TnefPropertyTag(TnefPropertyId.InstanceKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_INTERNET_APPROVED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetApprovedA = new TnefPropertyTag(TnefPropertyId.InternetApproved, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_APPROVED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetApprovedW = new TnefPropertyTag(TnefPropertyId.InternetApproved, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_ARTICLE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetArticleNumber = new TnefPropertyTag(TnefPropertyId.InternetArticleNumber, TnefPropertyType.Long, false);
/** The MAPI property PR_INTERNET_CONTROL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetControlA = new TnefPropertyTag(TnefPropertyId.InternetControl, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_CONTROL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetControlW = new TnefPropertyTag(TnefPropertyId.InternetControl, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_CPID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetCPID = new TnefPropertyTag(TnefPropertyId.InternetCPID, TnefPropertyType.Long, false);
/** The MAPI property PR_INTERNET_DISTRIBUTION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetDistributionA = new TnefPropertyTag(TnefPropertyId.InternetDistribution, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_DISTRIBUTION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetDistributionW = new TnefPropertyTag(TnefPropertyId.InternetDistribution, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_FOLLOWUP_TO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetFollowupToA = new TnefPropertyTag(TnefPropertyId.InternetFollowupTo, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_FOLLOWUP_TO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetFollowupToW = new TnefPropertyTag(TnefPropertyId.InternetFollowupTo, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_LINES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetLines = new TnefPropertyTag(TnefPropertyId.InternetLines, TnefPropertyType.Long, false);
/** The MAPI property PR_INTERNET_MESSAGE_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetMessageIdA = new TnefPropertyTag(TnefPropertyId.InternetMessageId, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_MESSAGE_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetMessageIdW = new TnefPropertyTag(TnefPropertyId.InternetMessageId, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_NEWSGROUPS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetNewsgroupsA = new TnefPropertyTag(TnefPropertyId.InternetNewsgroups, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_NEWSGROUPS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetNewsgroupsW = new TnefPropertyTag(TnefPropertyId.InternetNewsgroups, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_NNTP_PATH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetNntpPathA = new TnefPropertyTag(TnefPropertyId.InternetNntpPath, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_NNTP_PATH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetNntpPathW = new TnefPropertyTag(TnefPropertyId.InternetNntpPath, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_ORGANIZATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetOrganizationA = new TnefPropertyTag(TnefPropertyId.InternetOrganization, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_ORGANIZATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetOrganizationW = new TnefPropertyTag(TnefPropertyId.InternetOrganization, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_PRECEDENCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetPrecedenceA = new TnefPropertyTag(TnefPropertyId.InternetPrecedence, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_PRECEDENCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetPrecedenceW = new TnefPropertyTag(TnefPropertyId.InternetPrecedence, TnefPropertyType.Unicode, false);
/** The MAPI property PR_INTERNET_REFERENCES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetReferencesA = new TnefPropertyTag(TnefPropertyId.InternetReferences, TnefPropertyType.String8, false);
/** The MAPI property PR_INTERNET_REFERENCES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).InternetReferencesW = new TnefPropertyTag(TnefPropertyId.InternetReferences, TnefPropertyType.Unicode, false);
/** The MAPI property PR_IPM_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmId = new TnefPropertyTag(TnefPropertyId.IpmId, TnefPropertyType.Long, false);
/** The MAPI property PR_IPM_OUTBOX_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmOutboxEntryId = new TnefPropertyTag(TnefPropertyId.IpmOutboxEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_IPM_OUTBOX_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmOutboxSearchKey = new TnefPropertyTag(TnefPropertyId.IpmOutboxSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_IPM_RETURN_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmReturnRequested = new TnefPropertyTag(TnefPropertyId.IpmReturnRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_IPM_SENTMAIL_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmSentmailEntryId = new TnefPropertyTag(TnefPropertyId.IpmSentmailEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_IPM_SENTMAIL_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmSentmailSearchKey = new TnefPropertyTag(TnefPropertyId.IpmSentmailSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_IPM_SUBTREE_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmSubtreeEntryId = new TnefPropertyTag(TnefPropertyId.IpmSubtreeEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_IPM_SUBTREE_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmSubtreeSearchKey = new TnefPropertyTag(TnefPropertyId.IpmSubtreeSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_IPM_WASTEBASKET_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmWastebasketEntryId = new TnefPropertyTag(TnefPropertyId.IpmWastebasketEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_IPM_WASTEBASKET_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IpmWastebasketSearchKey = new TnefPropertyTag(TnefPropertyId.IpmWastebasketSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_ISDN_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IsdnNumberA = new TnefPropertyTag(TnefPropertyId.IsdnNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_ISDN_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).IsdnNumberW = new TnefPropertyTag(TnefPropertyId.IsdnNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_KEYWORD. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).KeywordA = new TnefPropertyTag(TnefPropertyId.Keyword, TnefPropertyType.String8, false);
/** The MAPI property PR_KEYWORD. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).KeywordW = new TnefPropertyTag(TnefPropertyId.Keyword, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LANGUAGE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LanguageA = new TnefPropertyTag(TnefPropertyId.Language, TnefPropertyType.String8, false);
/** The MAPI property PR_LANGUAGE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LanguageW = new TnefPropertyTag(TnefPropertyId.Language, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LANGUAGES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LanguagesA = new TnefPropertyTag(TnefPropertyId.Languages, TnefPropertyType.String8, false);
/** The MAPI property PR_LANGUAGES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LanguagesW = new TnefPropertyTag(TnefPropertyId.Languages, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LAST_MODIFICATION_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LastModificationTime = new TnefPropertyTag(TnefPropertyId.LastModificationTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_LAST_MODIFIER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LastModifierNameA = new TnefPropertyTag(TnefPropertyId.LastModifierName, TnefPropertyType.String8, false);
/** The MAPI property PR_LAST_MODIFIER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LastModifierNameW = new TnefPropertyTag(TnefPropertyId.LastModifierName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LATEST_DELIVERY_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LatestDeliveryTime = new TnefPropertyTag(TnefPropertyId.LatestDeliveryTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_LIST_HELP. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ListHelpA = new TnefPropertyTag(TnefPropertyId.ListHelp, TnefPropertyType.String8, false);
/** The MAPI property PR_LIST_HELP. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ListHelpW = new TnefPropertyTag(TnefPropertyId.ListHelp, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LIST_SUBSCRIBE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ListSubscribeA = new TnefPropertyTag(TnefPropertyId.ListSubscribe, TnefPropertyType.String8, false);
/** The MAPI property PR_LIST_SUBSCRIBE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ListSubscribeW = new TnefPropertyTag(TnefPropertyId.ListSubscribe, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LIST_UNSUBSCRIBE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ListUnsubscribeA = new TnefPropertyTag(TnefPropertyId.ListUnsubscribe, TnefPropertyType.String8, false);
/** The MAPI property PR_LIST_UNSUBSCRIBE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ListUnsubscribeW = new TnefPropertyTag(TnefPropertyId.ListUnsubscribe, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LOCALITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LocalityA = new TnefPropertyTag(TnefPropertyId.Locality, TnefPropertyType.String8, false);
/** The MAPI property PR_LOCALITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LocalityW = new TnefPropertyTag(TnefPropertyId.Locality, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LOCATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LocationA = new TnefPropertyTag(TnefPropertyId.Location, TnefPropertyType.String8, false);
/** The MAPI property PR_LOCATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LocationW = new TnefPropertyTag(TnefPropertyId.Location, TnefPropertyType.Unicode, false);
/** The MAPI property PR_LOCK_BRANCH_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockBranchId = new TnefPropertyTag(TnefPropertyId.LockBranchId, TnefPropertyType.I8, false);
/** The MAPI property PR_LOCK_DEPTH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockDepth = new TnefPropertyTag(TnefPropertyId.LockDepth, TnefPropertyType.Long, false);
/** The MAPI property PR_LOCK_ENLISTMENT_CONTEXT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockEnlistmentContext = new TnefPropertyTag(TnefPropertyId.LockEnlistmentContext, TnefPropertyType.Binary, false);
/** The MAPI property PR_LOCK_EXPIRY_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockExpiryTime = new TnefPropertyTag(TnefPropertyId.LockExpiryTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_LOCK_PERSISTENT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockPersistent = new TnefPropertyTag(TnefPropertyId.LockPersistent, TnefPropertyType.Boolean, false);
/** The MAPI property PR_LOCK_RESOURCE_DID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockResourceDid = new TnefPropertyTag(TnefPropertyId.LockResourceDid, TnefPropertyType.I8, false);
/** The MAPI property PR_LOCK_RESOURCE_FID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockResourceFid = new TnefPropertyTag(TnefPropertyId.LockResourceFid, TnefPropertyType.I8, false);
/** The MAPI property PR_LOCK_RESOURCE_MID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockResourceMid = new TnefPropertyTag(TnefPropertyId.LockResourceMid, TnefPropertyType.I8, false);
/** The MAPI property PR_LOCK_SCOPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockScope = new TnefPropertyTag(TnefPropertyId.LockScope, TnefPropertyType.I2, false);
/** The MAPI property PR_LOCK_TIMEOUT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockTimeout = new TnefPropertyTag(TnefPropertyId.LockTimeout, TnefPropertyType.Long, false);
/** The MAPI property PR_LOCK_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).LockType = new TnefPropertyTag(TnefPropertyId.LockType, TnefPropertyType.I2, false);
/** The MAPI property PR_MAIL_PERMISSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MailPermission = new TnefPropertyTag(TnefPropertyId.MailPermission, TnefPropertyType.Boolean, false);
/** The MAPI property PR_MANAGER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ManagerNameA = new TnefPropertyTag(TnefPropertyId.ManagerName, TnefPropertyType.String8, false);
/** The MAPI property PR_MANAGER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ManagerNameW = new TnefPropertyTag(TnefPropertyId.ManagerName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_MAPPING_SIGNATURE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MappingSignature = new TnefPropertyTag(TnefPropertyId.MappingSignature, TnefPropertyType.Binary, false);
/** The MAPI property PR_MDB_PROVIDER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MdbProvider = new TnefPropertyTag(TnefPropertyId.MdbProvider, TnefPropertyType.Binary, false);
/** The MAPI property PR_MESSAGE_ATTACHMENTS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageAttachments = new TnefPropertyTag(TnefPropertyId.MessageAttachments, TnefPropertyType.Object, false);
/** The MAPI property PR_MESSAGE_CC_ME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageCcMe = new TnefPropertyTag(TnefPropertyId.MessageCcMe, TnefPropertyType.Boolean, false);
/** The MAPI property PR_MESSAGE_CLASS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageClassA = new TnefPropertyTag(TnefPropertyId.MessageClass, TnefPropertyType.String8, false);
/** The MAPI property PR_MESSAGE_CLASS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageClassW = new TnefPropertyTag(TnefPropertyId.MessageClass, TnefPropertyType.Unicode, false);
/** The MAPI property PR_MESSAGE_CODEPAGE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageCodepage = new TnefPropertyTag(TnefPropertyId.MessageCodepage, TnefPropertyType.Long, false);
/** The MAPI property PR_MESSAGE_DELIVERY_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageDeliveryId = new TnefPropertyTag(TnefPropertyId.MessageDeliveryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_MESSAGE_DELIVERY_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageDeliveryTime = new TnefPropertyTag(TnefPropertyId.MessageDeliveryTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_MESSAGE_DOWNLOAD_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageDownloadTime = new TnefPropertyTag(TnefPropertyId.MessageDownloadTime, TnefPropertyType.Long, false);
/** The MAPI property PR_MESSAGE_FLAGS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageFlags = new TnefPropertyTag(TnefPropertyId.MessageFlags, TnefPropertyType.Long, false);
/** The MAPI property PR_MESSAGE_RECIPIENTS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageRecipients = new TnefPropertyTag(TnefPropertyId.MessageRecipients, TnefPropertyType.Object, false);
/** The MAPI property PR_MESSAGE_RECIP_ME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageRecipMe = new TnefPropertyTag(TnefPropertyId.MessageRecipMe, TnefPropertyType.Boolean, false);
/** The MAPI property PR_MESSAGE_SECURITY_LABEL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageSecurityLabel = new TnefPropertyTag(TnefPropertyId.MessageSecurityLabel, TnefPropertyType.Binary, false);
/** The MAPI property PR_MESSAGE_SIZE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageSize = new TnefPropertyTag(TnefPropertyId.MessageSize, TnefPropertyType.Long, false);
/** The MAPI property PR_MESSAGE_SUBMISSION_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageSubmissionId = new TnefPropertyTag(TnefPropertyId.MessageSubmissionId, TnefPropertyType.Binary, false);
/** The MAPI property PR_MESSAGE_TOKEN. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageToken = new TnefPropertyTag(TnefPropertyId.MessageToken, TnefPropertyType.Binary, false);
/** The MAPI property PR_MESSAGE_TO_ME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MessageToMe = new TnefPropertyTag(TnefPropertyId.MessageToMe, TnefPropertyType.Boolean, false);
/** The MAPI property PR_MHS_COMMON_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MhsCommonNameA = new TnefPropertyTag(TnefPropertyId.MhsCommonName, TnefPropertyType.String8, false);
/** The MAPI property PR_MHS_COMMON_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MhsCommonNameW = new TnefPropertyTag(TnefPropertyId.MhsCommonName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_MIDDLE_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MiddleNameA = new TnefPropertyTag(TnefPropertyId.MiddleName, TnefPropertyType.String8, false);
/** The MAPI property PR_MIDDLE_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MiddleNameW = new TnefPropertyTag(TnefPropertyId.MiddleName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_MINI_ICON. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MiniIcon = new TnefPropertyTag(TnefPropertyId.MiniIcon, TnefPropertyType.Binary, false);
/** The MAPI property PR_MOBILE_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MobileTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.MobileTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_MOBILE_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MobileTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.MobileTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_MODIFY_VERSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ModifyVersion = new TnefPropertyTag(TnefPropertyId.ModifyVersion, TnefPropertyType.I8, false);
/** The MAPI property PR_MSG_STATUS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).MsgStatus = new TnefPropertyTag(TnefPropertyId.MsgStatus, TnefPropertyType.Long, false);
/** The MAPI property PR_NDR_DIAG_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NdrDiagCode = new TnefPropertyTag(TnefPropertyId.NdrDiagCode, TnefPropertyType.Long, false);
/** The MAPI property PR_NDR_REASON_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NdrReasonCode = new TnefPropertyTag(TnefPropertyId.NdrReasonCode, TnefPropertyType.Long, false);
/** The MAPI property PR_NDR_STATUS_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NdrStatusCode = new TnefPropertyTag(TnefPropertyId.NdrStatusCode, TnefPropertyType.Long, false);
/** The MAPI property PR_NEWSGROUP_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NewsgroupNameA = new TnefPropertyTag(TnefPropertyId.NewsgroupName, TnefPropertyType.String8, false);
/** The MAPI property PR_NEWSGROUP_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NewsgroupNameW = new TnefPropertyTag(TnefPropertyId.NewsgroupName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_NICKNAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NicknameA = new TnefPropertyTag(TnefPropertyId.Nickname, TnefPropertyType.String8, false);
/** The MAPI property PR_NICKNAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NicknameW = new TnefPropertyTag(TnefPropertyId.Nickname, TnefPropertyType.Unicode, false);
/** The MAPI property PR_NNTP_XREF. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NntpXrefA = new TnefPropertyTag(TnefPropertyId.NntpXref, TnefPropertyType.String8, false);
/** The MAPI property PR_NNTP_XREF. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NntpXrefW = new TnefPropertyTag(TnefPropertyId.NntpXref, TnefPropertyType.Unicode, false);
/** The MAPI property PR_NON_RECEIPT_NOTIFICATION_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NonReceiptNotificationRequested = new TnefPropertyTag(TnefPropertyId.NonReceiptNotificationRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_NON_RECEIPT_REASON. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NonReceiptReason = new TnefPropertyTag(TnefPropertyId.NonReceiptReason, TnefPropertyType.Long, false);
/** The MAPI property PR_NORMALIZED_SUBJECT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NormalizedSubjectA = new TnefPropertyTag(TnefPropertyId.NormalizedSubject, TnefPropertyType.String8, false);
/** The MAPI property PR_NORMALIZED_SUBJECT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NormalizedSubjectW = new TnefPropertyTag(TnefPropertyId.NormalizedSubject, TnefPropertyType.Unicode, false);
/** The MAPI property PR_NT_SECURITY_DESCRIPTOR. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).NtSecurityDescriptor = new TnefPropertyTag(TnefPropertyId.NtSecurityDescriptor, TnefPropertyType.Binary, false);
/** The MAPI property PR_NULL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Null = new TnefPropertyTag(TnefPropertyId.Null, TnefPropertyType.Long, false);
/** The MAPI property PR_OBJECT_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ObjectType = new TnefPropertyTag(TnefPropertyId.ObjectType, TnefPropertyType.Long, false);
/** The MAPI property PR_OBSOLETE_IPMS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ObsoletedIpms = new TnefPropertyTag(TnefPropertyId.ObsoletedIpms, TnefPropertyType.Binary, false);
/** The MAPI property PR_OFFICE2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Office2TelephoneNumberA = new TnefPropertyTag(TnefPropertyId.Office2TelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_OFFICE2_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Office2TelephoneNumberW = new TnefPropertyTag(TnefPropertyId.Office2TelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OFFICE_LOCATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OfficeLocationA = new TnefPropertyTag(TnefPropertyId.OfficeLocation, TnefPropertyType.String8, false);
/** The MAPI property PR_OFFICE_LOCATION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OfficeLocationW = new TnefPropertyTag(TnefPropertyId.OfficeLocation, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OFFICE_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OfficeTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.OfficeTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_OFFICE_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OfficeTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.OfficeTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OOF_REPLY_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OofReplyType = new TnefPropertyTag(TnefPropertyId.OofReplyType, TnefPropertyType.Long, false);
/** The MAPI property PR_ORGANIZATIONAL_ID_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OrganizationalIdNumberA = new TnefPropertyTag(TnefPropertyId.OrganizationalIdNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_ORGANIZATIONAL_ID_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OrganizationalIdNumberW = new TnefPropertyTag(TnefPropertyId.OrganizationalIdNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIG_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OrigEntryId = new TnefPropertyTag(TnefPropertyId.OrigEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_AUTHOR_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalAuthorAddrtypeA = new TnefPropertyTag(TnefPropertyId.OriginalAuthorAddrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_AUTHOR_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalAuthorAddrtypeW = new TnefPropertyTag(TnefPropertyId.OriginalAuthorAddrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_AUTHOR_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalAuthorEmailAddressA = new TnefPropertyTag(TnefPropertyId.OriginalAuthorEmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_AUTHOR_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalAuthorEmailAddressW = new TnefPropertyTag(TnefPropertyId.OriginalAuthorEmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_AUTHOR_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalAuthorEntryId = new TnefPropertyTag(TnefPropertyId.OriginalAuthorEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_AUTHOR_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalAuthorNameA = new TnefPropertyTag(TnefPropertyId.OriginalAuthorName, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_AUTHOR_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalAuthorNameW = new TnefPropertyTag(TnefPropertyId.OriginalAuthorName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_AUTHOR_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalAuthorSearchKey = new TnefPropertyTag(TnefPropertyId.OriginalAuthorSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_DELIVERY_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDeliveryTime = new TnefPropertyTag(TnefPropertyId.OriginalDeliveryTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_ORIGINAL_DISPLAY_BCC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDisplayBccA = new TnefPropertyTag(TnefPropertyId.OriginalDisplayBcc, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_DISPLAY_BCC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDisplayBccW = new TnefPropertyTag(TnefPropertyId.OriginalDisplayBcc, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_DISPLAY_CC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDisplayCcA = new TnefPropertyTag(TnefPropertyId.OriginalDisplayCc, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_DISPLAY_CC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDisplayCcW = new TnefPropertyTag(TnefPropertyId.OriginalDisplayCc, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDisplayNameA = new TnefPropertyTag(TnefPropertyId.OriginalDisplayName, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDisplayNameW = new TnefPropertyTag(TnefPropertyId.OriginalDisplayName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_DISPLAY_TO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDisplayToA = new TnefPropertyTag(TnefPropertyId.OriginalDisplayTo, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_DISPLAY_TO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalDisplayToW = new TnefPropertyTag(TnefPropertyId.OriginalDisplayTo, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_EITS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalEits = new TnefPropertyTag(TnefPropertyId.OriginalEits, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalEntryId = new TnefPropertyTag(TnefPropertyId.OriginalEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINALLY_INTENDED_RECIP_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginallyIntendedRecipAddrtypeA = new TnefPropertyTag(TnefPropertyId.OriginallyIntendedRecipAddrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINALLY_INTENDED_RECIP_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginallyIntendedRecipAddrtypeW = new TnefPropertyTag(TnefPropertyId.OriginallyIntendedRecipAddrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINALLY_INTENDED_RECIP_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginallyIntendedRecipEmailAddressA = new TnefPropertyTag(TnefPropertyId.OriginallyIntendedRecipEmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINALLY_INTENDED_RECIP_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginallyIntendedRecipEmailAddressW = new TnefPropertyTag(TnefPropertyId.OriginallyIntendedRecipEmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINALLY_INTENDED_RECIP_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginallyIntendedRecipEntryId = new TnefPropertyTag(TnefPropertyId.OriginallyIntendedRecipEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINALLY_INTENDED_RECIPIENT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginallyIntendedRecipientName = new TnefPropertyTag(TnefPropertyId.OriginallyIntendedRecipientName, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSearchKey = new TnefPropertyTag(TnefPropertyId.OriginalSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_SENDER_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSenderAddrtypeA = new TnefPropertyTag(TnefPropertyId.OriginalSenderAddrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_SENDER_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSenderAddrtypeW = new TnefPropertyTag(TnefPropertyId.OriginalSenderAddrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_SENDER_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSenderEmailAddressA = new TnefPropertyTag(TnefPropertyId.OriginalSenderEmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_SENDER_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSenderEmailAddressW = new TnefPropertyTag(TnefPropertyId.OriginalSenderEmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_SENDER_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSenderEntryId = new TnefPropertyTag(TnefPropertyId.OriginalSenderEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_SENDER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSenderNameA = new TnefPropertyTag(TnefPropertyId.OriginalSenderName, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_SENDER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSenderNameW = new TnefPropertyTag(TnefPropertyId.OriginalSenderName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_SENDER_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSenderSearchKey = new TnefPropertyTag(TnefPropertyId.OriginalSenderSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_SENSITIVITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSensitivity = new TnefPropertyTag(TnefPropertyId.OriginalSensitivity, TnefPropertyType.Long, false);
/** The MAPI property PR_ORIGINAL_SENT_REPRESENTING_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSentRepresentingAddrtypeA = new TnefPropertyTag(TnefPropertyId.OriginalSentRepresentingAddrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_SENT_REPRESENTING_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSentRepresentingAddrtypeW = new TnefPropertyTag(TnefPropertyId.OriginalSentRepresentingAddrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_SENT_REPRESENTING_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSentRepresentingEmailAddressA = new TnefPropertyTag(TnefPropertyId.OriginalSentRepresentingEmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_SENT_REPRESENTING_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSentRepresentingEmailAddressW = new TnefPropertyTag(TnefPropertyId.OriginalSentRepresentingEmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_SENT_REPRESENTING_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSentRepresentingEntryId = new TnefPropertyTag(TnefPropertyId.OriginalSentRepresentingEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_SENT_REPRESENTING_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSentRepresentingNameA = new TnefPropertyTag(TnefPropertyId.OriginalSentRepresentingName, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_SENT_REPRESENTING_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSentRepresentingNameW = new TnefPropertyTag(TnefPropertyId.OriginalSentRepresentingName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_SENT_REPRESENTING_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSentRepresentingSearchKey = new TnefPropertyTag(TnefPropertyId.OriginalSentRepresentingSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINAL_SUBJECT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSubjectA = new TnefPropertyTag(TnefPropertyId.OriginalSubject, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIGINAL_SUBJECT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSubjectW = new TnefPropertyTag(TnefPropertyId.OriginalSubject, TnefPropertyType.Unicode, false);
/** The MAPI property PR_ORIGINAL_SUBMIT_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginalSubmitTime = new TnefPropertyTag(TnefPropertyId.OriginalSubmitTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_ORIGINATING_MTA_CERTIFICATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginatingMtaCertificate = new TnefPropertyTag(TnefPropertyId.OriginatingMtaCertificate, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINATOR_AND_DL_EXPANSION_HISTORY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginatorAndDlExpansionHistory = new TnefPropertyTag(TnefPropertyId.OriginatorAndDlExpansionHistory, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINATOR_CERTIFICATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginatorCertificate = new TnefPropertyTag(TnefPropertyId.OriginatorCertificate, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINATOR_DELIVERY_REPORT_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginatorDeliveryReportRequested = new TnefPropertyTag(TnefPropertyId.OriginatorDeliveryReportRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_ORIGINATOR_NON_DELIVERY_REPORT_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginatorNonDeliveryReportRequested = new TnefPropertyTag(TnefPropertyId.OriginatorNonDeliveryReportRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_ORIGINATOR_REQUESTED_ALTERNATE_RECIPIENT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginatorRequestedAlternateRecipient = new TnefPropertyTag(TnefPropertyId.OriginatorRequestedAlternateRecipient, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGINATOR_RETURN_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginatorReturnAddress = new TnefPropertyTag(TnefPropertyId.OriginatorReturnAddress, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIGIN_CHECK. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OriginCheck = new TnefPropertyTag(TnefPropertyId.OriginCheck, TnefPropertyType.Binary, false);
/** The MAPI property PR_ORIG_MESSAGE_CLASS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OrigMessageClassA = new TnefPropertyTag(TnefPropertyId.OrigMessageClass, TnefPropertyType.String8, false);
/** The MAPI property PR_ORIG_MESSAGE_CLASS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OrigMessageClassW = new TnefPropertyTag(TnefPropertyId.OrigMessageClass, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OTHER_ADDRESS_CITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressCityA = new TnefPropertyTag(TnefPropertyId.OtherAddressCity, TnefPropertyType.String8, false);
/** The MAPI property PR_OTHER_ADDRESS_CITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressCityW = new TnefPropertyTag(TnefPropertyId.OtherAddressCity, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OTHER_ADDRESS_COUNTRY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressCountryA = new TnefPropertyTag(TnefPropertyId.OtherAddressCountry, TnefPropertyType.String8, false);
/** The MAPI property PR_OTHER_ADDRESS_COUNTRY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressCountryW = new TnefPropertyTag(TnefPropertyId.OtherAddressCountry, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OTHER_ADDRESS_POSTAL_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressPostalCodeA = new TnefPropertyTag(TnefPropertyId.OtherAddressPostalCode, TnefPropertyType.String8, false);
/** The MAPI property PR_OTHER_ADDRESS_POSTAL_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressPostalCodeW = new TnefPropertyTag(TnefPropertyId.OtherAddressPostalCode, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OTHER_ADDRESS_POST_OFFICE_BOX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressPostOfficeBoxA = new TnefPropertyTag(TnefPropertyId.OtherAddressPostOfficeBox, TnefPropertyType.String8, false);
/** The MAPI property PR_OTHER_ADDRESS_POST_OFFICE_BOX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressPostOfficeBoxW = new TnefPropertyTag(TnefPropertyId.OtherAddressPostOfficeBox, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OTHER_ADDRESS_STATE_OR_PROVINCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressStateOrProvinceA = new TnefPropertyTag(TnefPropertyId.OtherAddressStateOrProvince, TnefPropertyType.String8, false);
/** The MAPI property PR_OTHER_ADDRESS_STATE_OR_PROVINCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressStateOrProvinceW = new TnefPropertyTag(TnefPropertyId.OtherAddressStateOrProvince, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OTHER_ADDRESS_STREET. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressStreetA = new TnefPropertyTag(TnefPropertyId.OtherAddressStreet, TnefPropertyType.String8, false);
/** The MAPI property PR_OTHER_ADDRESS_STREET. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherAddressStreetW = new TnefPropertyTag(TnefPropertyId.OtherAddressStreet, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OTHER_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.OtherTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_OTHER_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OtherTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.OtherTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_OWNER_APPT_ID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OwnerApptId = new TnefPropertyTag(TnefPropertyId.OwnerApptId, TnefPropertyType.Long, false);
/** The MAPI property PR_OWN_STORE_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).OwnStoreEntryId = new TnefPropertyTag(TnefPropertyId.OwnStoreEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_PAGER_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PagerTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.PagerTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_PAGER_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PagerTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.PagerTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PARENT_DISPLAY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ParentDisplayA = new TnefPropertyTag(TnefPropertyId.ParentDisplay, TnefPropertyType.String8, false);
/** The MAPI property PR_PARENT_DISPLAY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ParentDisplayW = new TnefPropertyTag(TnefPropertyId.ParentDisplay, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PARENT_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ParentEntryId = new TnefPropertyTag(TnefPropertyId.ParentEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_PARENT_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ParentKey = new TnefPropertyTag(TnefPropertyId.ParentKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_PERSONAL_HOME_PAGE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PersonalHomePageA = new TnefPropertyTag(TnefPropertyId.PersonalHomePage, TnefPropertyType.String8, false);
/** The MAPI property PR_PERSONAL_HOME_PAGE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PersonalHomePageW = new TnefPropertyTag(TnefPropertyId.PersonalHomePage, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PHYSICAL_DELIVERY_BUREAU_FAX_DELIVERY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PhysicalDeliveryBureauFaxDelivery = new TnefPropertyTag(TnefPropertyId.PhysicalDeliveryBureauFaxDelivery, TnefPropertyType.Boolean, false);
/** The MAPI property PR_PHYSICAL_DELIVERY_MODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PhysicalDeliveryMode = new TnefPropertyTag(TnefPropertyId.PhysicalDeliveryMode, TnefPropertyType.Long, false);
/** The MAPI property PR_PHYSICAL_DELIVERY_REPORT_REQUEST. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PhysicalDeliveryReportRequest = new TnefPropertyTag(TnefPropertyId.PhysicalDeliveryReportRequest, TnefPropertyType.Long, false);
/** The MAPI property PR_PHYSICAL_FORWARDING_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PhysicalForwardingAddress = new TnefPropertyTag(TnefPropertyId.PhysicalForwardingAddress, TnefPropertyType.Binary, false);
/** The MAPI property PR_PHYSICAL_FORWARDING_ADDRESS_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PhysicalForwardingAddressRequested = new TnefPropertyTag(TnefPropertyId.PhysicalForwardingAddressRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_PHYSICAL_FORWARDING_PROHIBITED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PhysicalForwardingProhibited = new TnefPropertyTag(TnefPropertyId.PhysicalForwardingProhibited, TnefPropertyType.Boolean, false);
/** The MAPI property PR_PHYSICAL_RENDITION_ATTRIBUTES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PhysicalRenditionAttributes = new TnefPropertyTag(TnefPropertyId.PhysicalRenditionAttributes, TnefPropertyType.Binary, false);
/** The MAPI property PR_POSTAL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostalAddressA = new TnefPropertyTag(TnefPropertyId.PostalAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_POSTAL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostalAddressW = new TnefPropertyTag(TnefPropertyId.PostalAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_POSTAL_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostalCodeA = new TnefPropertyTag(TnefPropertyId.PostalCode, TnefPropertyType.String8, false);
/** The MAPI property PR_POSTAL_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostalCodeW = new TnefPropertyTag(TnefPropertyId.PostalCode, TnefPropertyType.Unicode, false);
/** The MAPI property PR_POST_FOLDER_ENTRIES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostFolderEntries = new TnefPropertyTag(TnefPropertyId.PostFolderEntries, TnefPropertyType.Binary, false);
/** The MAPI property PR_POST_FOLDER_NAMES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostFolderNamesA = new TnefPropertyTag(TnefPropertyId.PostFolderNames, TnefPropertyType.String8, false);
/** The MAPI property PR_POST_FOLDER_NAMES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostFolderNamesW = new TnefPropertyTag(TnefPropertyId.PostFolderNames, TnefPropertyType.Unicode, false);
/** The MAPI property PR_POST_OFFICE_BOX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostOfficeBoxA = new TnefPropertyTag(TnefPropertyId.PostOfficeBox, TnefPropertyType.String8, false);
/** The MAPI property PR_POST_OFFICE_BOX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostOfficeBoxW = new TnefPropertyTag(TnefPropertyId.PostOfficeBox, TnefPropertyType.Unicode, false);
/** The MAPI property PR_POST_REPLY_DENIED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostReplyDenied = new TnefPropertyTag(TnefPropertyId.PostReplyDenied, TnefPropertyType.Binary, false);
/** The MAPI property PR_POST_REPLY_FOLDER_ENTRIES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostReplyFolderEntries = new TnefPropertyTag(TnefPropertyId.PostReplyFolderEntries, TnefPropertyType.Binary, false);
/** The MAPI property PR_POST_REPLY_FOLDER_NAMES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostReplyFolderNamesA = new TnefPropertyTag(TnefPropertyId.PostReplyFolderNames, TnefPropertyType.String8, false);
/** The MAPI property PR_POST_REPLY_FOLDER_NAMES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PostReplyFolderNamesW = new TnefPropertyTag(TnefPropertyId.PostReplyFolderNames, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PREFERRED_BY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PreferredByNameA = new TnefPropertyTag(TnefPropertyId.PreferredByName, TnefPropertyType.String8, false);
/** The MAPI property PR_PREFERRED_BY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PreferredByNameW = new TnefPropertyTag(TnefPropertyId.PreferredByName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PREPROCESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Preprocess = new TnefPropertyTag(TnefPropertyId.Preprocess, TnefPropertyType.Boolean, false);
/** The MAPI property PR_PRIMARY_CAPABILITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PrimaryCapability = new TnefPropertyTag(TnefPropertyId.PrimaryCapability, TnefPropertyType.Binary, false);
/** The MAPI property PR_PRIMARY_FAX_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PrimaryFaxNumberA = new TnefPropertyTag(TnefPropertyId.PrimaryFaxNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_PRIMARY_FAX_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PrimaryFaxNumberW = new TnefPropertyTag(TnefPropertyId.PrimaryFaxNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PRIMARY_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PrimaryTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.PrimaryTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_PRIMARY_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PrimaryTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.PrimaryTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PRIORITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Priority = new TnefPropertyTag(TnefPropertyId.Priority, TnefPropertyType.Long, false);
/** The MAPI property PR_PROFESSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProfessionA = new TnefPropertyTag(TnefPropertyId.Profession, TnefPropertyType.String8, false);
/** The MAPI property PR_PROFESSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProfessionW = new TnefPropertyTag(TnefPropertyId.Profession, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PROFILE_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProfileNameA = new TnefPropertyTag(TnefPropertyId.ProfileName, TnefPropertyType.String8, false);
/** The MAPI property PR_PROFILE_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProfileNameW = new TnefPropertyTag(TnefPropertyId.ProfileName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PROOF_OF_DELIVERY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProofOfDelivery = new TnefPropertyTag(TnefPropertyId.ProofOfDelivery, TnefPropertyType.Binary, false);
/** The MAPI property PR_PROOF_OF_DELIVERY_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProofOfDeliveryRequested = new TnefPropertyTag(TnefPropertyId.ProofOfDeliveryRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_PROOF_OF_SUBMISSION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProofOfSubmission = new TnefPropertyTag(TnefPropertyId.ProofOfSubmission, TnefPropertyType.Binary, false);
/** The MAPI property PR_PROOF_OF_SUBMISSION_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProofOfSubmissionRequested = new TnefPropertyTag(TnefPropertyId.ProofOfSubmissionRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_PROVIDER_DISPLAY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProviderDisplayA = new TnefPropertyTag(TnefPropertyId.ProviderDisplay, TnefPropertyType.String8, false);
/** The MAPI property PR_PROVIDER_DISPLAY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProviderDisplayW = new TnefPropertyTag(TnefPropertyId.ProviderDisplay, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PROVIDER_DLL_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProviderDllNameA = new TnefPropertyTag(TnefPropertyId.ProviderDllName, TnefPropertyType.String8, false);
/** The MAPI property PR_PROVIDER_DLL_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProviderDllNameW = new TnefPropertyTag(TnefPropertyId.ProviderDllName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_PROVIDER_ORDINAL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProviderOrdinal = new TnefPropertyTag(TnefPropertyId.ProviderOrdinal, TnefPropertyType.Long, false);
/** The MAPI property PR_PROVIDER_SUBMIT_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProviderSubmitTime = new TnefPropertyTag(TnefPropertyId.ProviderSubmitTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_PROVIDER_UID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ProviderUid = new TnefPropertyTag(TnefPropertyId.ProviderUid, TnefPropertyType.Binary, false);
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Puid = new TnefPropertyTag(TnefPropertyId.Puid, TnefPropertyType.Unspecified, false);
/** The MAPI property PR_PUID_A. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PuidA = new TnefPropertyTag(TnefPropertyId.Puid, TnefPropertyType.String8, false);
/** The MAPI property PR_PUID_W. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).PuidW = new TnefPropertyTag(TnefPropertyId.Puid, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RADIO_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RadioTelephoneNumberA = new TnefPropertyTag(TnefPropertyId.RadioTelephoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_RADIO_TELEPHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RadioTelephoneNumberW = new TnefPropertyTag(TnefPropertyId.RadioTelephoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RCVD_REPRESENTING_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RcvdRepresentingAddrtypeA = new TnefPropertyTag(TnefPropertyId.RcvdRepresentingAddrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_RCVD_REPRESENTING_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RcvdRepresentingAddrtypeW = new TnefPropertyTag(TnefPropertyId.RcvdRepresentingAddrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RCVD_REPRESENTING_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RcvdRepresentingEmailAddressA = new TnefPropertyTag(TnefPropertyId.RcvdRepresentingEmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_RCVD_REPRESENTING_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RcvdRepresentingEmailAddressW = new TnefPropertyTag(TnefPropertyId.RcvdRepresentingEmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RCVD_REPRESENTING_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RcvdRepresentingEntryId = new TnefPropertyTag(TnefPropertyId.RcvdRepresentingEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_RCVD_REPRESENTING_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RcvdRepresentingNameA = new TnefPropertyTag(TnefPropertyId.RcvdRepresentingName, TnefPropertyType.String8, false);
/** The MAPI property PR_RCVD_REPRESENTING_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RcvdRepresentingNameW = new TnefPropertyTag(TnefPropertyId.RcvdRepresentingName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RCVD_REPRESENTING_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RcvdRepresentingSearchKey = new TnefPropertyTag(TnefPropertyId.RcvdRepresentingSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_READ_RECEIPT_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReadReceiptEntryId = new TnefPropertyTag(TnefPropertyId.ReadReceiptEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_READ_RECEIPT_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReadReceiptRequested = new TnefPropertyTag(TnefPropertyId.ReadReceiptRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_READ_RECEIPT_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReadReceiptSearchKey = new TnefPropertyTag(TnefPropertyId.ReadReceiptSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_RECEIPT_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceiptTime = new TnefPropertyTag(TnefPropertyId.ReceiptTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_RECEIVED_BY_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceivedByAddrtypeA = new TnefPropertyTag(TnefPropertyId.ReceivedByAddrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_RECEIVED_BY_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceivedByAddrtypeW = new TnefPropertyTag(TnefPropertyId.ReceivedByAddrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RECEIVED_BY_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceivedByEmailAddressA = new TnefPropertyTag(TnefPropertyId.ReceivedByEmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_RECEIVED_BY_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceivedByEmailAddressW = new TnefPropertyTag(TnefPropertyId.ReceivedByEmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RECEIVED_BY_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceivedByEntryId = new TnefPropertyTag(TnefPropertyId.ReceivedByEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_RECEIVED_BY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceivedByNameA = new TnefPropertyTag(TnefPropertyId.ReceivedByName, TnefPropertyType.String8, false);
/** The MAPI property PR_RECEIVED_BY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceivedByNameW = new TnefPropertyTag(TnefPropertyId.ReceivedByName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RECEIVED_BY_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceivedBySearchKey = new TnefPropertyTag(TnefPropertyId.ReceivedBySearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_RECEIVE_FOLDER_SETTINGS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReceiveFolderSettings = new TnefPropertyTag(TnefPropertyId.ReceiveFolderSettings, TnefPropertyType.Object, false);
/** The MAPI property PR_RECIPIENT_CERTIFICATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RecipientCertificate = new TnefPropertyTag(TnefPropertyId.RecipientCertificate, TnefPropertyType.Binary, false);
/** The MAPI property PR_RECIPIENT_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RecipientDisplayNameA = new TnefPropertyTag(TnefPropertyId.RecipientDisplayName, TnefPropertyType.String8, false);
/** The MAPI property PR_RECIPIENT_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RecipientDisplayNameW = new TnefPropertyTag(TnefPropertyId.RecipientDisplayName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RECIPIENT_NUMBER_FOR_ADVICE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RecipientNumberForAdviceA = new TnefPropertyTag(TnefPropertyId.RecipientNumberForAdvice, TnefPropertyType.String8, false);
/** The MAPI property PR_RECIPIENT_NUMBER_FOR_ADVICE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RecipientNumberForAdviceW = new TnefPropertyTag(TnefPropertyId.RecipientNumberForAdvice, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RECIPIENT_REASSIGNMENT_PROHIBITED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RecipientReassignmentProhibited = new TnefPropertyTag(TnefPropertyId.RecipientReassignmentProhibited, TnefPropertyType.Boolean, false);
/** The MAPI property PR_RECIPIENT_STATUS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RecipientStatus = new TnefPropertyTag(TnefPropertyId.RecipientStatus, TnefPropertyType.Long, false);
/** The MAPI property PR_RECIPIENT_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RecipientType = new TnefPropertyTag(TnefPropertyId.RecipientType, TnefPropertyType.Long, false);
/** The MAPI property PR_REDIRECTION_HISTORY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RedirectionHistory = new TnefPropertyTag(TnefPropertyId.RedirectionHistory, TnefPropertyType.Binary, false);
/** The MAPI property PR_REFERRED_BY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReferredByNameA = new TnefPropertyTag(TnefPropertyId.ReferredByName, TnefPropertyType.String8, false);
/** The MAPI property PR_REFERRED_BY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReferredByNameW = new TnefPropertyTag(TnefPropertyId.ReferredByName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_REGISTERED_MAIL_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RegisteredMailType = new TnefPropertyTag(TnefPropertyId.RegisteredMailType, TnefPropertyType.Long, false);
/** The MAPI property PR_RELATED_IPMS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RelatedIpms = new TnefPropertyTag(TnefPropertyId.RelatedIpms, TnefPropertyType.Binary, false);
/** The MAPI property PR_REMOTE_PROGRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RemoteProgress = new TnefPropertyTag(TnefPropertyId.RemoteProgress, TnefPropertyType.Long, false);
/** The MAPI property PR_REMOTE_PROGRESS_TEXT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RemoteProgressTextA = new TnefPropertyTag(TnefPropertyId.RemoteProgressText, TnefPropertyType.String8, false);
/** The MAPI property PR_REMOTE_PROGRESS_TEXT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RemoteProgressTextW = new TnefPropertyTag(TnefPropertyId.RemoteProgressText, TnefPropertyType.Unicode, false);
/** The MAPI property PR_REMOTE_VALIDATE_OK. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RemoteValidateOk = new TnefPropertyTag(TnefPropertyId.RemoteValidateOk, TnefPropertyType.Boolean, false);
/** The MAPI property PR_RENDERING_POSITION. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RenderingPosition = new TnefPropertyTag(TnefPropertyId.RenderingPosition, TnefPropertyType.Long, false);
/** The MAPI property PR_REPLY_RECIPIENT_ENTRIES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReplyRecipientEntries = new TnefPropertyTag(TnefPropertyId.ReplyRecipientEntries, TnefPropertyType.Binary, false);
/** The MAPI property PR_REPLY_RECIPIENT_NAMES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReplyRecipientNamesA = new TnefPropertyTag(TnefPropertyId.ReplyRecipientNames, TnefPropertyType.String8, false);
/** The MAPI property PR_REPLY_RECIPIENT_NAMES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReplyRecipientNamesW = new TnefPropertyTag(TnefPropertyId.ReplyRecipientNames, TnefPropertyType.Unicode, false);
/** The MAPI property PR_REPLY_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReplyRequested = new TnefPropertyTag(TnefPropertyId.ReplyRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_REPLY_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReplyTime = new TnefPropertyTag(TnefPropertyId.ReplyTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_REPORT_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportEntryId = new TnefPropertyTag(TnefPropertyId.ReportEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_REPORTING_DL_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportingDlName = new TnefPropertyTag(TnefPropertyId.ReportingDlName, TnefPropertyType.Binary, false);
/** The MAPI property PR_REPORTING_MTA_CERTIFICATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportingMtaCertificate = new TnefPropertyTag(TnefPropertyId.ReportingMtaCertificate, TnefPropertyType.Binary, false);
/** The MAPI property PR_REPORT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportNameA = new TnefPropertyTag(TnefPropertyId.ReportName, TnefPropertyType.String8, false);
/** The MAPI property PR_REPORT_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportNameW = new TnefPropertyTag(TnefPropertyId.ReportName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_REPORT_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportSearchKey = new TnefPropertyTag(TnefPropertyId.ReportSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_REPORT_TAG. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportTag = new TnefPropertyTag(TnefPropertyId.ReportTag, TnefPropertyType.Binary, false);
/** The MAPI property PR_REPORT_TEXT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportTextA = new TnefPropertyTag(TnefPropertyId.ReportText, TnefPropertyType.String8, false);
/** The MAPI property PR_REPORT_TEXT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportTextW = new TnefPropertyTag(TnefPropertyId.ReportText, TnefPropertyType.Unicode, false);
/** The MAPI property PR_REPORT_TIME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReportTime = new TnefPropertyTag(TnefPropertyId.ReportTime, TnefPropertyType.SysTime, false);
/** The MAPI property PR_REQUESTED_DELIVERY_METHOD. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RequestedDeliveryMethod = new TnefPropertyTag(TnefPropertyId.RequestedDeliveryMethod, TnefPropertyType.Long, false);
/** The MAPI property PR_RESOURCE_FLAGS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ResourceFlags = new TnefPropertyTag(TnefPropertyId.ResourceFlags, TnefPropertyType.Long, false);
/** The MAPI property PR_RESOURCE_METHODS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ResourceMethods = new TnefPropertyTag(TnefPropertyId.ResourceMethods, TnefPropertyType.Long, false);
/** The MAPI property PR_RESOURCE_PATH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ResourcePathA = new TnefPropertyTag(TnefPropertyId.ResourcePath, TnefPropertyType.String8, false);
/** The MAPI property PR_RESOURCE_PATH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ResourcePathW = new TnefPropertyTag(TnefPropertyId.ResourcePath, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RESOURCE_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ResourceType = new TnefPropertyTag(TnefPropertyId.ResourceType, TnefPropertyType.Long, false);
/** The MAPI property PR_RESPONSE_REQUESTED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ResponseRequested = new TnefPropertyTag(TnefPropertyId.ResponseRequested, TnefPropertyType.Boolean, false);
/** The MAPI property PR_RESPONSIBILITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Responsibility = new TnefPropertyTag(TnefPropertyId.Responsibility, TnefPropertyType.Boolean, false);
/** The MAPI property PR_RETURNED_IPM. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ReturnedIpm = new TnefPropertyTag(TnefPropertyId.ReturnedIpm, TnefPropertyType.Boolean, false);
/** The MAPI property PR_ROWID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Rowid = new TnefPropertyTag(TnefPropertyId.Rowid, TnefPropertyType.Long, false);
/** The MAPI property PR_ROW_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RowType = new TnefPropertyTag(TnefPropertyId.RowType, TnefPropertyType.Long, false);
/** The MAPI property PR_RTF_COMPRESSED. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RtfCompressed = new TnefPropertyTag(TnefPropertyId.RtfCompressed, TnefPropertyType.Binary, false);
/** The MAPI property PR_RTF_IN_SYNC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RtfInSync = new TnefPropertyTag(TnefPropertyId.RtfInSync, TnefPropertyType.Boolean, false);
/** The MAPI property PR_RTF_SYNC_BODY_COUNT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RtfSyncBodyCount = new TnefPropertyTag(TnefPropertyId.RtfSyncBodyCount, TnefPropertyType.Long, false);
/** The MAPI property PR_RTF_SYNC_BODY_CRC. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RtfSyncBodyCrc = new TnefPropertyTag(TnefPropertyId.RtfSyncBodyCrc, TnefPropertyType.Long, false);
/** The MAPI property PR_RTF_SYNC_BODY_TAG. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RtfSyncBodyTagA = new TnefPropertyTag(TnefPropertyId.RtfSyncBodyTag, TnefPropertyType.String8, false);
/** The MAPI property PR_RTF_SYNC_BODY_TAG. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RtfSyncBodyTagW = new TnefPropertyTag(TnefPropertyId.RtfSyncBodyTag, TnefPropertyType.Unicode, false);
/** The MAPI property PR_RTF_SYNC_PREFIX_COUNT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RtfSyncPrefixCount = new TnefPropertyTag(TnefPropertyId.RtfSyncPrefixCount, TnefPropertyType.Long, false);
/** The MAPI property PR_RTF_SYNC_TRAILING_COUNT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).RtfSyncTrailingCount = new TnefPropertyTag(TnefPropertyId.RtfSyncTrailingCount, TnefPropertyType.Long, false);
/** The MAPI property PR_SEARCH. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Search = new TnefPropertyTag(TnefPropertyId.Search, TnefPropertyType.Object, false);
/** The MAPI property PR_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SearchKey = new TnefPropertyTag(TnefPropertyId.SearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_SECURITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Security = new TnefPropertyTag(TnefPropertyId.Security, TnefPropertyType.Long, false);
/** The MAPI property PR_SELECTABLE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Selectable = new TnefPropertyTag(TnefPropertyId.Selectable, TnefPropertyType.Boolean, false);
/** The MAPI property PR_SENDER_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SenderAddrtypeA = new TnefPropertyTag(TnefPropertyId.SenderAddrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_SENDER_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SenderAddrtypeW = new TnefPropertyTag(TnefPropertyId.SenderAddrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SENDER_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SenderEmailAddressA = new TnefPropertyTag(TnefPropertyId.SenderEmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_SENDER_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SenderEmailAddressW = new TnefPropertyTag(TnefPropertyId.SenderEmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SENDER_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SenderEntryId = new TnefPropertyTag(TnefPropertyId.SenderEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_SENDER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SenderNameA = new TnefPropertyTag(TnefPropertyId.SenderName, TnefPropertyType.String8, false);
/** The MAPI property PR_SENDER_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SenderNameW = new TnefPropertyTag(TnefPropertyId.SenderName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SENDER_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SenderSearchKey = new TnefPropertyTag(TnefPropertyId.SenderSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_SEND_INTERNET_ENCODING. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SendInternetEncoding = new TnefPropertyTag(TnefPropertyId.SendInternetEncoding, TnefPropertyType.Long, false);
/**
 * The MAPI property PR_SEND_RECALL_REPORT
 * The MAPI property PR_SEND_RECALL_REPORT.
 */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SendRecallReport = new TnefPropertyTag(TnefPropertyId.SendRecallReport, TnefPropertyType.Boolean, false);
/** The MAPI property PR_SEND_RICH_INFO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SendRichInfo = new TnefPropertyTag(TnefPropertyId.SendRichInfo, TnefPropertyType.Boolean, false);
/** The MAPI property PR_SENSITIVITY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Sensitivity = new TnefPropertyTag(TnefPropertyId.Sensitivity, TnefPropertyType.Long, false);
/** The MAPI property PR_SENTMAIL_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentmailEntryId = new TnefPropertyTag(TnefPropertyId.SentmailEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_SENT_REPRESENTING_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentRepresentingAddrtypeA = new TnefPropertyTag(TnefPropertyId.SentRepresentingAddrtype, TnefPropertyType.String8, false);
/** The MAPI property PR_SENT_REPRESENTING_ADDRTYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentRepresentingAddrtypeW = new TnefPropertyTag(TnefPropertyId.SentRepresentingAddrtype, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SENT_REPRESENTING_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentRepresentingEmailAddressA = new TnefPropertyTag(TnefPropertyId.SentRepresentingEmailAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_SENT_REPRESENTING_EMAIL_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentRepresentingEmailAddressW = new TnefPropertyTag(TnefPropertyId.SentRepresentingEmailAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SENT_REPRESENTING_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentRepresentingEntryId = new TnefPropertyTag(TnefPropertyId.SentRepresentingEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_SENT_REPRESENTING_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentRepresentingNameA = new TnefPropertyTag(TnefPropertyId.SentRepresentingName, TnefPropertyType.String8, false);
/** The MAPI property PR_SENT_REPRESENTING_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentRepresentingNameW = new TnefPropertyTag(TnefPropertyId.SentRepresentingName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SENT_REPRESENTING_SEARCH_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SentRepresentingSearchKey = new TnefPropertyTag(TnefPropertyId.SentRepresentingSearchKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_SERVICE_DELETE_FILES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceDeleteFilesA = new TnefPropertyTag(TnefPropertyId.ServiceDeleteFiles, TnefPropertyType.String8, true);
/** The MAPI property PR_SERVICE_DELETE_FILES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceDeleteFilesW = new TnefPropertyTag(TnefPropertyId.ServiceDeleteFiles, TnefPropertyType.Unicode, true);
/** The MAPI property PR_SERVICE_DLL_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceDllNameA = new TnefPropertyTag(TnefPropertyId.ServiceDllName, TnefPropertyType.String8, false);
/** The MAPI property PR_SERVICE_DLL_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceDllNameW = new TnefPropertyTag(TnefPropertyId.ServiceDllName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SERVICE_ENTRY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceEntryName = new TnefPropertyTag(TnefPropertyId.ServiceEntryName, TnefPropertyType.String8, false);
/** The MAPI property PR_SERVICE_EXTRA_UIDS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceExtraUids = new TnefPropertyTag(TnefPropertyId.ServiceExtraUids, TnefPropertyType.Binary, false);
/** The MAPI property PR_SERVICE_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceNameA = new TnefPropertyTag(TnefPropertyId.ServiceName, TnefPropertyType.String8, false);
/** The MAPI property PR_SERVICE_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceNameW = new TnefPropertyTag(TnefPropertyId.ServiceName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SERVICES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Services = new TnefPropertyTag(TnefPropertyId.Services, TnefPropertyType.Binary, false);
/** The MAPI property PR_SERVICE_SUPPORT_FILES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceSupportFilesA = new TnefPropertyTag(TnefPropertyId.ServiceSupportFiles, TnefPropertyType.String8, true);
/** The MAPI property PR_SERVICE_SUPPORT_FILES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceSupportFilesW = new TnefPropertyTag(TnefPropertyId.ServiceSupportFiles, TnefPropertyType.Unicode, true);
/** The MAPI property PR_SERVICE_UID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ServiceUid = new TnefPropertyTag(TnefPropertyId.ServiceUid, TnefPropertyType.Binary, false);
/** The MAPI property PR_SEVEN_BIT_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SevenBitDisplayName = new TnefPropertyTag(TnefPropertyId.SevenBitDisplayName, TnefPropertyType.String8, false);
/** The MAPI property PR_SMTP_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SmtpAddressA = new TnefPropertyTag(TnefPropertyId.SmtpAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_SMTP_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SmtpAddressW = new TnefPropertyTag(TnefPropertyId.SmtpAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SPOOLER_STATUS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SpoolerStatus = new TnefPropertyTag(TnefPropertyId.SpoolerStatus, TnefPropertyType.Long, false);
/** The MAPI property PR_SPOUSE_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SpouseNameA = new TnefPropertyTag(TnefPropertyId.SpouseName, TnefPropertyType.String8, false);
/** The MAPI property PR_SPOUSE_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SpouseNameW = new TnefPropertyTag(TnefPropertyId.SpouseName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_START_DATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StartDate = new TnefPropertyTag(TnefPropertyId.StartDate, TnefPropertyType.SysTime, false);
/** The MAPI property PR_STATE_OR_PROVINCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StateOrProvinceA = new TnefPropertyTag(TnefPropertyId.StateOrProvince, TnefPropertyType.String8, false);
/** The MAPI property PR_STATE_OR_PROVINCE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StateOrProvinceW = new TnefPropertyTag(TnefPropertyId.StateOrProvince, TnefPropertyType.Unicode, false);
/** The MAPI property PR_STATUS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Status = new TnefPropertyTag(TnefPropertyId.Status, TnefPropertyType.Long, false);
/** The MAPI property PR_STATUS_CODE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StatusCode = new TnefPropertyTag(TnefPropertyId.StatusCode, TnefPropertyType.Long, false);
/** The MAPI property PR_STATUS_STRING. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StatusStringA = new TnefPropertyTag(TnefPropertyId.StatusString, TnefPropertyType.String8, false);
/** The MAPI property PR_STATUS_STRING. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StatusStringW = new TnefPropertyTag(TnefPropertyId.StatusString, TnefPropertyType.Unicode, false);
/** The MAPI property PR_STORE_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StoreEntryId = new TnefPropertyTag(TnefPropertyId.StoreEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_STORE_PROVIDERS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StoreProviders = new TnefPropertyTag(TnefPropertyId.StoreProviders, TnefPropertyType.Binary, false);
/** The MAPI property PR_STORE_RECORD_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StoreRecordKey = new TnefPropertyTag(TnefPropertyId.StoreRecordKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_STORE_STATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StoreState = new TnefPropertyTag(TnefPropertyId.StoreState, TnefPropertyType.Long, false);
/** The MAPI property PR_STORE_SUPPORT_MASK. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StoreSupportMask = new TnefPropertyTag(TnefPropertyId.StoreSupportMask, TnefPropertyType.Long, false);
/** The MAPI property PR_STREET_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StreetAddressA = new TnefPropertyTag(TnefPropertyId.StreetAddress, TnefPropertyType.String8, false);
/** The MAPI property PR_STREET_ADDRESS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).StreetAddressW = new TnefPropertyTag(TnefPropertyId.StreetAddress, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SUBFOLDERS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Subfolders = new TnefPropertyTag(TnefPropertyId.Subfolders, TnefPropertyType.Boolean, false);
/** The MAPI property PR_SUBJECT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SubjectA = new TnefPropertyTag(TnefPropertyId.Subject, TnefPropertyType.String8, false);
/** The MAPI property PR_SUBJECT. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SubjectW = new TnefPropertyTag(TnefPropertyId.Subject, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SUBJECT_IPM. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SubjectIpm = new TnefPropertyTag(TnefPropertyId.SubjectIpm, TnefPropertyType.Binary, false);
/** The MAPI property PR_SUBJECT_PREFIX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SubjectPrefixA = new TnefPropertyTag(TnefPropertyId.SubjectPrefix, TnefPropertyType.String8, false);
/** The MAPI property PR_SUBJECT_PREFIX. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SubjectPrefixW = new TnefPropertyTag(TnefPropertyId.SubjectPrefix, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SUBMIT_FLAGS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SubmitFlags = new TnefPropertyTag(TnefPropertyId.SubmitFlags, TnefPropertyType.Long, false);
/** The MAPI property PR_SUPERSEDES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SupersedesA = new TnefPropertyTag(TnefPropertyId.Supersedes, TnefPropertyType.String8, false);
/** The MAPI property PR_SUPERSEDES. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SupersedesW = new TnefPropertyTag(TnefPropertyId.Supersedes, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SUPPLEMENTARY_INFO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SupplementaryInfoA = new TnefPropertyTag(TnefPropertyId.SupplementaryInfo, TnefPropertyType.String8, false);
/** The MAPI property PR_SUPPLEMENTARY_INFO. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SupplementaryInfoW = new TnefPropertyTag(TnefPropertyId.SupplementaryInfo, TnefPropertyType.Unicode, false);
/** The MAPI property PR_SURNAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SurnameA = new TnefPropertyTag(TnefPropertyId.Surname, TnefPropertyType.String8, false);
/** The MAPI property PR_SURNAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).SurnameW = new TnefPropertyTag(TnefPropertyId.Surname, TnefPropertyType.Unicode, false);
/** The MAPI property PR_TELEX_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TelexNumberA = new TnefPropertyTag(TnefPropertyId.TelexNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_TELEX_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TelexNumberW = new TnefPropertyTag(TnefPropertyId.TelexNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_TEMPLATEID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Templateid = new TnefPropertyTag(TnefPropertyId.Templateid, TnefPropertyType.Binary, false);
/** The MAPI property PR_TITLE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TitleA = new TnefPropertyTag(TnefPropertyId.Title, TnefPropertyType.String8, false);
/** The MAPI property PR_TITLE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TitleW = new TnefPropertyTag(TnefPropertyId.Title, TnefPropertyType.Unicode, false);
/** The MAPI property PR_TNEF_CORRELATION_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TnefCorrelationKey = new TnefPropertyTag(TnefPropertyId.TnefCorrelationKey, TnefPropertyType.Binary, false);
/** The MAPI property PR_TRANSMITABLE_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TransmitableDisplayNameA = new TnefPropertyTag(TnefPropertyId.TransmitableDisplayName, TnefPropertyType.String8, false);
/** The MAPI property PR_TRANSMITABLE_DISPLAY_NAME. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TransmitableDisplayNameW = new TnefPropertyTag(TnefPropertyId.TransmitableDisplayName, TnefPropertyType.Unicode, false);
/** The MAPI property PR_TRANSPORT_KEY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TransportKey = new TnefPropertyTag(TnefPropertyId.TransportKey, TnefPropertyType.Long, false);
/** The MAPI property PR_TRANSPORT_MESSAGE_HEADERS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TransportMessageHeadersA = new TnefPropertyTag(TnefPropertyId.TransportMessageHeaders, TnefPropertyType.String8, false);
/** The MAPI property PR_TRANSPORT_MESSAGE_HEADERS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TransportMessageHeadersW = new TnefPropertyTag(TnefPropertyId.TransportMessageHeaders, TnefPropertyType.Unicode, false);
/** The MAPI property PR_TRANSPORT_PROVIDERS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TransportProviders = new TnefPropertyTag(TnefPropertyId.TransportProviders, TnefPropertyType.Binary, false);
/** The MAPI property PR_TRANSPORT_STATUS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TransportStatus = new TnefPropertyTag(TnefPropertyId.TransportStatus, TnefPropertyType.Long, false);
/** The MAPI property PR_TTYDD_PHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TtytddPhoneNumberA = new TnefPropertyTag(TnefPropertyId.TtytddPhoneNumber, TnefPropertyType.String8, false);
/** The MAPI property PR_TTYDD_PHONE_NUMBER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TtytddPhoneNumberW = new TnefPropertyTag(TnefPropertyId.TtytddPhoneNumber, TnefPropertyType.Unicode, false);
/** The MAPI property PR_TYPE_OF_MTS_USER. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).TypeOfMtsUser = new TnefPropertyTag(TnefPropertyId.TypeOfMtsUser, TnefPropertyType.Long, false);
/** The MAPI property PR_USER_CERTIFICATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).UserCertificate = new TnefPropertyTag(TnefPropertyId.UserCertificate, TnefPropertyType.Binary, false);
/** The MAPI property PR_USER_X509_CERTIFICATE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).UserX509Certificate = new TnefPropertyTag(TnefPropertyId.UserX509Certificate, TnefPropertyType.Binary, true);
/** The MAPI property PR_VALID_FOLDER_MASK. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ValidFolderMask = new TnefPropertyTag(TnefPropertyId.ValidFolderMask, TnefPropertyType.Long, false);
/** The MAPI property PR_VIEWS_ENTRYID. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).ViewsEntryId = new TnefPropertyTag(TnefPropertyId.ViewsEntryId, TnefPropertyType.Binary, false);
/** The MAPI property PR_WEDDING_ANNIVERSARY. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).WeddingAnniversary = new TnefPropertyTag(TnefPropertyId.WeddingAnniversary, TnefPropertyType.SysTime, false);
/** The MAPI property PR_X400_CONTENT_TYPE. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).X400ContentType = new TnefPropertyTag(TnefPropertyId.X400ContentType, TnefPropertyType.Binary, false);
/** The MAPI property PR_X400_DEFERRED_DELIVERY_CANCEL. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).X400DeferredDeliveryCancel = new TnefPropertyTag(TnefPropertyId.X400DeferredDeliveryCancel, TnefPropertyType.Boolean, false);
/** The MAPI property PR_XPOS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Xpos = new TnefPropertyTag(TnefPropertyId.Xpos, TnefPropertyType.Long, false);
/** The MAPI property PR_YPOS. */
(TnefPropertyTag as unknown as Record<string, TnefPropertyTag>).Ypos = new TnefPropertyTag(TnefPropertyId.Ypos, TnefPropertyType.Long, false);

function propertyTypeName(value: number): string {
  for (const [name, v] of Object.entries(TnefPropertyType)) {
    if (v === value) return name;
  }
  return `0x${value.toString(16)}`;
}
