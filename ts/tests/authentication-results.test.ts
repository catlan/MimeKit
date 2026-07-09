import { describe, expect, test } from 'vitest';
import {
  AuthenticationMethodProperty,
  AuthenticationMethodResult,
  AuthenticationResults,
  FormatOptions,
  unwrap,
} from '../src/index.js';

const ascii = new TextEncoder();

function unixOptions(): FormatOptions {
  const options = FormatOptions.default.clone();
  options.newLineFormat = 'unix';
  return options;
}

function encodeHeader(authres: AuthenticationResults, field = 'Authentication-Results:'): string {
  const builder = [field];
  authres.encode(unixOptions(), builder, field.length);
  return builder.join('');
}

function encodeValue(authres: AuthenticationResults, field = 'Authentication-Results:'): string {
  const builder: string[] = [];
  authres.encode(unixOptions(), builder, field.length);
  return builder.join('');
}

describe('AuthenticationResults', () => {
  test('TestArgumentExceptions', () => {
    const buffer = new Uint8Array(16);
    expect(() => new AuthenticationResults(null as never)).toThrow(TypeError);
    expect(() => new AuthenticationMethodResult(null as never)).toThrow(TypeError);
    expect(() => new AuthenticationMethodResult(null as never, 'result')).toThrow(TypeError);
    expect(() => new AuthenticationMethodResult('method', null as never)).toThrow(TypeError);
    expect(() => new AuthenticationMethodProperty(null as never, 'property', 'value')).toThrow(TypeError);
    expect(() => new AuthenticationMethodProperty('ptype', null as never, 'value')).toThrow(TypeError);
    expect(() => new AuthenticationMethodProperty('ptype', 'property', null as never)).toThrow(TypeError);
    expect(AuthenticationResults.parse(null as never).ok).toBe(false);
    expect(AuthenticationResults.parse(buffer, -1, 0).ok).toBe(false);
    expect(AuthenticationResults.parse(buffer, 0, -1).ok).toBe(false);
    expect(AuthenticationResults.tryParse(null).ok).toBe(false);
    expect(AuthenticationResults.tryParse(buffer, -1, 0).ok).toBe(false);
    expect(AuthenticationResults.tryParse(buffer, 0, -1).ok).toBe(false);
  });

  test('TestEncodeLongAuthServId', () => {
    const authservid = 'this-is-a-really-really-really-long-authserv-identifier-that-is-78-octets-long';
    const authres = new AuthenticationResults(authservid);
    authres.results.push(new AuthenticationMethodResult('dkim', 'pass'));
    authres.results.push(new AuthenticationMethodResult('spf', 'pass'));
    expect(encodeHeader(authres)).toBe('Authentication-Results:\n\t' + authservid + ';\n\tdkim=pass; spf=pass\n');
  });

  test('TestEncodeLongAuthServIdWithVersion', () => {
    const authservid = 'this-is-a-really-really-really-long-authserv-identifier-that-is-78-octets-long';
    const authres = new AuthenticationResults(authservid);
    authres.results.push(new AuthenticationMethodResult('dkim', 'pass'));
    authres.results.push(new AuthenticationMethodResult('spf', 'pass'));
    authres.version = 1;
    expect(encodeHeader(authres)).toBe('Authentication-Results:\n\t' + authservid + '\n\t1; dkim=pass; spf=pass\n');
  });

  test('TestEncodeLongResultMethod', () => {
    const authres = new AuthenticationResults('lists.example.com');
    authres.results.push(new AuthenticationMethodResult('really-long-method-name', 'really-long-value'));
    authres.version = 1;
    expect(encodeHeader(authres)).toBe('Authentication-Results: lists.example.com 1;\n\treally-long-method-name=really-long-value\n');
  });

  test('TestEncodeLongResultMethodWithVersion', () => {
    const authres = new AuthenticationResults('lists.example.com');
    const result = new AuthenticationMethodResult('really-long-method-name', 'really-long-value');
    result.version = 1;
    authres.results.push(result);
    authres.version = 1;
    expect(encodeHeader(authres)).toBe('Authentication-Results: lists.example.com 1;\n\treally-long-method-name/1=really-long-value\n');
  });

  test('TestEncodeQuotedPropertyValue', () => {
    const authres = new AuthenticationResults('lists.example.com');
    const result = new AuthenticationMethodResult('foo', 'pass');
    result.resultComment = '2 of 3 tests OK';
    result.properties.push(new AuthenticationMethodProperty('ptype', 'prop', 'value1;value2'));
    authres.results.push(result);
    authres.version = 1;
    expect(encodeHeader(authres)).toBe('Authentication-Results: lists.example.com 1;\n\tfoo=pass (2 of 3 tests OK) ptype.prop="value1;value2"\n');
  });

  test('TestEncodeLongResultMethodWithVersionAndComment', () => {
    const authres = new AuthenticationResults('lists.example.com');
    const result = new AuthenticationMethodResult('really-long-method-name', 'really-long-value');
    result.resultComment = 'this is a really long result comment';
    result.version = 1;
    authres.results.push(result);
    authres.version = 1;
    expect(encodeHeader(authres)).toBe('Authentication-Results: lists.example.com 1;\n\treally-long-method-name/1=really-long-value\n\t(this is a really long result comment)\n');
  });

  test('TestEncodeLongResultMethodWithVersionAndCommentAndReason', () => {
    const authres = new AuthenticationResults('lists.example.com');
    const result = new AuthenticationMethodResult('really-really-really-long-method-name', 'really-really-really-long-value');
    result.resultComment = 'this is a really really long result comment';
    result.reason = 'this is a really really really long reason';
    result.version = 214748367;
    result.properties.push(new AuthenticationMethodProperty('this-is-a-really-really-long-ptype', 'this-is-a-really-really-long-property', 'this-is-a-really-really-long-value'));
    authres.results.push(result);
    authres.version = 1;
    expect(encodeHeader(authres)).toBe('Authentication-Results: lists.example.com 1;\n\treally-really-really-long-method-name/214748367=\n\treally-really-really-long-value (this is a really really long result comment)\n\treason="this is a really really really long reason"\n\tthis-is-a-really-really-long-ptype.this-is-a-really-really-long-property=\n\tthis-is-a-really-really-long-value\n');
  });

  test('TestEncodeLongOffice365RandomDomainTokensAndAction', () => {
    const authres = new AuthenticationResults('lists.example.com');
    authres.version = 1;
    const spf = new AuthenticationMethodResult('spf', 'fail');
    spf.resultComment = 'sender IP is 1.1.1.1';
    spf.properties.push(new AuthenticationMethodProperty('smtp', 'mailfrom', 'eu-west-1.amazonses.com'));
    authres.results.push(spf);
    const dkim = new AuthenticationMethodResult('dkim', 'pass');
    dkim.office365AuthenticationServiceIdentifier = 'really-really-long-receivingdomain.com';
    dkim.resultComment = 'signature was verified';
    dkim.properties.push(new AuthenticationMethodProperty('header', 'd', 'domain.com'));
    authres.results.push(dkim);
    const dmarc = new AuthenticationMethodResult('dmarc', 'bestguesspass');
    dmarc.office365AuthenticationServiceIdentifier = 'another-really-really-long-receivingdomain.com';
    dmarc.action = 'none';
    dmarc.properties.push(new AuthenticationMethodProperty('header', 'from', 'domain.com'));
    authres.results.push(dmarc);
    expect(encodeHeader(authres)).toBe('Authentication-Results: lists.example.com 1;\n\tspf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com;\n\treally-really-long-receivingdomain.com; dkim=pass (signature was verified)\n\theader.d=domain.com; another-really-really-long-receivingdomain.com;\n\tdmarc=bestguesspass action="none" header.from=domain.com\n');
  });

  test('TestParseArcAuthenticationResults', () => {
    const input = "i=1; example.com; foo=pass";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("i=1; example.com; foo=pass");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("i=1; example.com; foo=pass");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("i=1; example.com; foo=pass");
    expect(encodeValue(authres, "ARC-Authentication-Results:")).toBe(" i=1; example.com; foo=pass\n");
  });

  test('TestParseAuthServId', () => {
    const input = "example.org";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.org; none");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.org; none");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.org; none");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.org; none\n");
  });

  test('TestParseAuthServIdSemicolon', () => {
    const input = "example.org;";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.org; none");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.org; none");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.org; none");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.org; none\n");
  });

  test('TestParseAuthServIdWithVersion', () => {
    const input = "example.org 1";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.org 1; none");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.org 1; none");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.org 1; none");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.org 1; none\n");
  });

  test('TestParseAuthServIdWithVersionAndSemicolon', () => {
    const input = "example.org 1;";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.org 1; none");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.org 1; none");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.org 1; none");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.org 1; none\n");
  });

  test('TestParseNoAuthServId', () => {
    const input = "spf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com; dkim=pass (signature was verified) header.d=domain.com; dmarc=bestguesspass header.from=domain.com";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("spf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com; dkim=pass (signature was verified) header.d=domain.com; dmarc=bestguesspass header.from=domain.com");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("spf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com; dkim=pass (signature was verified) header.d=domain.com; dmarc=bestguesspass header.from=domain.com");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("spf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com; dkim=pass (signature was verified) header.d=domain.com; dmarc=bestguesspass header.from=domain.com");
    expect(encodeValue(authres, "Authentication-Results:")).toBe("\n\tspf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com;\n\tdkim=pass (signature was verified) header.d=domain.com;\n\tdmarc=bestguesspass header.from=domain.com\n");
  });

  test('TestParseNoResults', () => {
    const input = "example.org 1; none";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.org 1; none");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.org 1; none");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.org 1; none");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.org 1; none\n");
  });

  test('TestParseSimple', () => {
    const input = "example.com; foo=pass";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; foo=pass");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; foo=pass");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; foo=pass");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; foo=pass\n");
  });

  test('TestParseSimpleWithComment', () => {
    const input = "example.com; foo=pass (2 of 3 tests OK)";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; foo=pass (2 of 3 tests OK)");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; foo=pass (2 of 3 tests OK)");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; foo=pass (2 of 3 tests OK)");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; foo=pass (2 of 3 tests OK)\n");
  });

  test('TestParseSimpleWithProperty1', () => {
    const input = "example.com; spf=pass smtp.mailfrom=example.net";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; spf=pass smtp.mailfrom=example.net");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; spf=pass smtp.mailfrom=example.net");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; spf=pass smtp.mailfrom=example.net");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; spf=pass smtp.mailfrom=example.net\n");
  });

  test('TestParseSimpleWithProperty2', () => {
    const input = "example.com; spf=pass smtp.mailfrom=@example.net";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; spf=pass smtp.mailfrom=@example.net");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; spf=pass smtp.mailfrom=@example.net");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; spf=pass smtp.mailfrom=@example.net");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; spf=pass smtp.mailfrom=@example.net\n");
  });

  test('TestParseSimpleWithProperty3', () => {
    const input = "example.com; spf=pass smtp.mailfrom=local-part@example.net";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; spf=pass smtp.mailfrom=local-part@example.net");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; spf=pass smtp.mailfrom=local-part@example.net");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; spf=pass smtp.mailfrom=local-part@example.net");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com;\n\tspf=pass smtp.mailfrom=local-part@example.net\n");
  });

  test('TestParseSimpleWithQuotedPropertyValue', () => {
    const input = "example.com; method=pass ptype.prop=\"value1;value2\"";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; method=pass ptype.prop=\"value1;value2\"");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; method=pass ptype.prop=\"value1;value2\"");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; method=pass ptype.prop=\"value1;value2\"");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; method=pass ptype.prop=\"value1;value2\"\n");
  });

  test('TestParseSimpleWithReason', () => {
    const input = "example.com; spf=pass reason=good";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; spf=pass reason=\"good\"");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; spf=pass reason=\"good\"");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; spf=pass reason=\"good\"");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; spf=pass reason=\"good\"\n");
  });

  test('TestParseSimpleWithReasonSemiColon', () => {
    const input = "example.com; spf=pass reason=good; ";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; spf=pass reason=\"good\"");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; spf=pass reason=\"good\"");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; spf=pass reason=\"good\"");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; spf=pass reason=\"good\"\n");
  });

  test('TestParseSimpleWithQuotedReason', () => {
    const input = "example.com; spf=pass reason=\"good stuff\"";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; spf=pass reason=\"good stuff\"");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; spf=pass reason=\"good stuff\"");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; spf=pass reason=\"good stuff\"");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; spf=pass reason=\"good stuff\"\n");
  });

  test('TestParseSimpleWithQuotedReasonSemiColon', () => {
    const input = "example.com; spf=pass reason=\"good stuff\"";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; spf=pass reason=\"good stuff\"");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; spf=pass reason=\"good stuff\"");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; spf=pass reason=\"good stuff\"");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com; spf=pass reason=\"good stuff\"\n");
  });

  test('TestParseMethodWithMultipleProperties', () => {
    const input = "example.com; spf=pass ptype1.prop1=value1 ptype2.prop2=value2";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; spf=pass ptype1.prop1=value1 ptype2.prop2=value2");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; spf=pass ptype1.prop1=value1 ptype2.prop2=value2");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; spf=pass ptype1.prop1=value1 ptype2.prop2=value2");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com;\n\tspf=pass ptype1.prop1=value1 ptype2.prop2=value2\n");
  });

  test('TestParseMultipleMethods', () => {
    const input = "example.com; auth=pass (cram-md5) smtp.auth=sender@example.net; spf=pass smtp.mailfrom=example.net; sender-id=pass header.from=example.net";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; auth=pass (cram-md5) smtp.auth=sender@example.net; spf=pass smtp.mailfrom=example.net; sender-id=pass header.from=example.net");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; auth=pass (cram-md5) smtp.auth=sender@example.net; spf=pass smtp.mailfrom=example.net; sender-id=pass header.from=example.net");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; auth=pass (cram-md5) smtp.auth=sender@example.net; spf=pass smtp.mailfrom=example.net; sender-id=pass header.from=example.net");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com;\n\tauth=pass (cram-md5) smtp.auth=sender@example.net;\n\tspf=pass smtp.mailfrom=example.net; sender-id=pass header.from=example.net\n");
  });

  test('TestParseMultipleMethodsWithReasons', () => {
    const input = "example.com; dkim=pass reason=\"good signature\" header.i=@mail-router.example.net; dkim=fail reason=\"bad signature\" header.i=@newyork.example.com";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("example.com; dkim=pass reason=\"good signature\" header.i=@mail-router.example.net; dkim=fail reason=\"bad signature\" header.i=@newyork.example.com");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("example.com; dkim=pass reason=\"good signature\" header.i=@mail-router.example.net; dkim=fail reason=\"bad signature\" header.i=@newyork.example.com");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("example.com; dkim=pass reason=\"good signature\" header.i=@mail-router.example.net; dkim=fail reason=\"bad signature\" header.i=@newyork.example.com");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" example.com;\n\tdkim=pass reason=\"good signature\" header.i=@mail-router.example.net;\n\tdkim=fail reason=\"bad signature\" header.i=@newyork.example.com\n");
  });

  test('TestParseHeavilyCommentedExample', () => {
    const input = "foo.example.net (foobar) 1 (baz); dkim (Because I like it) / 1 (One yay) = (wait for it) fail policy (A dot can go here) . (like that) expired (this surprised me) = (as I wasn't expecting it) 1362471462";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("foo.example.net 1; dkim/1=fail policy.expired=1362471462");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("foo.example.net 1; dkim/1=fail policy.expired=1362471462");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("foo.example.net 1; dkim/1=fail policy.expired=1362471462");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" foo.example.net 1;\n\tdkim/1=fail policy.expired=1362471462\n");
  });

  test('TestParseMethodPropertyValueWithSlash', () => {
    const input = "i=2; test.com; dkim=pass header.d=test.com header.s=selector1 header.b=Iww3/TIUS; dmarc=pass (policy=reject) header.from=test.com; spf=pass (test.com: domain of no-reply@test.com designates 1.1.1.1 as permitted sender) smtp.mailfrom=no-reply@test.com";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("i=2; test.com; dkim=pass header.d=test.com header.s=selector1 header.b=Iww3/TIUS; dmarc=pass (policy=reject) header.from=test.com; spf=pass (test.com: domain of no-reply@test.com designates 1.1.1.1 as permitted sender) smtp.mailfrom=no-reply@test.com");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("i=2; test.com; dkim=pass header.d=test.com header.s=selector1 header.b=Iww3/TIUS; dmarc=pass (policy=reject) header.from=test.com; spf=pass (test.com: domain of no-reply@test.com designates 1.1.1.1 as permitted sender) smtp.mailfrom=no-reply@test.com");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("i=2; test.com; dkim=pass header.d=test.com header.s=selector1 header.b=Iww3/TIUS; dmarc=pass (policy=reject) header.from=test.com; spf=pass (test.com: domain of no-reply@test.com designates 1.1.1.1 as permitted sender) smtp.mailfrom=no-reply@test.com");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" i=2; test.com;\n\tdkim=pass header.d=test.com header.s=selector1 header.b=Iww3/TIUS;\n\tdmarc=pass (policy=reject) header.from=test.com; spf=pass\n\t(test.com: domain of no-reply@test.com designates 1.1.1.1 as permitted sender)\n\tsmtp.mailfrom=no-reply@test.com\n");
  });

  test('TestParseOffice365RandomDomainTokensAndAction', () => {
    const input = "spf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com; receivingdomain.com; dkim=pass (signature was verified) header.d=domain.com;domain1.com; dmarc=bestguesspass action=none header.from=domain.com;";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("spf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com; receivingdomain.com; dkim=pass (signature was verified) header.d=domain.com; domain1.com; dmarc=bestguesspass action=\"none\" header.from=domain.com");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("spf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com; receivingdomain.com; dkim=pass (signature was verified) header.d=domain.com; domain1.com; dmarc=bestguesspass action=\"none\" header.from=domain.com");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("spf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com; receivingdomain.com; dkim=pass (signature was verified) header.d=domain.com; domain1.com; dmarc=bestguesspass action=\"none\" header.from=domain.com");
    expect(encodeValue(authres, "Authentication-Results:")).toBe("\n\tspf=fail (sender IP is 1.1.1.1) smtp.mailfrom=eu-west-1.amazonses.com;\n\treceivingdomain.com; dkim=pass (signature was verified) header.d=domain.com;\n\tdomain1.com; dmarc=bestguesspass action=\"none\" header.from=domain.com\n");
  });

  test('TestParseOffice365RandomDomainTokensAndEmptyPropertyValue', () => {
    const input = "spf=temperror (sender IP is 1.1.1.1) smtp.helo=tes.test.ru; mydomain.com; dkim=none (message not signed) header.d=none;mydomain.com; dmarc=none action=none header.from=;";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("spf=temperror (sender IP is 1.1.1.1) smtp.helo=tes.test.ru; mydomain.com; dkim=none (message not signed) header.d=none; mydomain.com; dmarc=none action=\"none\" header.from=");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("spf=temperror (sender IP is 1.1.1.1) smtp.helo=tes.test.ru; mydomain.com; dkim=none (message not signed) header.d=none; mydomain.com; dmarc=none action=\"none\" header.from=");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("spf=temperror (sender IP is 1.1.1.1) smtp.helo=tes.test.ru; mydomain.com; dkim=none (message not signed) header.d=none; mydomain.com; dmarc=none action=\"none\" header.from=");
    expect(encodeValue(authres, "Authentication-Results:")).toBe("\n\tspf=temperror (sender IP is 1.1.1.1) smtp.helo=tes.test.ru;\n\tmydomain.com; dkim=none (message not signed) header.d=none;\n\tmydomain.com; dmarc=none action=\"none\" header.from=\n");
  });

  test('TestParseGmailAuthenticationResults', () => {
    const input = "mx.google.com; dkim=pass header.i=@sender.com header.s=15ca3b75e6386151 header.b=qsGI6Y43; gateway.spf=pass (google.com: domain receiver.com configured 1.2.3.4 as internal address) smtp.mailfrom=mail@from.com smtp.remote-ip=1.2.3.4 policy.d=receiver.com";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("mx.google.com; dkim=pass header.i=@sender.com header.s=15ca3b75e6386151 header.b=qsGI6Y43; gateway.spf=pass (google.com: domain receiver.com configured 1.2.3.4 as internal address) smtp.mailfrom=mail@from.com smtp.remote-ip=1.2.3.4 policy.d=receiver.com");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("mx.google.com; dkim=pass header.i=@sender.com header.s=15ca3b75e6386151 header.b=qsGI6Y43; gateway.spf=pass (google.com: domain receiver.com configured 1.2.3.4 as internal address) smtp.mailfrom=mail@from.com smtp.remote-ip=1.2.3.4 policy.d=receiver.com");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("mx.google.com; dkim=pass header.i=@sender.com header.s=15ca3b75e6386151 header.b=qsGI6Y43; gateway.spf=pass (google.com: domain receiver.com configured 1.2.3.4 as internal address) smtp.mailfrom=mail@from.com smtp.remote-ip=1.2.3.4 policy.d=receiver.com");
  });

  test('TestParseMethodResultWithUnderscore', () => {
    const input = " atlas122.free.mail.gq1.yahoo.com; dkim=dkim_pass header.i=@news.aegeanair.com header.s=@aegeanair2; spf=pass smtp.mailfrom=news.aegeanair.com; dmarc=success(p=REJECT) header.from=news.aegeanair.com;";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("atlas122.free.mail.gq1.yahoo.com; dkim=dkim_pass header.i=@news.aegeanair.com header.s=@aegeanair2; spf=pass smtp.mailfrom=news.aegeanair.com; dmarc=success (p=REJECT) header.from=news.aegeanair.com");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("atlas122.free.mail.gq1.yahoo.com; dkim=dkim_pass header.i=@news.aegeanair.com header.s=@aegeanair2; spf=pass smtp.mailfrom=news.aegeanair.com; dmarc=success (p=REJECT) header.from=news.aegeanair.com");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("atlas122.free.mail.gq1.yahoo.com; dkim=dkim_pass header.i=@news.aegeanair.com header.s=@aegeanair2; spf=pass smtp.mailfrom=news.aegeanair.com; dmarc=success (p=REJECT) header.from=news.aegeanair.com");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" atlas122.free.mail.gq1.yahoo.com;\n\tdkim=dkim_pass header.i=@news.aegeanair.com header.s=@aegeanair2;\n\tspf=pass smtp.mailfrom=news.aegeanair.com;\n\tdmarc=success (p=REJECT) header.from=news.aegeanair.com\n");
  });

  test('TestParsePropertyWithEqualSignInValue', () => {
    const input = "i=1; relay.mailrelay.com; dkim=pass header.d=domaina.com header.s=sfdc header.b=abcefg; dmarc=pass (policy=quarantine) header.from=domaina.com; spf=pass (relay.mailrelay.com: domain of support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com designates 1.1.1.1 as permitted sender) smtp.mailfrom=support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com";
    const buffer = ascii.encode(input);
    const authres = unwrap(AuthenticationResults.tryParse(buffer, 0, buffer.length));
    expect(authres.toString()).toBe("i=1; relay.mailrelay.com; dkim=pass header.d=domaina.com header.s=sfdc header.b=abcefg; dmarc=pass (policy=quarantine) header.from=domaina.com; spf=pass (relay.mailrelay.com: domain of support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com designates 1.1.1.1 as permitted sender) smtp.mailfrom=support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com");
    expect(unwrap(AuthenticationResults.parse(buffer)).toString()).toBe("i=1; relay.mailrelay.com; dkim=pass header.d=domaina.com header.s=sfdc header.b=abcefg; dmarc=pass (policy=quarantine) header.from=domaina.com; spf=pass (relay.mailrelay.com: domain of support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com designates 1.1.1.1 as permitted sender) smtp.mailfrom=support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com");
    expect(unwrap(AuthenticationResults.parse(buffer, 0, buffer.length)).toString()).toBe("i=1; relay.mailrelay.com; dkim=pass header.d=domaina.com header.s=sfdc header.b=abcefg; dmarc=pass (policy=quarantine) header.from=domaina.com; spf=pass (relay.mailrelay.com: domain of support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com designates 1.1.1.1 as permitted sender) smtp.mailfrom=support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com");
    expect(encodeValue(authres, "Authentication-Results:")).toBe(" i=1; relay.mailrelay.com;\n\tdkim=pass header.d=domaina.com header.s=sfdc header.b=abcefg;\n\tdmarc=pass (policy=quarantine) header.from=domaina.com; spf=pass\n\t(relay.mailrelay.com: domain of support=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com designates 1.1.1.1 as permitted sender)\n\tsmtp.mailfrom=\n\tsupport=domaina.com__0-1q6woix34obtbu@823lwd90ky2ahf.mail_sender.com\n");
  });

  test('TestParseFailureAuthServIdIncompleteQString', () => {
    const input = " \"quoted-authserv-id";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(1);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(1);
  });

  test('TestParseFailureIncompleteComment', () => {
    const input = " (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(1);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(1);
  });

  test('TestParseFailureIncompleteCommentAfterAuthServId', () => {
    const input = " authserv-id (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(13);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(13);
  });

  test('TestParseFailureIncompleteCommentAfterAuthServIdVersion', () => {
    const input = " authserv-id 1 (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(15);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(15);
  });

  test('TestParseFailureIncompleteCommentAfterInstanceEquals', () => {
    const input = " i= (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(4);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(4);
  });

  test('TestParseFailureIncompleteCommentAfterInstanceEqualsValue', () => {
    const input = " i=1 (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(5);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(5);
  });

  test('TestParseFailureIncompleteCommentAfterInstanceEqualsValueSemiColon', () => {
    const input = " i=1; (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(6);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(6);
  });

  test('TestParseFailureIncompleteCommentBeforeMethod', () => {
    const input = " authserv-id; (incomplete comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(14);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(14);
  });

  test('TestParseFailureIncompleteCommentAfterMethod', () => {
    const input = " authserv-id; method (incomplete comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(21);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(21);
  });

  test('TestParseFailureIncompleteCommentAfterMethodEquals', () => {
    const input = " authserv-id; method= (incomplete comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(22);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(22);
  });

  test('TestParseFailureIncompleteCommentAfterMethodEqualsResult', () => {
    const input = " authserv-id; method=result (incomplete comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(28);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(28);
  });

  test('TestParseFailureIncompleteCommentAfterMethodEqualsResultComment', () => {
    const input = " authserv-id; method=result (comment) (incomplete comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(38);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(38);
  });

  test('TestParseFailureIncompleteCommentAfterMethodSlash', () => {
    const input = " authserv-id; method/ (incomplete comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(22);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(22);
  });

  test('TestParseFailureIncompleteCommentAfterMethodVersion', () => {
    const input = " authserv-id; method/1 (incomplete comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(23);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(23);
  });

  test('TestParseFailureIncompleteCommentAfterMethodVersionEquals', () => {
    const input = " authserv-id; method/1= (incomplete comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(24);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(24);
  });

  test('TestParseFailureIncompleteCommentAfterReason', () => {
    const input = "authserv-id; method=pass reason (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(32);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(32);
  });

  test('TestParseFailureIncompleteCommentAfterReasonEquals', () => {
    const input = "authserv-id; method=pass reason= (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(33);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(33);
  });

  test('TestParseFailureIncompleteCommentAfterReasonEqualsValue', () => {
    const input = "authserv-id; method=pass reason=value (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(38);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(38);
  });

  test('TestParseFailureIncompleteCommentAfterPType', () => {
    const input = "authserv-id; method=pass ptype (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(31);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(31);
  });

  test('TestParseFailureIncompleteCommentAfterPTypeDot', () => {
    const input = "authserv-id; method=pass ptype. (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(32);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(32);
  });

  test('TestParseFailureIncompleteCommentAfterPTypeDotProp', () => {
    const input = "authserv-id; method=pass ptype.prop (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(36);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(36);
  });

  test('TestParseFailureIncompleteCommentAfterPTypeDotPropEquals', () => {
    const input = "authserv-id; method=pass ptype.prop= (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(37);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(37);
  });

  test('TestParseFailureIncompleteCommentAfterPTypeDotPropEqualsValue', () => {
    const input = "authserv-id; method=pass ptype.prop=value (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(42);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(42);
  });

  test('TestParseFailureIncompleteArcInstance', () => {
    const input = "i=";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(2);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(2);
  });

  test('TestParseFailureInvalidArcInstance', () => {
    const input = "i=abc; authserv-id";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(2);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(2);
  });

  test('TestParseFailureUnexpectedTokenAfterArcInstance', () => {
    const input = "i=1: authserv-id";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(3);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(3);
  });

  test('TestParseFailureOnlyArcInstance', () => {
    const input = "i=5";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(2);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(2);
  });

  test('TestParseFailureOnlyArcInstanceSemicolon', () => {
    const input = "i=5;";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(4);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(4);
  });

  test('TestParseFailureMultipleLeadingArcInstance', () => {
    const input = "i=5; i=1";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(5);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(5);
  });

  test('TestParseFailureInvalidVersion', () => {
    const input = "authserv-id x";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(12);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(12);
  });

  test('TestParseFailureInvalidTokenAfterVersion', () => {
    const input = "authserv-id 1 x";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(14);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(14);
  });

  test('TestParseFailureInvalidMethod1', () => {
    const input = "authserv-id; .";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(13);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(13);
  });

  test('TestParseFailureInvalidMethod2', () => {
    const input = "authserv-id; abc";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(13);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(13);
  });

  test('TestParseFailureInvalidMethod3', () => {
    const input = "authserv-id; abc def";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(13);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(13);
  });

  test('TestParseFailureInvalidMethodVersion1', () => {
    const input = "authserv-id; abc/1 ";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(13);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(13);
  });

  test('TestParseFailureInvalidMethodVersion2', () => {
    const input = "authserv-id; abc/1.0=pass";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(13);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(13);
  });

  test('TestParseFailureInvalidMethodVersion3', () => {
    const input = "authserv-id; abc/def=pass";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(17);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(17);
  });

  test('TestParseFailureIncompleteMethod', () => {
    const input = "authserv-id; abc=";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(13);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(13);
  });

  test('TestParseFailureMethodEqualNonKeyword', () => {
    const input = "authserv-id; abc=.";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(17);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(17);
  });

  test('TestParseFailureNoResultWithMore', () => {
    const input = "authserv-id; none; method=pass";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(13);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(13);
  });

  test('TestParseFailureNoResultAfterMethods', () => {
    const input = "authserv-id; method=pass; none";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(26);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(26);
  });

  test('TestParseFailureIncompleteResultComment', () => {
    const input = "authserv-id; method=pass (truncated comment";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureInvalidTokenAfterResult', () => {
    const input = "authserv-id; method=pass .";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureIncompleteReason1', () => {
    const input = "authserv-id; method=pass reason";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureIncompleteReason2', () => {
    const input = "authserv-id; method=pass reason=";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(32);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(32);
  });

  test('TestParseFailureIncompleteReason3', () => {
    const input = "authserv-id; method=pass reason=\"this is some text";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(32);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(32);
  });

  test('TestParseFailureIncompleteReason4', () => {
    const input = "authserv-id; method=pass reason=;";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(32);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(32);
  });

  test('TestParseFailureInvalidReason', () => {
    const input = "authserv-id; method=pass reason .";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureInvalidPropTypeAfterReason', () => {
    const input = "authserv-id; method=pass reason=\"because I said so\" .;";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(52);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(52);
  });

  test('TestParseFailureIncompleteProperty1', () => {
    const input = "authserv-id; method=pass ptype";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureIncompleteProperty2', () => {
    const input = "authserv-id; method=pass ptype.";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureIncompleteProperty3', () => {
    const input = "authserv-id; method=pass ptype.prop";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureIncompleteProperty4', () => {
    const input = "authserv-id; method=pass ptype.prop=";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureIncompleteProperty5', () => {
    const input = "authserv-id; method=pass ptype.prop=\"incomplete qstring";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureInvalidProperty1', () => {
    const input = "authserv-id; method=pass ptype;";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureInvalidProperty2', () => {
    const input = "authserv-id; method=pass ptype.prop;";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(25);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(25);
  });

  test('TestParseFailureInvalidProperty3', () => {
    const input = "authserv-id; method=pass ptype.prop=value .";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(42);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(42);
  });

  test('TestParseFailureInvalidProperty4', () => {
    const input = "authserv-id; method=pass ptype..";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(31);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(31);
  });

  test('TestParseFailureInvalidOffice365AuthServId', () => {
    const input = "authserv-id; method=pass ptype.prop=pvalue; invalid.office365.domain..; method=pass";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(44);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(44);
  });

  test('TestParseFailureTruncatedOffice365AuthServId', () => {
    const input = "authserv-id; method=pass ptype.prop=pvalue; truncated.office365.domain";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(44);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(44);
  });

  test('TestParseFailureUnexpectedTokenAfterOffice365AuthServId', () => {
    const input = "authserv-id; method=pass ptype.prop=pvalue; office365.domain :";
    const buffer = ascii.encode(input);
    const tried = AuthenticationResults.tryParse(buffer);
    expect(tried.ok).toBe(false);
    const parsed = AuthenticationResults.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(61);
    const parsedWithRange = AuthenticationResults.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(61);
  });


});
