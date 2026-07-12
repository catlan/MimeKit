/**
 * Minimal ambient declaration of the `node:fs` surface used by the Node edge
 * adapter. The core tsconfig deliberately sets `"types": []` so Node globals
 * (Buffer, process, …) never leak into the isomorphic core's typechecking;
 * this shim types just what `fs-reader.ts` calls instead of pulling in all of
 * `@types/node`. None of these types appear in the published `.d.ts` surface.
 */
declare module 'node:fs' {
  export function openSync(path: string, flags: string): number;
  export function closeSync(fd: number): void;
  export function fstatSync(fd: number): { size: number };
  export function readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number): number;
  export function read(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
    callback: (err: Error | null, bytesRead: number) => void,
  ): void;
}
