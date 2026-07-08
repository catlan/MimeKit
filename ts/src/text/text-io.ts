// Minimal text sink/source abstractions for the HTML layer.
//
// MimeKit's HtmlWriter writes to a System.IO.TextWriter and HtmlToken.WriteTo
// takes a TextWriter; the port models that as a tiny { write(text) } sink.
// The tokenizer reads characters from a TextReader; the port instead feeds a
// JS string with an index (see HtmlTokenizer), so only the writer side needs
// an abstraction here.

import { Stream } from '../io/stream.js';

/** Minimal TextWriter sink: MimeKit's output.Write(char)/Write(string). */
export interface TextWriter {
  write(text: string): void;
  flush?(): void;
  dispose?(): void;
}

/** A TextWriter that accumulates into an in-memory string (System.IO.StringWriter). */
export class StringWriter implements TextWriter {
  private buffer = '';

  write(text: string): void {
    this.buffer += text;
  }

  flush(): void {}

  dispose(): void {}

  toString(): string {
    return this.buffer;
  }
}

/**
 * A TextWriter that UTF-8 encodes text and writes it to a Stream
 * (System.IO.StreamWriter). Generation is UTF-8 only (see plan Q3).
 */
export class StreamTextWriter implements TextWriter {
  private readonly encoder = new TextEncoder();
  private readonly leaveOpen: boolean;

  constructor(
    private readonly stream: Stream,
    leaveOpen = false,
  ) {
    this.leaveOpen = leaveOpen;
  }

  write(text: string): void {
    if (text.length === 0) return;
    const bytes = this.encoder.encode(text);
    this.stream.write(bytes, 0, bytes.length);
  }

  flush(): void {
    this.stream.flush();
  }

  dispose(): void {
    if (!this.leaveOpen) this.stream.dispose();
  }
}
