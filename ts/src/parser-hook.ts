/**
 * Lazy registration hook for the MIME parser.
 *
 * The base entity classes (MimeEntity, HeaderList) expose parser-backed `load`
 * helpers, but the parser (`MimeParser`) sits *above* them in the type
 * hierarchy and pulls in every concrete entity subclass via its entity factory.
 * A direct top-level `import { MimeParser }` from a base class therefore creates
 * a fatal module-evaluation cycle (a subclass would `extend` an
 * as-yet-undefined base class).
 *
 * To keep the model layer parser-agnostic at module-eval time, `MimeParser`
 * registers a factory here on load (a runtime-only, type-erased indirection);
 * the model classes call `newMimeParser` at *call* time. Importing the package
 * entry point (index.ts) loads `mime-parser.ts`, guaranteeing registration.
 */
import type { HeaderList } from './header-list.js';
import type { Stream } from './io/stream.js';
import type { MimeEntity } from './mime-entity.js';
import type { MimeMessage } from './mime-message.js';
import type { MimeFormat } from './mime-reader.js';
import type { ParserOptions } from './parser-options.js';
import type { Result } from './result.js';

export interface ParserLike {
  readonly isEndOfStream: boolean;
  parseMessage(): Result<MimeMessage>;
  parseEntity(): Result<MimeEntity>;
  parseHeaders(): Result<HeaderList>;
}

type ParserFactory = (options: ParserOptions, stream: Stream, format: MimeFormat, persistent: boolean) => ParserLike;

let factory: ParserFactory | null = null;

/** Called by mime-parser.ts at module load. */
export function setParserFactory(f: ParserFactory): void {
  factory = f;
}

/** Construct a parser lazily (the concrete MimeParser, once registered). */
export function newMimeParser(
  options: ParserOptions,
  stream: Stream,
  format: MimeFormat = 'entity',
  persistent = false,
): ParserLike {
  if (factory === null)
    throw new Error('MimeParser has not been loaded — import from the package entry point (mimekit-ts).');
  return factory(options, stream, format, persistent);
}
