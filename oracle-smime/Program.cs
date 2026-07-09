// S/MIME crypto oracle for wave C2b-2 (references the FULL MimeKit + BouncyCastle
// via TemporarySecureMimeContext loaded with the TestData/smime PKCS#12 fixtures,
// password "no.secret"). The trust anchor for the bidirectional cross-verify
// gates: consumes TS-produced S/MIME parts (verify/decrypt) and produces parts
// for TS to consume. Used by ts/gates/oracle-gen.mjs (smime mode).
//
// Commands (paths are files; MIME output written with CRLF):
//   smime-sign               <entity> <algo> <out>        detached multipart/signed
//   smime-verify             <signed>                      -> valid|invalid
//   smime-encapsulated-sign  <entity> <algo> <out>         application/pkcs7-mime signed-data
//   smime-encapsulated-verify<p7m>                         -> valid|invalid
//   smime-encrypt            <entity> <encalgo> <keypad> <out>   enveloped-data
//   smime-decrypt            <p7m> <out>                   -> ok, writes recovered entity
//   smime-compress           <entity> <out>                compressed-data
//   smime-decompress         <p7m> <out>                   -> ok, writes recovered entity

using System.Globalization;
using System.Text;
using MimeKit;
using MimeKit.Cryptography;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;

var smimeDir = Path.Combine(FindRepoRoot(), "UnitTests", "TestData", "smime");
const string password = "no.secret";

return args switch {
    ["smime-sign", var entity, var algo, var outp] => SmimeSign(entity, algo, outp, encapsulate: false),
    ["smime-encapsulated-sign", var entity, var algo, var outp] => SmimeSign(entity, algo, outp, encapsulate: true),
    ["smime-verify", var signed] => SmimeVerify(signed, encapsulated: false),
    ["smime-encapsulated-verify", var p7m] => SmimeVerify(p7m, encapsulated: true),
    ["smime-encrypt", var entity, var enc, var pad, var outp] => SmimeEncrypt(entity, enc, pad, outp),
    ["smime-decrypt", var p7m, var outp] => SmimeDecrypt(p7m, outp),
    ["smime-compress", var entity, var outp] => SmimeCompress(entity, outp),
    ["smime-decompress", var p7m, var outp] => SmimeDecompress(p7m, outp),
    _ => Fail("usage: smime-sign|smime-verify|smime-encapsulated-sign|smime-encapsulated-verify|smime-encrypt|smime-decrypt|smime-compress|smime-decompress ..."),
};

int Fail(string message) { Console.Error.WriteLine(message); return 1; }

string FindRepoRoot() {
    var dir = AppContext.BaseDirectory;
    while (dir != null && !Directory.Exists(Path.Combine(dir, "UnitTests")))
        dir = Path.GetDirectoryName(dir);
    return dir ?? throw new Exception("repo root not found");
}

TemporarySecureMimeContext CreateContext() {
    var ctx = new TemporarySecureMimeContext { CheckCertificateRevocation = false };
    foreach (var pfx in new[] { "rsa/smime.pfx", "ec/smime.pfx", "dsa/smime.pfx" }) {
        var path = Path.Combine(smimeDir, pfx);
        if (File.Exists(path)) {
            using var stream = File.OpenRead(path);
            try { ctx.Import(stream, password); } catch { /* skip unsupported */ }
        }
    }
    // Enable the legacy content ciphers used by the gate matrix.
    ctx.Enable(EncryptionAlgorithm.TripleDes);
    ctx.Enable(EncryptionAlgorithm.RC2128);
    ctx.Enable(EncryptionAlgorithm.RC264);
    ctx.Enable(EncryptionAlgorithm.RC240);
    return ctx;
}

CmsSigner LoadSigner(string algo) {
    var (pfx, digest, pss) = algo switch {
        "rsa-sha256" => ("rsa/smime.pfx", DigestAlgorithm.Sha256, false),
        "rsa-sha1" => ("rsa/smime.pfx", DigestAlgorithm.Sha1, false),
        "rsa-sha512" => ("rsa/smime.pfx", DigestAlgorithm.Sha512, false),
        "rsa-pss-sha256" => ("rsa/smime.pfx", DigestAlgorithm.Sha256, true),
        "ecdsa-sha256" => ("ec/smime.pfx", DigestAlgorithm.Sha256, false),
        _ => throw new ArgumentException($"bad algo {algo}"),
    };
    var signer = new CmsSigner(Path.Combine(smimeDir, pfx), password) { DigestAlgorithm = digest };
    if (pss) signer.RsaSignaturePadding = RsaSignaturePadding.Pss;
    return signer;
}

