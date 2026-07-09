import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MemoryStream, PlainTextPreviewer, TextFormat, utf8 } from '../../src/index.js';
import { testDataDir } from '../gates/helpers.js';

describe('PlainTextPreviewerTests', () => {
  test('TestArgumentExceptions', () => {
    const previewer = new PlainTextPreviewer();
    expect(() => { previewer.maximumPreviewLength = 0; }).toThrow(RangeError);
    expect(() => { previewer.maximumPreviewLength = 1025; }).toThrow(RangeError);
    expect(() => previewer.getPreviewText(null as never)).toThrow(TypeError);
    expect(() => previewer.getPreviewText(null as never, 'utf-8')).toThrow(TypeError);
    expect(() => previewer.getPreviewText(new MemoryStream(), null as never)).toThrow(TypeError);
  });

  test('TestEmptyText', () => {
    const previewer = new PlainTextPreviewer();
    expect(previewer.getPreviewText('')).toBe('');
    expect(previewer.getPreviewText(new MemoryStream(), 'x-unknown')).toBe('');
    expect(previewer.getPreviewText(new MemoryStream(), utf8)).toBe('');
  });

  test('TestPlanetFitness', () => {
    const previewer = new PlainTextPreviewer();
    expect(previewer.inputFormat).toBe(TextFormat.Plain);
    const text = readFileSync(join(testDataDir, 'text', 'planet-fitness.txt'), 'utf8').slice(0, 16 * 1024);
    const expected = 'Planet Fitness https://view.email.planetfitness.com/?qs=9a098a031cabde68c0a4260051cd6fe473a2e997a53678ff26b4b199a711a9d2ad0536530d6f837c246b09f644d42016ecfb298f930b7af058e9e454b34f3d818ceb3052ae317b1ac4594aab28a2d788 View web ver\u2026';
    expect(previewer.getPreviewText(text)).toBe(expected);
  });
});
