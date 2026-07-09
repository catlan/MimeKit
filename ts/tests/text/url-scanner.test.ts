import { describe, expect, test } from 'vitest';
import { UrlPatterns, UrlScanner } from '../../src/index.js';

const scanner = new UrlScanner();
for (const pattern of UrlPatterns) scanner.add(pattern);

function testUrlScanner(input: string, expected: string | null): void {
  const match = scanner.scan(input, 0, input.length);
  if (expected === null) {
    expect(match).toBeNull();
  } else {
    expect(match).not.toBeNull();
    expect(input.substring(match!.startIndex, match!.endIndex)).toBe(expected);
  }
}

describe('UrlScannerTests', () => {
  test('TestNoMatch', () => testUrlScanner('This is some text with nothing to match...', null));
  test('TestSimpleAddrspec', () => testUrlScanner('This is some text with a simple.addrspec@example.com in the text...', 'simple.addrspec@example.com'));
  test('TestSimpleAddrspecPeriod', () => testUrlScanner('This is some text with a simple.addrspec@example.com. Did it work?', 'simple.addrspec@example.com'));
  test('TestSimpleQuotedLocalpartAddrspec', () => testUrlScanner('This is some text with a "quoted local part"@example.com in the text...', '"quoted local part"@example.com'));
  test('TestComplexQuotedLocalpartAddrspec', () => testUrlScanner('This is some text with a "quoted \\"local\\" part"@example.com in the text...', '"quoted \\"local\\" part"@example.com'));
  test('TestIPv4Addrspec', () => testUrlScanner('This is some text with a ipv4@[127.0.0.1] in the text...', 'ipv4@[127.0.0.1]'));
  test('TestIPv6LoopbackAddrspec', () => testUrlScanner('This is some text with a ipv6@[IPv6:::1] in the text...', 'ipv6@[IPv6:::1]'));
  test('TestIPv6v4Addrspec', () => testUrlScanner('This is some text with a ipv6@[IPv6:::ffff:10.0.0.1] in the text...', 'ipv6@[IPv6:::ffff:10.0.0.1]'));
  test('TestIPv6Addrspec', () => testUrlScanner('This is some text with a ipv6@[IPv6:FE80:0000:0000:0000:0202:B3FF:FE1E:8329] in the text...', 'ipv6@[IPv6:FE80:0000:0000:0000:0202:B3FF:FE1E:8329]'));
  test('TestSimpleMailToUrl', () => testUrlScanner('This is some text with a mailto:simple.addrspec@example.com in the text...', 'mailto:simple.addrspec@example.com'));
  test('TestMailToWithSimpleQuotedLocalpartAddrspec', () => testUrlScanner('This is some text with a mailto:"quoted local part"@example.com in the text...', 'mailto:"quoted local part"@example.com'));
  test('TestMailToWithComplexQuotedLocalpartAddrspec', () => testUrlScanner('This is some text with a mailto:"quoted \\"local\\" part"@example.com in the text...', 'mailto:"quoted \\"local\\" part"@example.com'));
  test('TestMailToIPv4Addrspec', () => testUrlScanner('This is some text with a mailto:ipv4@[127.0.0.1] in the text...', 'mailto:ipv4@[127.0.0.1]'));
  test('TestMailToIPv6Addrspec', () => testUrlScanner('This is some text with a mailto:ipv6@[IPv6:::1] in the text...', 'mailto:ipv6@[IPv6:::1]'));
  test('TestMailToUrlWithoutAddrspec', () => testUrlScanner('This is some text with a mailto:?subject=Shake%20it%20off,%20shake%20it%20off in the text...', 'mailto:?subject=Shake%20it%20off,%20shake%20it%20off'));
  test('TestMailToUrlWithAddrspecAndSubject', () => testUrlScanner('This is some text with a mailto:taylor.swift@mtv.com?subject=Shake%20it%20off,%20shake%20it%20off in the text...', 'mailto:taylor.swift@mtv.com?subject=Shake%20it%20off,%20shake%20it%20off'));
  test('TestFileUrl', () => testUrlScanner('This is some text with a file:///path/to/some/filename.txt url in it...', 'file:///path/to/some/filename.txt'));
  test('TestSimpleWebUrl', () => testUrlScanner('This is some text with an http://www.xamarin.com url in it...', 'http://www.xamarin.com'));
  test('TestSimpleWebUrlWithPath', () => testUrlScanner('This is some text with an http://www.xamarin.com/logo.png url in it...', 'http://www.xamarin.com/logo.png'));
  test('TestSimpleWebUrlWithPathEnclosedInParens', () => testUrlScanner('This is some text with an (http://www.xamarin.com/logo.png) url in it...', 'http://www.xamarin.com/logo.png'));
  test('TestSimpleWebUrlWithPathEnclosedInCurlyBraces', () => testUrlScanner('This is some text with an {http://www.xamarin.com/logo.png} url in it...', 'http://www.xamarin.com/logo.png'));
  test('TestSimpleWebUrlWithPathEnclosedInAngleBrackets', () => testUrlScanner('This is some text with an <http://www.xamarin.com/logo.png> url in it...', 'http://www.xamarin.com/logo.png'));
  test('TestSimpleWebUrlWithPathEnclosedInSquareBrackets', () => testUrlScanner('This is some text with an [http://www.xamarin.com/logo.png] url in it...', 'http://www.xamarin.com/logo.png'));
  test('TestSimpleWebUrlWithPathEnclosedInPipes', () => testUrlScanner('This is some text with an |http://www.xamarin.com/logo.png| url in it...', 'http://www.xamarin.com/logo.png'));
  test('TestSimpleWebUrlWithPort', () => testUrlScanner('This is some text with an http://www.xamarin.com:80 url in it...', 'http://www.xamarin.com:80'));
  test('TestSimpleWebUrlWithPortAndPath', () => testUrlScanner('This is some text with an http://www.xamarin.com:80/logo.png url in it...', 'http://www.xamarin.com:80/logo.png'));
  test('TestSimpleWebUrlWithQuery', () => testUrlScanner('This is some text with an http://www.xamarin.com?query url in it...', 'http://www.xamarin.com?query'));
  test('TestSimpleWebUrlWithPortAndQuery', () => testUrlScanner('This is some text with an http://www.xamarin.com:80?query url in it...', 'http://www.xamarin.com:80?query'));
  test('TestSimpleWebUrlWithQuestionMark', () => testUrlScanner('Have you seen this website: http://www.xamarin.com? Wow!', 'http://www.xamarin.com'));
  test('TestSimpleWebUrlWithTwoQuestionMarks', () => testUrlScanner('Have you seen this website: http://www.xamarin.com?? Wow!', 'http://www.xamarin.com'));
  test('TestWebUrlWithLeadingNumericDomain', () => testUrlScanner('Have you seen this website: https://23andme.com?? Now you can check if you really are 1/1024 native american!', 'https://23andme.com'));
  test('TestTextEndingWithFtpDot', () => testUrlScanner('This is some text with that ends with ftp.', null));
});
