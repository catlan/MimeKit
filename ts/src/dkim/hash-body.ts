// Port of MimeKit/MimeMessage.cs `HashBody` (extracted as a free function so
// the core MimeMessage never imports the crypto layer — crypto stays in the
// `/dkim` subpath, per CRYPTO-PLAN.md §3b).

import type { FormatOptions } from '../format-options.js';
import type { MimeMessage } from '../mime-message.js';
import { FilteredStream } from '../io/filtered-stream.js';
import { DkimCanonicalizationAlgorithm } from './dkim-canonicalization-algorithm.js';
import { DkimSignatureAlgorithm } from './dkim-signature-algorithm.js';
import { DkimHashStream } from './dkim-hash-stream.js';
import { DkimRelaxedBodyFilter } from './dkim-relaxed-body-filter.js';
import { DkimSimpleBodyFilter } from './dkim-simple-body-filter.js';
import type { DkimBodyFilter } from './dkim-body-filter.js';

/**
 * Hash the canonicalized body of a message (C#: `MimeMessage.HashBody`).
 *
 * @param message The message whose body to hash.
 * @param options The formatting options.
 * @param signatureAlgorithm The signature algorithm (selects the hash).
 * @param bodyCanonicalizationAlgorithm The body canonicalization algorithm.
 * @param maxLength The max body length to hash, or `-1` for the whole body.
 * @returns The body hash.
 */
export function hashBody(
  message: MimeMessage,
  options: FormatOptions,
  signatureAlgorithm: DkimSignatureAlgorithm,
  bodyCanonicalizationAlgorithm: DkimCanonicalizationAlgorithm,
  maxLength: number
): Uint8Array {
  const stream = new DkimHashStream(signatureAlgorithm, maxLength);
  const filtered = new FilteredStream(stream);

  const dkim: DkimBodyFilter =
    bodyCanonicalizationAlgorithm === DkimCanonicalizationAlgorithm.Relaxed
      ? new DkimRelaxedBodyFilter()
      : new DkimSimpleBodyFilter();

  filtered.add(options.createNewLineFilter(false));
  filtered.add(dkim);

  const body = message.body;
  if (body != null) {
    try {
      body.ensureNewLine = message.compliance === 'strict' || options.ensureNewLine;
      body.writeTo(options, filtered, true);
    } finally {
      body.ensureNewLine = false;
    }
  }

  filtered.flush();

  if (!dkim.lastWasNewLine) {
    const nl = options.newLineBytes;
    stream.write(nl, 0, nl.length);
  }

  return stream.generateHash();
}
