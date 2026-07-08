/**
 * Port of MimeKit/Encodings/Punycode.cs + IPunycode.cs.
 *
 * The C# class wraps System.Globalization.IdnMapping — there is no algorithm
 * upstream to port. This implementation wraps the zero-dependency `punycode`
 * package (RFC 3492) plus the input mapping .NET applies around it, derived
 * EMPIRICALLY against the oracle's `idn` dumps (IdnMapping on .NET 10/ICU):
 *
 *   - all-ASCII input is returned unchanged (IdnMapping short-circuits it);
 *   - non-ASCII input is NFKC-normalized and lowercased before RFC 3492
 *     encoding (so BÜCHER.COM → xn--bcher-kva.com, fullwidth → ascii);
 *   - failures return the input unchanged (MimeKit catches ArgumentException
 *     from IdnMapping and falls back to the raw domain);
 *   - decode of an xn-- label that yields nothing or control characters is
 *     invalid → input returned unchanged.
 *
 * Divergence risk is bounded by the idn gate (gates/idn-inputs.list vs the
 * oracle) and, downstream, the wave-2 address gates over the corpus.
 */
import punycode from 'punycode/punycode.js';

export interface IPunycode {
  encode(unicode: string, index?: number, count?: number): string;
  decode(ascii: string, index?: number, count?: number): string;
}

/** UTS#46 label separators (IdnMapping maps these to '.'). */
function mapSeparators(text: string): string {
  return text.replace(/[。．｡]/g, '.');
}

function isAllAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f)
      return false;
  }
  return true;
}

function hasInvalidDecodedChars(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f))
      return true;
  }
  return false;
}

function toUnicodeStrict(ascii: string): string {
  const decoded = punycode.toUnicode(ascii);
  const inLabels = ascii.split('.');
  const outLabels = decoded.split('.');
  if (inLabels.length !== outLabels.length)
    return ascii;
  for (let i = 0; i < inLabels.length; i++) {
    if (!inLabels[i]!.toLowerCase().startsWith('xn--'))
      continue;
    const out = outLabels[i]!;
    if (out.length === 0 || hasInvalidDecodedChars(out))
      return ascii; // invalid punycode label: IdnMapping throws, MimeKit keeps input
  }
  return decoded;
}

export class Punycode implements IPunycode {
  encode(unicode: string, index = 0, count = unicode.length - index): string {
    if (!Number.isInteger(index) || index < 0 || index > unicode.length)
      throw new RangeError(`index ${index} out of range [0, ${unicode.length}]`);
    if (!Number.isInteger(count) || count < 0 || count > unicode.length - index)
      throw new RangeError(`count ${count} out of range [0, ${unicode.length - index}]`);

    const domain = unicode.slice(index, index + count);

    if (isAllAscii(domain))
      return domain;

    try {
      return punycode.toASCII(domain.normalize('NFKC').toLowerCase());
    } catch {
      return domain;
    }
  }

  decode(ascii: string, index = 0, count = ascii.length - index): string {
    if (!Number.isInteger(index) || index < 0 || index > ascii.length)
      throw new RangeError(`index ${index} out of range [0, ${ascii.length}]`);
    if (!Number.isInteger(count) || count < 0 || count > ascii.length - index)
      throw new RangeError(`count ${count} out of range [0, ${ascii.length - index}]`);

    const domain = ascii.slice(index, index + count);

    // Empirical .NET GetUnicode semantics (validated against the oracle's
    // idn dumps): process per label — separators normalize to '.'; an xn--
    // label decodes (invalid punycode fails the WHOLE domain → input
    // unchanged); a non-ASCII label whose NFKC+casefold lands in ASCII uses
    // the mapped form; any other non-ASCII label keeps its ORIGINAL form.
    try {
      const labels = mapSeparators(domain).split('.');
      const out: string[] = [];

      for (const label of labels) {
        if (isAllAscii(label)) {
          if (label.toLowerCase().startsWith('xn--')) {
            const decoded = punycode.toUnicode(label);
            if (decoded.length === 0 || hasInvalidDecodedChars(decoded))
              return domain;
            out.push(decoded);
          } else {
            out.push(label);
          }
          continue;
        }

        const mapped = label.normalize('NFKC').toLowerCase();
        if (mapped !== label && isAllAscii(mapped)) {
          if (mapped.startsWith('xn--')) {
            const decoded = punycode.toUnicode(mapped);
            if (decoded.length === 0 || hasInvalidDecodedChars(decoded))
              return domain;
            out.push(decoded);
          } else {
            out.push(mapped);
          }
        } else {
          out.push(label);
        }
      }

      return out.join('.');
    } catch {
      return domain;
    }
  }
}

/** Shared default instance (C#: MailboxAddress's static IdnMapping usage). */
export const punycodeDefault: IPunycode = new Punycode();
