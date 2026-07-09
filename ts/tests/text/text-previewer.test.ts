import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { HtmlTextPreviewer, latin1, MemoryStream, MimeContent, PlainTextPreviewer, TextPart, TextPreviewer, utf8 } from '../../src/index.js';
import { testDataDir } from '../gates/helpers.js';

describe('TextPreviewerTests', () => {
  test('TestArgumentExceptions', () => {
    expect(() => TextPreviewer.getPreviewText(null as never)).toThrow(TypeError);
  });

  test('TestHomeDepotCheckInsideNOW', () => {
    const text = readFileSync(join(testDataDir, 'text', 'homedepot-check-inside-now.html'), 'utf8').slice(0, 16 * 1024);
    expect(new HtmlTextPreviewer().getPreviewText(text)).toBe('FREE DELIVERY Appliance Purchases $396 or More');
  });

  test('TestMimeKitHomepage', () => {
    const text = readFileSync(join(testDataDir, 'text', 'mimekit.net.html'), 'utf8').slice(0, 16 * 1024);
    expect(new HtmlTextPreviewer().getPreviewText(text)).toBe('Toggle navigation MimeKit Home About Help Documentation Donate \u00D7 Install with NuGet (recommended) NuGet PM> Install-Package MimeKit PM> Install-Package MailKit or Install via VS Package Management window. Direct Download ZIP fil\u2026');
  });

  test('TestPlanetFitness', () => {
    const text = readFileSync(join(testDataDir, 'text', 'planet-fitness.html'), 'utf8').slice(0, 16 * 1024);
    expect(new HtmlTextPreviewer().getPreviewText(text)).toBe('Don\u2019t miss our celebrity guest Monday evening');
  });

  test('TestPlanetFitnessPlain', () => {
    const text = readFileSync(join(testDataDir, 'text', 'planet-fitness.txt'), 'utf8').slice(0, 16 * 1024);
    expect(new PlainTextPreviewer().getPreviewText(text)).toBe('Planet Fitness https://view.email.planetfitness.com/?qs=9a098a031cabde68c0a4260051cd6fe473a2e997a53678ff26b4b199a711a9d2ad0536530d6f837c246b09f644d42016ecfb298f930b7af058e9e454b34f3d818ceb3052ae317b1ac4594aab28a2d788 View web ver\u2026');
  });

  test('TestGetPreviewTextUnknownCharset', () => {
    {
      const bytes = new Uint8Array([0xA4, 0xE9, 0xA4, 0xEB, 0xAC, 0x50, 0xA8, 0xB0]);
      const body = new TextPart('plain');
      body.content = new MimeContent(new MemoryStream(bytes), 'default');
      body.contentType.charset = 'x-unknown';

      const preview = TextPreviewer.getPreviewText(body);
      expect(preview, 'chinese text x-unknown -> UTF-8 -> iso-8859-1').toBe('¤é¤ë¬P¨°');
    }

    {
      const bytes = utf8.encode('日月星辰');
      const body = new TextPart('plain');
      body.content = new MimeContent(new MemoryStream(bytes), 'default');
      body.contentType.charset = 'x-unknown';

      const preview = TextPreviewer.getPreviewText(body);
      expect(preview, 'x-unknown -> UTF-8').toBe('日月星辰');
    }

    {
      const bytes = latin1.encode("L'encyclopédie libre");
      const body = new TextPart('plain');
      body.content = new MimeContent(new MemoryStream(bytes), 'default');
      body.contentType.charset = 'x-unknown';

      const preview = TextPreviewer.getPreviewText(body);
      expect(preview, 'french text x-unknown -> UTF-8 -> iso-8859-1').toBe("L'encyclopédie libre");
    }
  });
});
