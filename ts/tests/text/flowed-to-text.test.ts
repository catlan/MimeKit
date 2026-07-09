import { describe, expect, test } from 'vitest';
import { FlowedToText, TextFormat } from '../../src/index.js';

describe('FlowedToTextTests', () => {
  test('TestArgumentExceptions', () => {
    const converter = new FlowedToText();
    expect(() => converter.convert(null as never)).toThrow(TypeError);
  });

  test('TestDefaultPropertyValues', () => {
    const converter = new FlowedToText();
    expect(converter.deleteSpace).toBe(false);
    expect(converter.footer).toBeNull();
    expect(converter.header).toBeNull();
    expect(converter.inputFormat).toBe(TextFormat.Flowed);
    expect(converter.outputFormat).toBe(TextFormat.Plain);
  });

  test('TestSimpleFlowedToText', () => {
    const expected = 'This is some sample text that has been formatted ' +
      'according to the format=flowed rules defined in rfc3676. ' +
      'This text, once converted, should all be on a single line.\n';
    const text = 'This is some sample text that has been formatted \n' +
      'according to the format=flowed rules defined in rfc3676. \n' +
      'This text, once converted, should all be on a single line.\n';
    const converter = new FlowedToText();
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestQuotedFlowedToText', () => {
    const expected = '> Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!\n' +
      '>> Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding styles, of late.\n" +
      '>>>>>> Any complaints?\n';
    const text = '> Thou villainous ill-breeding spongy dizzy-eyed \n' +
      '> reeky elf-skinned pigeon-egg!\n' +
      '>> Thou artless swag-bellied milk-livered \n' +
      '>> dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe \n' +
      '>>> unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly \n' +
      '>>>> enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding \n" +
      '>>>>> styles, of late.\n' +
      '>>>>>> Any complaints?\n';
    const converter = new FlowedToText();
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestBrokenQuotedFlowedToText', () => {
    const expected = '> Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg! \n' +
      '>> Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding styles, of late.\n" +
      '>>>>>> Any complaints?\n';
    const text = '> Thou villainous ill-breeding spongy dizzy-eyed \n' +
      '> reeky elf-skinned pigeon-egg! \n' +
      '>> Thou artless swag-bellied milk-livered \n' +
      '>> dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe \n' +
      '>>> unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly \n' +
      '>>>> enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding \n" +
      '>>>>> styles, of late.\n' +
      '>>>>>> Any complaints?\n';
    const converter = new FlowedToText();
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestFlowedTextEndingWithSpace', () => {
    const expected = 'We should have access, and apparently did a few months ago, but now there isa "You do not currently have access to this content." at the bottom of therecord\n' +
      '\n' +
      'The URL in question URL:\n' +
      'https://example.com/';
    const text = 'We should have access, and apparently did a few months ago, but now there is \n' +
      'a "You do not currently have access to this content." at the bottom of the \n' +
      'record\n' +
      '\n' +
      'The URL in question URL:\n' +
      'https://example.com/ ';
    const converter = new FlowedToText();
    converter.deleteSpace = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('ReadLine empty input', () => {
    // extra (not in C#): TextReader.ReadLine returns zero lines for empty input.
    expect(new FlowedToText().convert('')).toBe('');
  });

  test('ReadLine trailing newline', () => {
    // extra (not in C#): trailing newline does not produce a final empty line.
    expect(new FlowedToText().convert('line\n')).toBe('line\n');
  });
});
