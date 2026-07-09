// Port of MimeKit/Text/HtmlAttributeId.cs (enum + HtmlAttributeIdExtensions).

/** HTML attribute identifiers. */
export enum HtmlAttributeId {
  /** An unknown HTML attribute identifier. */
  Unknown = 'Unknown',
  /** The "abbr" attribute. */
  Abbr = 'Abbr',
  /** The "accept" attribute. */
  Accept = 'Accept',
  /** The "accept-charset" attribute. */
  AcceptCharset = 'AcceptCharset',
  /** The "accesskey" attribute. */
  AccessKey = 'AccessKey',
  /** The "action" attribute. */
  Action = 'Action',
  /** The "align" attribute. */
  Align = 'Align',
  /** The "alink" attribute. */
  Alink = 'Alink',
  /** The "alt" attribute. */
  Alt = 'Alt',
  /** The "archive" attribute. */
  Archive = 'Archive',
  /** The "axis" attribute. */
  Axis = 'Axis',
  /** The "background" attribute. */
  Background = 'Background',
  /** The "bgcolor" attribute. */
  BGColor = 'BGColor',
  /** The "border" attribute. */
  Border = 'Border',
  /** The "cellpadding" attribute. */
  CellPadding = 'CellPadding',
  /** The "cellspacing" attribute. */
  CellSpacing = 'CellSpacing',
  /** The "char" attribute. */
  Char = 'Char',
  /** The "charoff" attribute. */
  CharOff = 'CharOff',
  /** The "charset" attribute. */
  Charset = 'Charset',
  /** The "checked" attribute. */
  Checked = 'Checked',
  /** The "cite" attribute. */
  Cite = 'Cite',
  /** The "class" attribute. */
  Class = 'Class',
  /** The "classid" attribute. */
  ClassId = 'ClassId',
  /** The "clear" attribute. */
  Clear = 'Clear',
  /** The "code" attribute. */
  Code = 'Code',
  /** The "codebase" attribute. */
  CodeBase = 'CodeBase',
  /** The "codetype" attribute. */
  CodeType = 'CodeType',
  /** The "color" attribute. */
  Color = 'Color',
  /** The "cols" attribute. */
  Cols = 'Cols',
  /** The "colspan" attribute. */
  ColSpan = 'ColSpan',
  /** The "compact" attribute. */
  Compact = 'Compact',
  /** The "content" attribute. */
  Content = 'Content',
  /** The "coords" attribute. */
  Coords = 'Coords',
  /** The "data" attribute. */
  Data = 'Data',
  /** The "datetime" attribute. */
  DateTime = 'DateTime',
  /** The "declare" attribute. */
  Declare = 'Declare',
  /** The "defer" attribute. */
  Defer = 'Defer',
  /** The "dir" attribute. */
  Dir = 'Dir',
  /** The "disabled" attribute. */
  Disabled = 'Disabled',
  /** The "dynsrc" attribute. */
  DynSrc = 'DynSrc',
  /** The "enctype" attribute. */
  EncType = 'EncType',
  /** The "face" attribute. */
  Face = 'Face',
  /** The "for" attribute. */
  For = 'For',
  /** The "frame" attribute. */
  Frame = 'Frame',
  /** The "frameborder" attribute. */
  FrameBorder = 'FrameBorder',
  /** The "headers" attribute. */
  Headers = 'Headers',
  /** The "height" attribute. */
  Height = 'Height',
  /** The "href" attribute. */
  Href = 'Href',
  /** The "hreflang" attribute. */
  HrefLang = 'HrefLang',
  /** The "hspace" attribute. */
  Hspace = 'Hspace',
  /** The "http-equiv" attribute. */
  HttpEquiv = 'HttpEquiv',
  /** The "id" attribute. */
  Id = 'Id',
  /** The "ismap" attribute. */
  IsMap = 'IsMap',
  /** The "label" attribute. */
  Label = 'Label',
  /** The "lang" attribute. */
  Lang = 'Lang',
  /** The "language" attribute. */
  Language = 'Language',
  /** The "leftmargin" attribute. */
  LeftMargin = 'LeftMargin',
  /** The "link" attribute. */
  Link = 'Link',
  /** The "longdesc" attribute. */
  LongDesc = 'LongDesc',
  /** The "lowsrc" attribute. */
  LowSrc = 'LowSrc',
  /** The "marginheight" attribute. */
  MarginHeight = 'MarginHeight',
  /** The "marginwidth" attribute. */
  MarginWidth = 'MarginWidth',
  /** The "maxlength" attribute. */
  MaxLength = 'MaxLength',
  /** The "media" attribute. */
  Media = 'Media',
  /** The "method" attribute. */
  Method = 'Method',
  /** The "multiple" attribute. */
  Multiple = 'Multiple',
  /** The "name" attribute. */
  Name = 'Name',
  /** The "nohref" attribute. */
  NoHref = 'NoHref',
  /** The "noresize" attribute. */
  NoResize = 'NoResize',
  /** The "noshade" attribute. */
  NoShade = 'NoShade',
  /** The "nowrap" attribute. */
  NoWrap = 'NoWrap',
  /** The "object" attribute. */
  Object = 'Object',
  /** The "profile" attribute. */
  Profile = 'Profile',
  /** The "prompt" attribute. */
  Prompt = 'Prompt',
  /** The "readonly" attribute. */
  ReadOnly = 'ReadOnly',
  /** The "rel" attribute. */
  Rel = 'Rel',
  /** The "rev" attribute. */
  Rev = 'Rev',
  /** The "rows" attribute. */
  Rows = 'Rows',
  /** The "rowspan" attribute. */
  RowSpan = 'RowSpan',
  /** The "rules" attribute. */
  Rules = 'Rules',
  /** The "scheme" attribute. */
  Scheme = 'Scheme',
  /** The "scope" attribute. */
  Scope = 'Scope',
  /** The "scrolling" attribute. */
  Scrolling = 'Scrolling',
  /** The "selected" attribute. */
  Selected = 'Selected',
  /** The "shape" attribute. */
  Shape = 'Shape',
  /** The "size" attribute. */
  Size = 'Size',
  /** The "span" attribute. */
  Span = 'Span',
  /** The "src" attribute. */
  Src = 'Src',
  /** The "standby" attribute. */
  StandBy = 'StandBy',
  /** The "start" attribute. */
  Start = 'Start',
  /** The "style" attribute. */
  Style = 'Style',
  /** The "summary" attribute. */
  Summary = 'Summary',
  /** The "tabindex" attribute. */
  TabIndex = 'TabIndex',
  /** The "target" attribute. */
  Target = 'Target',
  /** The "text" attribute. */
  Text = 'Text',
  /** The "title" attribute. */
  Title = 'Title',
  /** The "topmargin" attribute. */
  TopMargin = 'TopMargin',
  /** The "type" attribute. */
  Type = 'Type',
  /** The "usemap" attribute. */
  UseMap = 'UseMap',
  /** The "valign" attribute. */
  Valign = 'Valign',
  /** The "value" attribute. */
  Value = 'Value',
  /** The "valuetype" attribute. */
  ValueType = 'ValueType',
  /** The "version" attribute. */
  Version = 'Version',
  /** The "vlink" attribute. */
  Vlink = 'Vlink',
  /** The "vspace" attribute. */
  Vspace = 'Vspace',
  /** The "width" attribute. */
  Width = 'Width',
  /** The "xmlns" attribute. */
  XmlNS = 'XmlNS',
}

