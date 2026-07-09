import { describe, expect, test } from 'vitest';
import { FlowedToText, TextFormat, TextToFlowed } from '../../src/index.js';

describe('TextToFlowedTests', () => {
  test('TestArgumentExceptions', () => {
    const converter = new TextToFlowed();
    expect(() => converter.convert(null as never)).toThrow(TypeError);
  });

  test('TestDefaultPropertyValues', () => {
    const converter = new TextToFlowed();
    expect(converter.footer).toBeNull();
    expect(converter.header).toBeNull();
    expect(converter.inputFormat).toBe(TextFormat.Plain);
    expect(converter.outputFormat).toBe(TextFormat.Flowed);
  });

  test('TestSimpleTextToFlowed', () => {
    const expected = '> Thou art a villainous ill-breeding spongy dizzy-eyed reeky elf-skinned  \n' +
      '> pigeon-egg!\n' +
      '>> Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly enforced, including the  \n' +
      '>>>> use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding styles, of late.\n" +
      '>>>>>> Any complaints?\n';
    const text = '> Thou art a villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!\n' +
      '>> Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding styles, of late.\n" +
      '>>>>>> Any complaints?\n';
    let converter: TextToFlowed | FlowedToText = new TextToFlowed();
    let result = converter.convert(text);

    expect(result).toBe(expected);

    converter = new FlowedToText();
    converter.deleteSpace = true;
    result = converter.convert(expected);

    expect(result).toBe(text);
  });

  test('TestSpaceStuffingFromLine', () => {
    const expected = 'My favorite James Bond movie is\n' +
      ' From Russia with love.\n';
    const text = 'My favorite James Bond movie is\n' +
      'From Russia with love.\n';
    let converter: TextToFlowed | FlowedToText = new TextToFlowed();
    let result = converter.convert(text);

    expect(result).toBe(expected);

    converter = new FlowedToText();
    result = converter.convert(expected);

    expect(result).toBe(text);
  });

  test('TestSpaceStuffingLinesStartingWithSpace', () => {
    const expected = 'This is a regular line.\n' +
      '  This line starts with a space.\n';
    const text = 'This is a regular line.\n' +
      ' This line starts with a space.\n';
    let converter: TextToFlowed | FlowedToText = new TextToFlowed();
    let result = converter.convert(text);

    expect(result).toBe(expected);

    converter = new FlowedToText();
    result = converter.convert(expected);

    expect(result).toBe(text);
  });

  test('TestFlowingLongLines', () => {
    const text = 'But, soft! what light through yonder window breaks? ' +
      'It is the east, and Juliet is the sun. ' +
      'Arise, fair sun, and kill the envious moon, ' +
      'Who is already sick and pale with grief, ' +
      'That thou her maid art far more fair than she: ' +
      'Be not her maid, since she is envious; ' +
      'Her vestal livery is but sick and green ' +
      'And none but fools do wear it; cast it off. ' +
      'It is my lady, O, it is my love! ' +
      'O, that she knew she were! ' +
      'She speaks yet she says nothing: what of that? ' +
      'Her eye discourses; I will answer it. ' +
      "I am too bold, 'tis not to me she speaks: " +
      'Two of the fairest stars in all the heaven, ' +
      'Having some business, do entreat her eyes ' +
      'To twinkle in their spheres till they return. ' +
      'What if her eyes were there, they in her head? ' +
      'The brightness of her cheek would shame those stars, ' +
      'As daylight doth a lamp; her eyes in heaven ' +
      'Would through the airy region stream so bright ' +
      'That birds would sing and think it were not night. ' +
      'See, how she leans her cheek upon her hand! ' +
      'O, that I were a glove upon that hand, ' +
      'That I might touch that cheek!\n';
    const expected = `But, soft! what light through yonder window breaks? It is the east, and  
Juliet is the sun. Arise, fair sun, and kill the envious moon, Who is  
already sick and pale with grief, That thou her maid art far more fair than  
she: Be not her maid, since she is envious; Her vestal livery is but sick  
and green And none but fools do wear it; cast it off. It is my lady, O, it  
is my love! O, that she knew she were! She speaks yet she says nothing: what  
of that? Her eye discourses; I will answer it. I am too bold, 'tis not to me  
she speaks: Two of the fairest stars in all the heaven, Having some  
business, do entreat her eyes To twinkle in their spheres till they return.  
What if her eyes were there, they in her head? The brightness of her cheek  
would shame those stars, As daylight doth a lamp; her eyes in heaven Would  
through the airy region stream so bright That birds would sing and think it  
were not night. See, how she leans her cheek upon her hand! O, that I were a  
glove upon that hand, That I might touch that cheek!
`;
    let converter: TextToFlowed | FlowedToText = new TextToFlowed();
    let result = converter.convert(text).replace(/\r\n/g, '\n');

    expect(result).toBe(expected);

    converter = new FlowedToText();
    converter.deleteSpace = true;
    result = converter.convert(expected).replace(/\r\n/g, '\n');

    expect(result).toBe(text);
  });

  test('TestFlowingLongQuotedLines', () => {
    const text = "A passage from Shakespear's Romeo + Juliet:\n" +
      '> Begin quote\n' +
      '>> But, soft! what light through yonder window breaks? ' +
      'It is the east, and Juliet is the sun. ' +
      'Arise, fair sun, and kill the envious moon, ' +
      'Who is already sick and pale with grief, ' +
      'That thou her maid art far more fair than she: ' +
      'Be not her maid, since she is envious; ' +
      'Her vestal livery is but sick and green ' +
      'And none but fools do wear it; cast it off. ' +
      'It is my lady, O, it is my love! ' +
      'O, that she knew she were! ' +
      'She speaks yet she says nothing: what of that? ' +
      'Her eye discourses; I will answer it. ' +
      "I am too bold, 'tis not to me she speaks: " +
      'Two of the fairest stars in all the heaven, ' +
      'Having some business, do entreat her eyes ' +
      'To twinkle in their spheres till they return. ' +
      'What if her eyes were there, they in her head? ' +
      'The brightness of her cheek would shame those stars, ' +
      'As daylight doth a lamp; her eyes in heaven ' +
      'Would through the airy region stream so bright ' +
      'That birds would sing and think it were not night. ' +
      'See, how she leans her cheek upon her hand! ' +
      'O, that I were a glove upon that hand, ' +
      'That I might touch that cheek!\n' +
      '> End quote\n\n' +
      'Did that flow correctly?\n';
    const expected = `A passage from Shakespear's Romeo + Juliet:
> Begin quote
>> But, soft! what light through yonder window breaks? It is the east, and  
>> Juliet is the sun. Arise, fair sun, and kill the envious moon, Who is  
>> already sick and pale with grief, That thou her maid art far more fair  
>> than she: Be not her maid, since she is envious; Her vestal livery is but  
>> sick and green And none but fools do wear it; cast it off. It is my lady,  
>> O, it is my love! O, that she knew she were! She speaks yet she says  
>> nothing: what of that? Her eye discourses; I will answer it. I am too  
>> bold, 'tis not to me she speaks: Two of the fairest stars in all the  
>> heaven, Having some business, do entreat her eyes To twinkle in their  
>> spheres till they return. What if her eyes were there, they in her head?  
>> The brightness of her cheek would shame those stars, As daylight doth a  
>> lamp; her eyes in heaven Would through the airy region stream so bright  
>> That birds would sing and think it were not night. See, how she leans her  
>> cheek upon her hand! O, that I were a glove upon that hand, That I might  
>> touch that cheek!
> End quote

Did that flow correctly?
`;
    let converter: TextToFlowed | FlowedToText = new TextToFlowed();
    let result = converter.convert(text).replace(/\r\n/g, '\n');

    expect(result).toBe(expected);

    converter = new FlowedToText();
    converter.deleteSpace = true;
    result = converter.convert(expected).replace(/\r\n/g, '\n');

    expect(result).toBe(text);
  });

  test('ReadLine empty input', () => {
    // extra (not in C#): TextReader.ReadLine returns zero lines for empty input.
    expect(new TextToFlowed().convert('')).toBe('');
  });

  test('ReadLine trailing newline', () => {
    // extra (not in C#): trailing newline does not produce a final empty line.
    expect(new TextToFlowed().convert('line\n')).toBe('line\n');
  });
});