MimeEntity LoadEntity(string path) {
    using var stream = File.OpenRead(path);
    return MimeEntity.Load(stream);
}

void WriteEntity(MimeEntity entity, string path) {
    var options = FormatOptions.Default.Clone();
    options.NewLineFormat = NewLineFormat.Dos;
    using var stream = File.Create(path);
    entity.WriteTo(options, stream);
}

int SmimeSign(string entityPath, string algo, string outp, bool encapsulate) {
    using var ctx = CreateContext();
    var entity = LoadEntity(entityPath);
    var signer = LoadSigner(algo);
    MimeEntity result = encapsulate
        ? ApplicationPkcs7Mime.Sign(ctx, signer, entity)
        : MultipartSigned.Create(ctx, signer, entity);
    WriteEntity(result, outp);
    return 0;
}

int SmimeVerify(string path, bool encapsulated) {
    using var ctx = CreateContext();
    var entity = LoadEntity(path);
    DigitalSignatureCollection signatures;
    if (encapsulated)
        signatures = ((ApplicationPkcs7Mime) entity).Verify(ctx, out _);
    else
        signatures = ((MultipartSigned) entity).Verify(ctx);

    bool ok = signatures.Count > 0;
    foreach (var signature in signatures) {
        try { ok &= signature.Verify(true); }
        catch { ok = false; }
    }
    Console.WriteLine(ok ? "valid" : "invalid");
    return 0;
}

int SmimeEncrypt(string entityPath, string enc, string pad, string outp) {
    using var ctx = CreateContext();
    var entity = LoadEntity(entityPath);
    var algo = enc switch {
        "aes128" => EncryptionAlgorithm.Aes128,
        "aes192" => EncryptionAlgorithm.Aes192,
        "aes256" => EncryptionAlgorithm.Aes256,
        "3des" => EncryptionAlgorithm.TripleDes,
        "rc2-40" => EncryptionAlgorithm.RC240,
        "rc2-64" => EncryptionAlgorithm.RC264,
        "rc2-128" => EncryptionAlgorithm.RC2128,
        _ => throw new ArgumentException($"bad encalgo {enc}"),
    };
    var cert = new CmsSigner(Path.Combine(smimeDir, "rsa/smime.pfx"), password).Certificate;
    var recipient = new CmsRecipient(cert) { EncryptionAlgorithms = new[] { algo } };
    if (pad == "oaep") recipient.RsaEncryptionPadding = RsaEncryptionPadding.OaepSha1;
    else recipient.RsaEncryptionPadding = RsaEncryptionPadding.Pkcs1;
    var recipients = new CmsRecipientCollection { recipient };
    var encrypted = ApplicationPkcs7Mime.Encrypt(ctx, recipients, entity);
    WriteEntity(encrypted, outp);
    return 0;
}

int SmimeDecrypt(string p7mPath, string outp) {
    using var ctx = CreateContext();
    var entity = (ApplicationPkcs7Mime) LoadEntity(p7mPath);
    var decrypted = entity.Decrypt(ctx);
    WriteEntity(decrypted, outp);
    Console.WriteLine("ok");
    return 0;
}

int SmimeCompress(string entityPath, string outp) {
    using var ctx = CreateContext();
    var entity = LoadEntity(entityPath);
    var compressed = ApplicationPkcs7Mime.Compress(ctx, entity);
    WriteEntity(compressed, outp);
    return 0;
}

int SmimeDecompress(string p7mPath, string outp) {
    using var ctx = CreateContext();
    var entity = (ApplicationPkcs7Mime) LoadEntity(p7mPath);
    var decompressed = entity.Decompress(ctx);
    WriteEntity(decompressed, outp);
    Console.WriteLine("ok");
    return 0;
}
