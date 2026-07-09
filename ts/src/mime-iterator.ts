import type { MessagePart } from './message-part.js';
import { MimeEntity } from './mime-entity.js';
import type { MimeMessage } from './mime-message.js';
import { Multipart } from './multipart.js';

interface MimeNode {
  readonly entity: MimeEntity;
  readonly indexed: boolean;
}

export class MimeIterator implements Iterable<MimeEntity> {
  readonly message: MimeMessage;
  private readonly stack: MimeNode[] = [];
  private readonly path: number[] = [];
  private moveFirst = true;
  private currentValue: MimeEntity | null = null;
  private index = -1;

  constructor(message: MimeMessage) {
    if (message == null) throw new TypeError('message cannot be null or undefined');
    this.message = message;
  }

  get Message(): MimeMessage { return this.message; }

  get current(): MimeEntity {
    if (this.currentValue == null) throw new Error('Iterator is not positioned on an entity.');
    return this.currentValue;
  }

  get Current(): MimeEntity { return this.current; }

  get parent(): MimeEntity | null {
    if (this.currentValue == null) throw new Error('Iterator is not positioned on an entity.');
    return this.stack.length > 0 ? this.stack[this.stack.length - 1]!.entity : null;
  }

  get Parent(): MimeEntity | null { return this.parent; }

  get depth(): number {
    if (this.currentValue == null) throw new Error('Iterator is not positioned on an entity.');
    return this.stack.length;
  }

  get Depth(): number { return this.depth; }

  get pathSpecifier(): string {
    if (this.currentValue == null) throw new Error('Iterator is not positioned on an entity.');
    return [...this.path.map((value) => `${value + 1}`), `${this.index + 1}`].join('.');
  }

  get PathSpecifier(): string { return this.pathSpecifier; }

  private push(entity: MimeEntity): void {
    if (this.index !== -1) this.path.push(this.index);
    this.stack.push({ entity, indexed: this.index !== -1 });
  }

  private pop(): boolean {
    const node = this.stack.pop();
    if (node == null) return false;
    if (node.indexed) {
      this.index = this.path[this.path.length - 1]!;
      this.path.pop();
    }
    this.currentValue = node.entity;
    return true;
  }

  moveNext(): boolean {
    if (this.moveFirst) {
      this.currentValue = this.message.body;
      this.moveFirst = false;
      return this.currentValue != null;
    }

    const current = this.currentValue;
    let multipart = current instanceof Multipart ? current : null;

    if (isMessagePart(current)) {
      this.currentValue = current.message?.body ?? null;
      if (this.currentValue != null) {
        this.push(current);
        this.index = this.currentValue instanceof Multipart ? -1 : 0;
        return true;
      }
    }

    if (multipart != null && multipart.count > 0) {
      this.push(multipart);
      this.currentValue = multipart.at(0);
      this.index = 0;
      return true;
    }

    while (this.stack.length > 0) {
      multipart = this.stack[this.stack.length - 1]!.entity instanceof Multipart
        ? this.stack[this.stack.length - 1]!.entity as Multipart
        : null;

      if (multipart != null && multipart.count > ++this.index) {
        this.currentValue = multipart.at(this.index);
        return true;
      }

      if (!this.pop()) break;
    }

    this.currentValue = null;
    this.index = -1;
    return false;
  }

  MoveNext(): boolean { return this.moveNext(); }

  moveTo(pathSpecifier: string): boolean {
    if (pathSpecifier == null) throw new TypeError('pathSpecifier cannot be null or undefined');
    if (pathSpecifier.length === 0) throw new TypeError('The path specifier cannot be empty.');

    const indexes = parsePath(pathSpecifier);
    let i = 0;

    for (; i < Math.min(indexes.length, this.path.length); i++) {
      if (indexes[i]! < this.path[i]!) {
        this.reset();
        break;
      }
    }

    if (!this.moveFirst && indexes.length < this.path.length) this.reset();
    if (this.moveFirst && !this.moveNext()) return false;

    do {
      if (this.path.length + 1 === indexes.length) {
        for (i = 0; i < this.path.length; i++) {
          if (indexes[i] !== this.path[i]) break;
        }
        if (i === this.path.length && indexes[i] === this.index) return true;
      }
    } while (this.moveNext());

    return false;
  }

  MoveTo(pathSpecifier: string): boolean { return this.moveTo(pathSpecifier); }

  reset(): void {
    this.moveFirst = true;
    this.currentValue = null;
    this.stack.length = 0;
    this.path.length = 0;
    this.index = -1;
  }

  Reset(): void { this.reset(); }

  *[Symbol.iterator](): IterableIterator<MimeEntity> {
    this.reset();
    while (this.moveNext()) yield this.current;
  }
}

function parsePath(pathSpecifier: string): number[] {
  return pathSpecifier.split('.').map((part) => {
    if (!/^[0-9]+$/.test(part)) throw new Error('Invalid path specifier format.');
    const value = Number(part);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid path specifier format.');
    return value - 1;
  });
}

function isMessagePart(value: MimeEntity | null): value is MessagePart {
  return value != null && 'message' in value;
}
