// Minimal text sink/source abstractions for the HTML layer.
//
// MimeKit's HtmlWriter writes to a System.IO.TextWriter and HtmlToken.WriteTo
// takes a TextWriter; the port models that as a tiny { write(text) } sink.
// The tokenizer reads characters from a TextReader; the port instead feeds a
// JS string with an index (see HtmlTokenizer), so only the writer side needs
// an abstraction here.

import { Stream } from '../io/stream.js';

/** Minimal text sink used by the HTML layer. */
export interface TextWriter {
  /** Write text to the sink. */
  write(text: string): void;
  /** Flush buffered text, if the sink buffers output. */
  flush?(): void;
  /** Release resources associated with the sink. */
  dispose?(): void;
}

/** A text writer that accumulates output into an in-memory string. */
export class StringWriter implements TextWriter {
  private buffer = '';

  /** Write text to the in-memory buffer. */
  write(text: string): void {
    this.buffer += text;
  }

  /** Flush the writer. */
  flush(): void {}

  /** Dispose the writer. */
  dispose(): void {}

  /** Return the accumulated string. */
  toString(): string {
    return this.buffer;
  }
}

/**
 * A text writer that UTF-8 encodes text and writes it to a stream.
 *
 * Generation is UTF-8 only.
 */
export class StreamTextWriter implements TextWriter {
  private readonly encoder = new TextEncoder();
  private readonly leaveOpen: boolean;

  /** Create a text writer over a stream. */
  constructor(
    private readonly stream: Stream,
    leaveOpen = false,
  ) {
    this.leaveOpen = leaveOpen;
  }

  /** Write text to the stream. */
  write(text: string): void {
    if (text.length === 0) return;
    const bytes = this.encoder.encode(text);
    this.stream.write(bytes, 0, bytes.length);
  }

  /** Flush the stream. */
  flush(): void {
    this.stream.flush();
  }

  /** Dispose the writer, and the stream unless it was left open. */
  dispose(): void {
    if (!this.leaveOpen) this.stream.dispose();
  }
}
