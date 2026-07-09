// CMS CompressedData build + parse (RFC 3274) for the concrete S/MIME context.
// pkijs has no CompressedData type, so we assemble/parse the minimal ASN.1 with
// asn1js + the pkijs ContentInfo wrapper. Compression is zlib (RFC 1950), which
// the Web `CompressionStream`/`DecompressionStream` expose as 'deflate'
// (isomorphic across Node and the browser).

import * as asn1js from 'asn1js';
import { ContentInfo } from 'pkijs';
import { OID_COMPRESSED_DATA, OID_DATA, OID_ZLIB } from './smime-oids.js';
import { ab } from './smime-webcrypto.js';

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function explicit0(inner: asn1js.BaseBlock): asn1js.Constructed {
  return new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: [ inner ] });
}

/** Build a CMS CompressedData ContentInfo (DER) around the deflated content. */
export async function buildCompressedData(content: Uint8Array): Promise<Uint8Array> {
  const compressed = await deflate(content);

  const encapContentInfo = new asn1js.Sequence({ value: [
    new asn1js.ObjectIdentifier({ value: OID_DATA }),
    explicit0(new asn1js.OctetString({ valueHex: ab(compressed) })),
  ] });

  const compressedData = new asn1js.Sequence({ value: [
    new asn1js.Integer({ value: 0 }),
    new asn1js.Sequence({ value: [ new asn1js.ObjectIdentifier({ value: OID_ZLIB }) ] }),
    encapContentInfo,
  ] });

  const contentInfo = new ContentInfo({ contentType: OID_COMPRESSED_DATA, content: compressedData });
  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

function gatherOctet(block: asn1js.BaseBlock): Uint8Array {
  // block is the [0] EXPLICIT wrapper; its child is the OCTET STRING (possibly constructed).
  const octet = (block as asn1js.Constructed).valueBlock.value[0] as asn1js.OctetString;
  const inner = octet.valueBlock.value as asn1js.OctetString[] | undefined;
  if (inner && inner.length > 0) {
    let total = 0;
    const parts = inner.map((c) => new Uint8Array(c.valueBlock.valueHexView));
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { out.set(p, pos); pos += p.length; }
    return out;
  }
  return new Uint8Array(octet.valueBlock.valueHexView);
}

/** Parse a CMS CompressedData ContentInfo (DER) and inflate the content. */
export async function decompressCompressedData(der: Uint8Array): Promise<Uint8Array> {
  const contentInfo = new ContentInfo({ schema: asn1js.fromBER(ab(der)).result });
  const compressedData = contentInfo.content as asn1js.Sequence;
  const encapContentInfo = compressedData.valueBlock.value[2] as asn1js.Sequence;
  const eContent = encapContentInfo.valueBlock.value[1] as asn1js.BaseBlock;
  const compressed = gatherOctet(eContent);
  return inflate(compressed);
}
