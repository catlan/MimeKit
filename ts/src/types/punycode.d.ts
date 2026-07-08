declare module 'punycode/punycode.js' {
  interface PunycodeModule {
    toASCII(domain: string): string;
    toUnicode(domain: string): string;
    encode(text: string): string;
    decode(text: string): string;
    ucs2: {
      decode(text: string): number[];
      encode(codePoints: number[]): string;
    };
    version: string;
  }
  const punycode: PunycodeModule;
  export default punycode;
}