/** Maps known HTML attribute identifiers to their serialized attribute names. */
export const htmlAttributeIdNameTable = [
  [HtmlAttributeId.Abbr, 'abbr'],
  [HtmlAttributeId.Accept, 'accept'],
  [HtmlAttributeId.AcceptCharset, 'accept-charset'],
  [HtmlAttributeId.AccessKey, 'accesskey'],
  [HtmlAttributeId.Action, 'action'],
  [HtmlAttributeId.Align, 'align'],
  [HtmlAttributeId.Alink, 'alink'],
  [HtmlAttributeId.Alt, 'alt'],
  [HtmlAttributeId.Archive, 'archive'],
  [HtmlAttributeId.Axis, 'axis'],
  [HtmlAttributeId.Background, 'background'],
  [HtmlAttributeId.BGColor, 'bgcolor'],
  [HtmlAttributeId.Border, 'border'],
  [HtmlAttributeId.CellPadding, 'cellpadding'],
  [HtmlAttributeId.CellSpacing, 'cellspacing'],
  [HtmlAttributeId.Char, 'char'],
  [HtmlAttributeId.CharOff, 'charoff'],
  [HtmlAttributeId.Charset, 'charset'],
  [HtmlAttributeId.Checked, 'checked'],
  [HtmlAttributeId.Cite, 'cite'],
  [HtmlAttributeId.Class, 'class'],
  [HtmlAttributeId.ClassId, 'classid'],
  [HtmlAttributeId.Clear, 'clear'],
  [HtmlAttributeId.Code, 'code'],
  [HtmlAttributeId.CodeBase, 'codebase'],
  [HtmlAttributeId.CodeType, 'codetype'],
  [HtmlAttributeId.Color, 'color'],
  [HtmlAttributeId.Cols, 'cols'],
  [HtmlAttributeId.ColSpan, 'colspan'],
  [HtmlAttributeId.Compact, 'compact'],
  [HtmlAttributeId.Content, 'content'],
  [HtmlAttributeId.Coords, 'coords'],
  [HtmlAttributeId.Data, 'data'],
  [HtmlAttributeId.DateTime, 'datetime'],
  [HtmlAttributeId.Declare, 'declare'],
  [HtmlAttributeId.Defer, 'defer'],
  [HtmlAttributeId.Dir, 'dir'],
  [HtmlAttributeId.Disabled, 'disabled'],
  [HtmlAttributeId.DynSrc, 'dynsrc'],
  [HtmlAttributeId.EncType, 'enctype'],
  [HtmlAttributeId.Face, 'face'],
  [HtmlAttributeId.For, 'for'],
  [HtmlAttributeId.Frame, 'frame'],
  [HtmlAttributeId.FrameBorder, 'frameborder'],
  [HtmlAttributeId.Headers, 'headers'],
  [HtmlAttributeId.Height, 'height'],
  [HtmlAttributeId.Href, 'href'],
  [HtmlAttributeId.HrefLang, 'hreflang'],
  [HtmlAttributeId.Hspace, 'hspace'],
  [HtmlAttributeId.HttpEquiv, 'http-equiv'],
  [HtmlAttributeId.Id, 'id'],
  [HtmlAttributeId.IsMap, 'ismap'],
  [HtmlAttributeId.Label, 'label'],
  [HtmlAttributeId.Lang, 'lang'],
  [HtmlAttributeId.Language, 'language'],
  [HtmlAttributeId.LeftMargin, 'leftmargin'],
  [HtmlAttributeId.Link, 'link'],
  [HtmlAttributeId.LongDesc, 'longdesc'],
  [HtmlAttributeId.LowSrc, 'lowsrc'],
  [HtmlAttributeId.MarginHeight, 'marginheight'],
  [HtmlAttributeId.MarginWidth, 'marginwidth'],
  [HtmlAttributeId.MaxLength, 'maxlength'],
  [HtmlAttributeId.Media, 'media'],
  [HtmlAttributeId.Method, 'method'],
  [HtmlAttributeId.Multiple, 'multiple'],
  [HtmlAttributeId.Name, 'name'],
  [HtmlAttributeId.NoHref, 'nohref'],
  [HtmlAttributeId.NoResize, 'noresize'],
  [HtmlAttributeId.NoShade, 'noshade'],
  [HtmlAttributeId.NoWrap, 'nowrap'],
  [HtmlAttributeId.Object, 'object'],
  [HtmlAttributeId.Profile, 'profile'],
  [HtmlAttributeId.Prompt, 'prompt'],
  [HtmlAttributeId.ReadOnly, 'readonly'],
  [HtmlAttributeId.Rel, 'rel'],
  [HtmlAttributeId.Rev, 'rev'],
  [HtmlAttributeId.Rows, 'rows'],
  [HtmlAttributeId.RowSpan, 'rowspan'],
  [HtmlAttributeId.Rules, 'rules'],
  [HtmlAttributeId.Scheme, 'scheme'],
  [HtmlAttributeId.Scope, 'scope'],
  [HtmlAttributeId.Scrolling, 'scrolling'],
  [HtmlAttributeId.Selected, 'selected'],
  [HtmlAttributeId.Shape, 'shape'],
  [HtmlAttributeId.Size, 'size'],
  [HtmlAttributeId.Span, 'span'],
  [HtmlAttributeId.Src, 'src'],
  [HtmlAttributeId.StandBy, 'standby'],
  [HtmlAttributeId.Start, 'start'],
  [HtmlAttributeId.Style, 'style'],
  [HtmlAttributeId.Summary, 'summary'],
  [HtmlAttributeId.TabIndex, 'tabindex'],
  [HtmlAttributeId.Target, 'target'],
  [HtmlAttributeId.Text, 'text'],
  [HtmlAttributeId.Title, 'title'],
  [HtmlAttributeId.TopMargin, 'topmargin'],
  [HtmlAttributeId.Type, 'type'],
  [HtmlAttributeId.UseMap, 'usemap'],
  [HtmlAttributeId.Valign, 'valign'],
  [HtmlAttributeId.Value, 'value'],
  [HtmlAttributeId.ValueType, 'valuetype'],
  [HtmlAttributeId.Version, 'version'],
  [HtmlAttributeId.Vlink, 'vlink'],
  [HtmlAttributeId.Vspace, 'vspace'],
  [HtmlAttributeId.Width, 'width'],
  [HtmlAttributeId.XmlNS, 'xmlns'],
] as const;

