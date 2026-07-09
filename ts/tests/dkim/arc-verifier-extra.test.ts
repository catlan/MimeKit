// Port of the structurally-special ArcVerifierTests.cs cases (argument
// exceptions, result-object constructors, and the GetArcHeaderSets internals)
// that the codegen (gen-arc-tests.mjs) cannot handle. The regular
// Validate-driven cases are in arc-verifier.test.ts.

import { describe, expect, test } from 'vitest';
import '../../src/index.js';
import { MimeMessage } from '../../src/mime-message.js';
import { Header } from '../../src/header.js';
import { HeaderId } from '../../src/header-id.js';
import { FormatOptions } from '../../src/format-options.js';
import {
  ArcVerifier,
  ArcSignatureValidationResult,
  ArcValidationErrors,
  ArcHeaderValidationResult,
  ArcValidationResult,
} from '../../src/dkim/arc-verifier.js';
import { FormatException } from '../../src/dkim/errors.js';
import { DkimPublicKeyLocator } from './dkim-public-key-locator.js';

const singleSet = `MIME-Version: 1.0
Return-Path: <jqd@d1.example.org>
ARC-Seal: a=rsa-sha256;
    b=dOdFEyhrk/tw5wl3vMIogoxhaVsKJkrkEhnAcq2XqOLSQhPpGzhGBJzR7k1sWGokon3TmQ
    7TX9zQLO6ikRpwd/pUswiRW5DBupy58fefuclXJAhErsrebfvfiueGyhHXV7C1LyJTztywzn
    QGG4SCciU/FTlsJ0QANrnLRoadfps=; cv=none; d=example.org; i=1; s=dummy;
    t=12345
ARC-Message-Signature: a=rsa-sha256;
    b=QsRzR/UqwRfVLBc1TnoQomlVw5qi6jp08q8lHpBSl4RehWyHQtY3uOIAGdghDk/mO+/Xpm
    9JA5UVrPyDV0f+2q/YAHuwvP11iCkBQkocmFvgTSxN8H+DwFFPrVVUudQYZV7UDDycXoM6UE
    cdfzLLzVNPOAHEDIi/uzoV4sUqZ18=;
    bh=KWSe46TZKCcDbH4klJPo+tjk5LWJnVRlP5pvjXFZYLQ=; c=relaxed/relaxed;
    d=example.org; h=from:to:date:subject:mime-version:arc-authentication-results;
    i=1; s=dummy; t=12345
ARC-Authentication-Results: i=1; lists.example.org;
    spf=pass smtp.mfrom=jqd@d1.example;
    dkim=pass (1024-bit key) header.i=@d1.example;
    dmarc=pass
Received: from segv.d1.example (segv.d1.example [72.52.75.15])
    by lists.example.org (8.14.5/8.14.5) with ESMTP id t0EKaNU9010123
    for <arc@example.org>; Thu, 14 Jan 2015 15:01:30 -0800 (PST)
    (envelope-from jqd@d1.example)
Authentication-Results: lists.example.org;
    spf=pass smtp.mfrom=jqd@d1.example;
    dkim=pass (1024-bit key) header.i=@d1.example;
    dmarc=pass
Received: by 10.157.14.6 with HTTP; Tue, 3 Jan 2017 12:22:54 -0800 (PST)
Message-ID: <54B84785.1060301@d1.example.org>
Date: Thu, 14 Jan 2015 15:00:01 -0800
From: John Q Doe <jqd@d1.example.org>
To: arc@dmarc.org
Subject: Example 1

Hey gang,
This is a test message.
--J.
`;

