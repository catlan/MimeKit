// Port of MimeKit/Text/HtmlNamespace.cs (enum + HtmlNamespaceExtensions).

export enum HtmlNamespace {
  Html = 'Html',
  MathML = 'MathML',
  Svg = 'Svg',
  XLink = 'XLink',
  Xml = 'Xml',
  XmlNS = 'XmlNS',
}

const NamespacePrefix = 'http://www.w3.org/';
const NamespacePrefixLength = NamespacePrefix.length;

// Index-ordered to match the C# (int) value <-> url mapping.
const namespaceValues: [HtmlNamespace, string][] = [
  [HtmlNamespace.Html, 'http://www.w3.org/1999/xhtml'],
  [HtmlNamespace.MathML, 'http://www.w3.org/1998/Math/MathML'],
  [HtmlNamespace.Svg, 'http://www.w3.org/2000/svg'],
  [HtmlNamespace.XLink, 'http://www.w3.org/1999/xlink'],
  [HtmlNamespace.Xml, 'http://www.w3.org/XML/1998/namespace'],
  [HtmlNamespace.XmlNS, 'http://www.w3.org/2000/xmlns/'],
];

const nsToUrl = new Map<HtmlNamespace, string>(namespaceValues);

/** Converts the enum value into the equivalent namespace url. */
export function toNamespaceUrl(value: HtmlNamespace): string {
  const url = nsToUrl.get(value);
  if (url === undefined) throw new RangeError('value');
  return url;
}

/** Convert the namespace url into the equivalent HtmlNamespace. */
export function toHtmlNamespace(ns: string | null | undefined): HtmlNamespace {
  if (ns === null || ns === undefined) throw new TypeError('ns');

  if (ns.slice(0, NamespacePrefixLength).toLowerCase() !== NamespacePrefix.toLowerCase())
    return HtmlNamespace.Html;

  for (const [id, value] of namespaceValues) {
    if (ns.length !== value.length) continue;

    if (
      ns.slice(NamespacePrefixLength).toLowerCase() === value.slice(NamespacePrefixLength).toLowerCase()
    )
      return id;
  }

  return HtmlNamespace.Html;
}