const idToName = new Map<HtmlAttributeId, string>(htmlAttributeIdNameTable);
const nameToId = new Map<string, HtmlAttributeId>(
  htmlAttributeIdNameTable.map(([id, name]) => [name.toLowerCase(), id]),
);

const attributeIdValues = new Set<string>(Object.values(HtmlAttributeId));

/**
 * Whether `value` is one of the {@link HtmlAttributeId} enum values.
 * Used to disambiguate the C# id/name overloads that collapse to a single TS signature.
 * @param value The value to test.
 * @returns `true` if the value is an HTML attribute identifier; otherwise, `false`.
 */
export function isHtmlAttributeId(value: unknown): value is HtmlAttributeId {
  return typeof value === 'string' && attributeIdValues.has(value);
}

/**
 * Converts the enum value into the equivalent attribute name.
 * @param value The enum value.
 * @returns The attribute name.
 */
export function toAttributeName(value: HtmlAttributeId): string {
  return idToName.get(value) ?? String(value);
}

/**
 * Converts the attribute name into the equivalent attribute identifier.
 * @param name The attribute name.
 * @returns The attribute identifier, or {@link HtmlAttributeId.Unknown} if the name is not known.
 */
export function toHtmlAttributeId(name: string | null | undefined): HtmlAttributeId {
  if (name === null || name === undefined) return HtmlAttributeId.Unknown;
  return nameToId.get(name.toLowerCase()) ?? HtmlAttributeId.Unknown;
}