const twoSets = `MIME-Version: 1.0
ARC-Seal: a=rsa-sha256;
    b=IAqZJ5HwfNxxsrn9R4ayQgiu9RibPKEUVevbt7XFTkSh1baJ533D2Z6IZ2NaBreUhDBb2e
    K9Gtcv+eyUhWkD8VTmE6fq/F8CDIK3ScIiJykF8hNL1wpa/mGwWWwBnkozIJGAbTAAX7AgnH
    knAehnSW99TeU0lmib0XmOt4TN3sY=; cv=pass; d=example.org; i=2; s=dummy;
    t=12346
ARC-Message-Signature: a=rsa-sha256;
    b=2cDGNznUmp4YSSThCe9nrQIH2Gpd5qPFw3OU8sWFzZgEQ5UZtaVQifVUXUrsSyEzjro3Ul
    YPPDx+C1K+LbKRlOZ06il4ws2zlPafsrx1piKsKSCUq0KjFs01hYCDBa3tfdyITSfoWu2HHY
    pCjrhPMPH1jruIdBV/5Gk2Fvy+mW8=;
    bh=KWSe46TZKCcDbH4klJPo+tjk5LWJnVRlP5pvjXFZYLQ=; c=relaxed/relaxed;
    d=example.org; h=from:to:date:subject:mime-version:arc-authentication-results;
    i=2; s=dummy; t=12346
ARC-Authentication-Results: i=2; lists.example.org;
    spf=pass smtp.mfrom=jqd@d1.example;
    dkim=pass (1024-bit key) header.i=@d1.example;
    dmarc=pass
Received: by 10.157.11.240 with SMTP id 103csp420860oth;
    Fri, 6 Jan 2017 14:27:31 -0800 (PST)
ARC-Seal: a=rsa-sha256;
    b=dOdFEyhrk/tw5wl3vMIogoxhaVsKJkrkEhnAcq2XqOLSQhPpGzhGBJzR7k1sWGokon3TmQ
    7TX9zQLO6ikRpwd/pUswiRW5DBupy58fefuclXJAhErsrebfvfiueGyhHXV7C1LyJTztywzn
    QGG4SCciU/FTlsJ0QANrnLRoadfps=; cv=none; d=example.org; i=1; s=dummy;
    t=12345
ARC-Message-Signature: a=rsa-sha256;
    b=QsRzR/UqwRfVLBc1TnoQomlVw5qi6jp08q8lHpBSl4RehWyHQtY3uOIAGdghDk/mO+/Xpm
    9JA5UVrPyDV0f+2q/YAHuwvP11iCkBQkocmFvgTSxN8H+DwFFPrVVUudQYZV7UDDycXoM6UE
    cdfzLLzVNPOAHEDIi/uzoV4sUqZ18=;
    bh=KWSe46TZKCcDbH4klJPo+tjk5LWJnVRlP5pvjXFZYLQ=; c=relaxed/relaxed;
    d=example.org; h=from:to:date:subject:mime-version:arc-authentication-results;
    i=1; s=dummy; t=12345
ARC-Authentication-Results: i=1; lists.example.org;
    spf=pass smtp.mfrom=jqd@d1.example;
    dkim=pass (1024-bit key) header.i=@d1.example;
    dmarc=pass
Received: from segv.d1.example (segv.d1.example [72.52.75.15])
    by lists.example.org (8.14.5/8.14.5) with ESMTP id t0EKaNU9010123
    for <arc@example.org>; Thu, 14 Jan 2015 15:01:30 -0800 (PST)
    (envelope-from jqd@d1.example)
Authentication-Results: lists.example.org;
    spf=pass smtp.mfrom=jqd@d1.example;
    dkim=pass (1024-bit key) header.i=@d1.example;
    dmarc=pass
Received: by 10.157.14.6 with HTTP; Tue, 3 Jan 2017 12:22:54 -0800 (PST)
Message-ID: <54B84785.1060301@d1.example.org>
Date: Thu, 14 Jan 2015 15:00:01 -0800
From: John Q Doe <jqd@d1.example.org>
To: arc@dmarc.org
Subject: Example 1

Hey gang,
This is a test message.
--J.
`;

