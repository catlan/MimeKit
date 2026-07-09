import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { HtmlTextPreviewer, MemoryStream, TextFormat, utf8 } from '../../src/index.js';
import { testDataDir } from '../gates/helpers.js';

function assertPreviewText(file: string, expected: string, max: number): void {
  const previewer = new HtmlTextPreviewer();
  previewer.maximumPreviewLength = max;
  expect(previewer.inputFormat).toBe(TextFormat.Html);
  const text = readFileSync(join(testDataDir, 'text', file), 'utf8').slice(0, 16 * 1024);
  expect(previewer.getPreviewText(text)).toBe(expected);
}

describe('HtmlTextPreviewerTests', () => {
  test('TestArgumentExceptions', () => {
    const previewer = new HtmlTextPreviewer();
    expect(() => { previewer.maximumPreviewLength = 0; }).toThrow(RangeError);
    expect(() => { previewer.maximumPreviewLength = 1025; }).toThrow(RangeError);
    expect(() => previewer.getPreviewText(null as never)).toThrow(TypeError);
    expect(() => previewer.getPreviewText(null as never, 'utf-8')).toThrow(TypeError);
    expect(() => previewer.getPreviewText(new MemoryStream(), null as never)).toThrow(TypeError);
  });

  test('TestEmptyText', () => {
    const previewer = new HtmlTextPreviewer();
    expect(previewer.getPreviewText('')).toBe('');
    expect(previewer.getPreviewText(new MemoryStream(), 'x-unknown')).toBe('');
    expect(previewer.getPreviewText(new MemoryStream(), utf8)).toBe('');
  });

  test('TestHomeDepot110', () => assertPreviewText('homedepot-check-inside-now.html', 'FREE DELIVERY Appliance Purchases $396 or More', 110));
  test('TestHomeDepot230', () => assertPreviewText('homedepot-check-inside-now.html', 'FREE DELIVERY Appliance Purchases $396 or More', 230));
  test('TestMimeKitHomepage110', () => assertPreviewText('mimekit.net.html', 'Toggle navigation MimeKit Home About Help Documentation Donate \u00D7 Install with NuGet (recommended) NuGet PM> I\u2026', 110));
  test('TestMimeKitHomepage230', () => assertPreviewText('mimekit.net.html', 'Toggle navigation MimeKit Home About Help Documentation Donate \u00D7 Install with NuGet (recommended) NuGet PM> Install-Package MimeKit PM> Install-Package MailKit or Install via VS Package Management window. Direct Download ZIP fil\u2026', 230));
  test('TestPlanetFitness110', () => assertPreviewText('planet-fitness.html', 'Don\u2019t miss our celebrity guest Monday evening', 110));
  test('TestPlanetFitness230', () => assertPreviewText('planet-fitness.html', 'Don\u2019t miss our celebrity guest Monday evening', 230));
});
