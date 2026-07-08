import { describe, expect, test } from 'vitest';
import { HtmlAttribute, HtmlAttributeCollection, HtmlAttributeId } from '../../src/index.js';

function makeItems(): HtmlAttribute[] {
  return [
    new HtmlAttribute(HtmlAttributeId.Alt, 'This is some alt text.'),
    new HtmlAttribute(HtmlAttributeId.Text, 'And this is the text.'),
  ];
}

describe('HtmlAttributeCollection', () => {
  test('TestArgumentExceptions', () => {
    const collection = new HtmlAttributeCollection(makeItems());

    expect(() => new HtmlAttributeCollection(null as unknown as Iterable<HtmlAttribute>)).toThrow(TypeError);
    expect(() => collection.add(null as unknown as HtmlAttribute)).toThrow(TypeError);
    expect(() => collection.contains(null as unknown as string)).toThrow(TypeError);
    expect(() => collection.tryGetValue(null as unknown as string)).toThrow(TypeError);
  });

  test('TestEmpty', () => {
    expect(HtmlAttributeCollection.Empty.count).toBe(0);
  });

  test('TestContains', () => {
    const collection = new HtmlAttributeCollection(makeItems());

    expect(collection.contains(HtmlAttributeId.Alt), 'HtmlAttributeId.Alt').toBe(true);
    expect(collection.contains(HtmlAttributeId.Text), 'HtmlAttributeId.Text').toBe(true);
    expect(collection.contains(HtmlAttributeId.Background), 'HtmlAttributeId.Background').toBe(false);

    expect(collection.contains('alt'), 'alt').toBe(true);
    expect(collection.contains('text'), 'text').toBe(true);
    expect(collection.contains('background'), 'background').toBe(false);
  });

  test('TestIndexOf', () => {
    const collection = new HtmlAttributeCollection(makeItems());

    expect(collection.indexOf(HtmlAttributeId.Alt), 'HtmlAttributeId.Alt').toBe(0);
    expect(collection.indexOf(HtmlAttributeId.Text), 'HtmlAttributeId.Text').toBe(1);
    expect(collection.indexOf(HtmlAttributeId.Background), 'HtmlAttributeId.Background').toBe(-1);

    expect(collection.indexOf('alt'), 'alt').toBe(0);
    expect(collection.indexOf('text'), 'text').toBe(1);
    expect(collection.indexOf('background'), 'background').toBe(-1);
  });

  test('TestTryGetValue', () => {
    const collection = new HtmlAttributeCollection(makeItems());

    let attr = collection.tryGetValue(HtmlAttributeId.Alt);
    expect(attr, 'HtmlAttributeId.Alt').not.toBeNull();
    expect(attr!.value, 'HtmlAttributeId.Alt Value').toBe('This is some alt text.');
    attr = collection.tryGetValue(HtmlAttributeId.Text);
    expect(attr, 'HtmlAttributeId.Text').not.toBeNull();
    expect(attr!.value, 'HtmlAttributeId.Text Value').toBe('And this is the text.');
    attr = collection.tryGetValue(HtmlAttributeId.Background);
    expect(attr, 'HtmlAttributeId.Background is not null').toBeNull();

    attr = collection.tryGetValue('alt');
    expect(attr, 'alt').not.toBeNull();
    expect(attr!.value, 'alt Value').toBe('This is some alt text.');
    attr = collection.tryGetValue('text');
    expect(attr, 'text').not.toBeNull();
    expect(attr!.value, 'text Value').toBe('And this is the text.');
    attr = collection.tryGetValue('background');
    expect(attr, 'background is not null').toBeNull();
  });

  test('TestEnumerator', () => {
    const items = makeItems();
    const collection = new HtmlAttributeCollection(items);
    let index = 0;

    for (const attr of collection) {
      expect(attr, `iterator index = ${index}`).toBe(items[index]);
      index++;
    }
    expect(index).toBe(items.length);
  });
});
