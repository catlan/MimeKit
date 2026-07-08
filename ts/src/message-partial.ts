import { Parameter } from './parameter.js';
import { MessagePart, type MimeMessageLike } from './message-part.js';
import { MimePart } from './mime-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';

export class MessagePartial extends MimePart {
  constructor(args: MimeEntityConstructorArgs);
  constructor(id: string, number: number, total: number);
  constructor(idOrArgs: string | MimeEntityConstructorArgs, number?: number, total?: number) {
    if (isConstructorArgs(idOrArgs)) {
      super(idOrArgs);
      return;
    }
    const id = idOrArgs;
    if (id == null) throw new TypeError('id cannot be null or undefined');
    if (number == null || number < 1) throw new RangeError('number out of range');
    if (total == null || total < number) throw new RangeError('total out of range');
    super('message', 'partial');
    this.contentType.parameters.add(new Parameter('id', id));
    this.contentType.parameters.add(new Parameter('number', String(number)));
    this.contentType.parameters.add(new Parameter('total', String(total)));
  }

  get Id(): string | null { return this.id; }
  get id(): string | null { return this.contentType.parameters.get('id') as string | null; }
  get Number(): number | null { return this.number; }
  get number(): number | null { return parseNullableInt(this.contentType.parameters.get('number') as string | null); }
  get Total(): number | null { return this.total; }
  get total(): number | null { return parseNullableInt(this.contentType.parameters.get('total') as string | null); }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MessagePartial');
    visitor.visitMessagePartial(this);
  }

  static split(_message: MimeMessageLike, _maxSize: number): MimeMessageLike[] {
    // deferred(wave-3e/4): requires MimeMessage cloning/serialization and parser reassembly semantics.
    throw new Error('deferred(wave-3e/4): MessagePartial.split requires MimeMessage and parser support.');
  }

  static join(_message: MimeMessageLike, _partials: Iterable<MessagePartial>): MimeMessageLike | null {
    // deferred(wave-3e/4): requires chained partial content parsing into MimeMessage.
    throw new Error('deferred(wave-3e/4): MessagePartial.join requires MimeMessage and parser support.');
  }
}


function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

function parseNullableInt(value: string | null): number | null {
  if (value == null)
    return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed))
    return null;
  return Number.parseInt(trimmed, 10);
}
