// Port of UnitTests/Cryptography/CmsRecipientTests.cs.
//
// C#'s file/stream/X509Certificate2 constructors collapse to the TS value-type
// constructor over a parsed X509Certificate (loaded via loadCertificate). Loads
// a real certificate, so this suite was deferred by C2a and is unblocked by the
// C2b-1 X.509 backend.

import { describe, expect, test } from 'vitest';
import { CmsRecipient } from '../../src/smime/cms-recipient.js';
import { CmsRecipientCollection } from '../../src/smime/cms-recipient-collection.js';
import { EncryptionAlgorithm } from '../../src/smime/encryption-algorithm.js';
import { SubjectIdentifierType } from '../../src/smime/subject-identifier-type.js';
import { loadCertificate, smimePath } from './helpers.js';
import type { X509Certificate } from '../../src/smime/x509-certificate.js';

const startComPath = smimePath('StartComCertificationAuthority.crt');

describe('CmsRecipientTests', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new CmsRecipient(null as never)).toThrow(TypeError);

    const recipients = new CmsRecipientCollection();

    expect(recipients.count).toBe(0);
    expect(recipients.isReadOnly).toBe(false);
    expect(() => recipients.add(null as never)).toThrow(TypeError);
    expect(() => recipients.contains(null as never)).toThrow(TypeError);
    expect(() => recipients.copyTo(null as never, 0)).toThrow(TypeError);
    expect(() => recipients.copyTo(new Array(1), -1)).toThrow(RangeError);
    expect(() => recipients.copyTo(new Array(1), 2)).toThrow(RangeError);
    expect(() => recipients.remove(null as never)).toThrow(TypeError);
  });

  function assertDefaultValues(recipient: CmsRecipient, certificate: X509Certificate): void {
    expect(recipient.certificate).toBe(certificate);
    expect(recipient.encryptionAlgorithms.length).toBe(1);
    expect(recipient.encryptionAlgorithms[0]).toBe(EncryptionAlgorithm.TripleDes);
    expect(recipient.recipientIdentifierType).toBe(SubjectIdentifierType.IssuerAndSerialNumber);
    expect(recipient.rsaEncryptionPadding).toBeNull();
  }

  test('TestDefaultValues', () => {
    const certificate = loadCertificate(startComPath);
    const recipient = new CmsRecipient(certificate);

    assertDefaultValues(recipient, certificate);
  });

  test('TestRecipientIdentifierType', () => {
    const certificate = loadCertificate(startComPath);
    const recipient = new CmsRecipient(certificate, SubjectIdentifierType.SubjectKeyIdentifier);

    expect(recipient.recipientIdentifierType).toBe(SubjectIdentifierType.SubjectKeyIdentifier);
  });

  test('TestCollectionAddRemove', () => {
    const recipients = new CmsRecipientCollection();
    const recipient = new CmsRecipient(loadCertificate(startComPath));
    const array = new Array<CmsRecipient>(1);

    expect(recipients.contains(recipient)).toBe(false);
    expect(recipients.remove(recipient)).toBe(false);

    recipients.add(recipient);

    expect(recipients.count).toBe(1);
    expect(recipients.contains(recipient)).toBe(true);

    recipients.copyTo(array, 0);
    expect(array[0]).toBe(recipient);

    expect(recipients.remove(recipient)).toBe(true);
    expect(recipients.count).toBe(0);

    recipients.clear();
  });
});
