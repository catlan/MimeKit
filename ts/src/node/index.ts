/**
 * Node adapter entry point (`mimekit/node`): filesystem-backed edge readers.
 * Kept out of the main entry so `import 'mimekit'` stays free of `node:`
 * imports and safe for browser bundling.
 */

export { NodeFileReader } from './fs-reader.js';