function load(input: string): MimeMessage {
  const r = MimeMessage.load(new TextEncoder().encode(input));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function expectSets(message: MimeMessage, expectedErrors: ArcValidationErrors, label: string): void {
  const result = ArcVerifier.getArcHeaderSets(message, false);
  expect(result.result, label).toBe(ArcSignatureValidationResult.Fail);
  expect(result.errors, `${label} errors`).toBe(expectedErrors);
  expect(() => ArcVerifier.getArcHeaderSets(message, true), `${label} throwOnError`).toThrow(FormatException);
}

describe('ArcVerifierTests (extra)', () => {
  test('TestArgumentExceptions', async () => {
    const locator = new DkimPublicKeyLocator();
    const verifier = new ArcVerifier(locator);
    const message = new MimeMessage();

    expect(() => new ArcVerifier(null as never)).toThrow(TypeError);
    expect(() => new ArcHeaderValidationResult(null as never)).toThrow(TypeError);
    expect(() => new ArcHeaderValidationResult(null as never, ArcSignatureValidationResult.Fail)).toThrow(TypeError);

    await expect(verifier.verify(null as never)).rejects.toThrow(TypeError);
    await expect(verifier.verify(null as never, message)).rejects.toThrow(TypeError);
    await expect(verifier.verify(FormatOptions.default, null as never)).rejects.toThrow(TypeError);
  });

  test('TestArcHeaderValidationResult', () => {
    const header = new Header(HeaderId.ArcMessageSignature, 'i=1; a=rsa-sha256; ...');
    const result = new ArcHeaderValidationResult(header, ArcSignatureValidationResult.Fail);

    expect(result.header).toBe(header);
    expect(result.signature).toBe(ArcSignatureValidationResult.Fail);
  });

  test('TestArcValidationResult', () => {
    let header = new Header(HeaderId.ArcMessageSignature, 'i=1; a=rsa-sha256; ...');
    const ams = new ArcHeaderValidationResult(header, ArcSignatureValidationResult.Pass);

    header = new Header(HeaderId.ArcSeal, 'i=1; a=rsa-sha256; ...');
    const seal = new ArcHeaderValidationResult(header, ArcSignatureValidationResult.Pass);

    const result = new ArcValidationResult(ArcSignatureValidationResult.Pass, ams, [seal]);

    expect(result.chain).toBe(ArcSignatureValidationResult.Pass);
    expect(result.messageSignature).not.toBeNull();
    expect(result.messageSignature!.header.id).toBe(HeaderId.ArcMessageSignature);
    expect(result.messageSignature!.signature).toBe(ArcSignatureValidationResult.Pass);
    expect(result.seals).not.toBeNull();
    expect(result.seals!.length).toBe(1);
    expect(result.seals![0]!.header.id).toBe(HeaderId.ArcSeal);
    expect(result.seals![0]!.signature).toBe(ArcSignatureValidationResult.Pass);
  });

  test('TestGetArcHeaderSetsBrokenAAR', () => {
    const message = load(singleSet);
    const index = message.headers.indexOf(HeaderId.ArcAuthenticationResults);
    const aar = message.headers.at(index);

    const broken = new Header(HeaderId.ArcAuthenticationResults, 'this should be unparsable...');
    message.headers.set(index, broken);
    expectSets(message, ArcValidationErrors.InvalidArcAuthenticationResults, 'Broken AAR');

    broken.value = aar.value.replace('i=1; ', '');
    expectSets(message, ArcValidationErrors.InvalidArcAuthenticationResults, 'AAR missing i=1');

    broken.value = aar.value.replace('i=1; ', 'i=0; ');
    expectSets(message, ArcValidationErrors.InvalidArcAuthenticationResults, 'AAR i=0');

    message.headers.removeAt(index);
    expectSets(message, ArcValidationErrors.MissingArcAuthenticationResults, 'Missing AAR');
  });

  test('TestGetArcHeaderSetsBrokenAMS', () => {
    const message = load(singleSet);
    const index = message.headers.indexOf(HeaderId.ArcMessageSignature);
    const ams = message.headers.at(index);

    const broken = new Header(HeaderId.ArcMessageSignature, 'this should be unparsable...');
    message.headers.set(index, broken);
    expectSets(message, ArcValidationErrors.InvalidArcMessageSignature, 'Broken AMS');

    broken.value = ams.value.replace('i=1; ', '');
    expectSets(message, ArcValidationErrors.InvalidArcMessageSignature, 'AMS missing i=1');

    broken.value = ams.value.replace('i=1; ', 'i=0; ');
    expectSets(message, ArcValidationErrors.InvalidArcMessageSignature, 'AMS i=0');

    message.headers.removeAt(index);
    expectSets(message, ArcValidationErrors.MissingArcMessageSignature, 'Missing AMS');
  });

  test('TestGetArcHeaderSetsBrokenAS', () => {
    const message = load(singleSet);
    const index = message.headers.indexOf(HeaderId.ArcSeal);
    const seal = message.headers.at(index);

    const broken = new Header(HeaderId.ArcSeal, 'this should be unparsable...');
    message.headers.set(index, broken);
    expectSets(message, ArcValidationErrors.InvalidArcSeal, 'Broken AS');

    broken.value = seal.value.replace('i=1; ', '');
    expectSets(message, ArcValidationErrors.InvalidArcSeal, 'AS missing i=1');

    broken.value = seal.value.replace('i=1; ', 'i=0; ');
    expectSets(message, ArcValidationErrors.InvalidArcSeal, 'AS i=0');

    message.headers.removeAt(index);
    expectSets(message, ArcValidationErrors.MissingArcSeal, 'Missing AS');
  });

  test('TestGetArcHeaderSetsMissingSet', () => {
    const message = load(twoSets);

    let index = message.headers.lastIndexOf(HeaderId.ArcSeal);
    message.headers.removeAt(index);
    index = message.headers.lastIndexOf(HeaderId.ArcMessageSignature);
    message.headers.removeAt(index);
    index = message.headers.lastIndexOf(HeaderId.ArcAuthenticationResults);
    message.headers.removeAt(index);

    expectSets(
      message,
      ArcValidationErrors.MissingArcAuthenticationResults | ArcValidationErrors.MissingArcMessageSignature | ArcValidationErrors.MissingArcSeal,
      'Missing set',
    );
  });
});
