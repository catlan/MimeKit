// Crypto trust-anchor oracle for wave C1 (DKIM/ARC). References the FULL MimeKit
// (ENABLE_CRYPTO + BouncyCastle) — unlike the Lite-scoped ../oracle — so it can
// exercise MimeKit's own DkimSigner/DkimVerifier/ArcSigner/ArcVerifier. Used by
// ts/gates/oracle-gen.mjs (dkim mode) for byte-parity and cross-verify gates.
//
// Determinism: DKIM/ARC signing is byte-deterministic except the t= timestamp,
// which is pinned via a fixed GetTimestamp() override so output is reproducible.
//
// Commands (all read a message file; TXT records passed as query=value args):
//   dkim-sign   <msg> <headerCanon> <bodyCanon> <algo> <domain> <selector> <keyfile> <t>
//   dkim-verify <msg> <index|last> <query=txt>...
//   arc-sign    <msg> <domain> <selector> <keyfile> <algo> <srvid> <t> <hdrs-colon>
//   arc-verify  <msg> <query=txt>...

using System.Globalization;
using System.Text;
using System.Text.Json;
using MimeKit;
using MimeKit.Cryptography;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Parameters;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;

var json = new JsonSerializerOptions {
    WriteIndented = false,
    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
};

return args switch {
    ["dkim-sign", var msg, var hc, var bc, var algo, var domain, var selector, var keyfile, var t] => DkimSign(msg, hc, bc, algo, domain, selector, keyfile, long.Parse(t)),
    ["dkim-sign-full", var msg, var hc, var bc, var algo, var domain, var selector, var keyfile, var t, var outfile] => DkimSignFull(msg, hc, bc, algo, domain, selector, keyfile, long.Parse(t), outfile),
    ["dkim-verify", var msg, var index, .. var txts] => DkimVerify(msg, index, txts),
    ["arc-sign", var msg, var domain, var selector, var keyfile, var algo, var srvid, var t, var hdrs, .. var txts] => ArcSign(msg, domain, selector, keyfile, algo, srvid, long.Parse(t), hdrs, txts),
    ["arc-verify", var msg, .. var txts] => ArcVerify(msg, txts),
    _ => Fail("usage: dkim-sign|dkim-verify|arc-sign|arc-verify ..."),
};

int Fail(string message) { Console.Error.WriteLine(message); return 1; }

DkimCanonicalizationAlgorithm Canon(string s) => s switch {
    "relaxed" => DkimCanonicalizationAlgorithm.Relaxed,
    "simple" => DkimCanonicalizationAlgorithm.Simple,
    _ => throw new ArgumentException($"bad canon {s}"),
};

DkimSignatureAlgorithm Algo(string s) => s switch {
    "rsa-sha1" => DkimSignatureAlgorithm.RsaSha1,
    "rsa-sha256" => DkimSignatureAlgorithm.RsaSha256,
    "ed25519-sha256" => DkimSignatureAlgorithm.Ed25519Sha256,
    _ => throw new ArgumentException($"bad algo {s}"),
};

MimeMessage Load(string path) {
    using var stream = File.OpenRead(path);
    return MimeMessage.Load(stream);
}

TestLocator BuildLocator(IEnumerable<string> txts) {
    var locator = new TestLocator();
    foreach (var entry in txts) {
        int eq = entry.IndexOf('=');
        locator.Add(entry[..eq], entry[(eq + 1)..]);
    }
    return locator;
}

int DkimSign(string msg, string hc, string bc, string algo, string domain, string selector, string keyfile, long t) {
    var message = Load(msg);
    var signer = new FixedDkimSigner(keyfile, domain, selector, Algo(algo), t) {
        HeaderCanonicalizationAlgorithm = Canon(hc),
        BodyCanonicalizationAlgorithm = Canon(bc),
        AgentOrUserIdentifier = "@eng.example.com",
        QueryMethod = "dns/txt",
    };
    signer.Sign(message, new[] { HeaderId.From, HeaderId.Subject, HeaderId.Date });
    Console.WriteLine(message.Headers[HeaderId.DkimSignature]);
    return 0;
}

int DkimSignFull(string msg, string hc, string bc, string algo, string domain, string selector, string keyfile, long t, string outfile) {
    var message = Load(msg);
    var signer = new FixedDkimSigner(keyfile, domain, selector, Algo(algo), t) {
        HeaderCanonicalizationAlgorithm = Canon(hc),
        BodyCanonicalizationAlgorithm = Canon(bc),
        AgentOrUserIdentifier = "@eng.example.com",
        QueryMethod = "dns/txt",
    };
    signer.Sign(message, new[] { HeaderId.From, HeaderId.Subject, HeaderId.Date });
    var options = FormatOptions.Default.Clone();
    options.NewLineFormat = NewLineFormat.Dos;
    using var stream = File.Create(outfile);
    message.WriteTo(options, stream);
    return 0;
}

int DkimVerify(string msg, string index, string[] txts) {
    var message = Load(msg);
    var locator = BuildLocator(txts);
    var verifier = new DkimVerifier(locator);
    verifier.Enable(DkimSignatureAlgorithm.RsaSha1);
    int i = index == "last" ? message.Headers.LastIndexOf(HeaderId.DkimSignature) : int.Parse(index);
    Console.WriteLine(verifier.Verify(message, message.Headers[i]) ? "valid" : "invalid");
    return 0;
}

int ArcSign(string msg, string domain, string selector, string keyfile, string algo, string srvid, long t, string hdrs, string[] txts) {
    var message = Load(msg);
    var locator = BuildLocator(txts);
    var signer = new OracleArcSigner(keyfile, domain, selector, Algo(algo)) {
        HeaderCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Relaxed,
        BodyCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Relaxed,
        SrvId = srvid, Timestamp = t, PublicKeyLocator = locator,
    };
    signer.Sign(message, hdrs.Split(':'));
    var result = new {
        aar = message.Headers[HeaderId.ArcAuthenticationResults],
        ams = message.Headers[HeaderId.ArcMessageSignature],
        seal = message.Headers[HeaderId.ArcSeal],
    };
    Console.WriteLine(JsonSerializer.Serialize(result, json));
    return 0;
}

int ArcVerify(string msg, string[] txts) {
    var message = Load(msg);
    var locator = BuildLocator(txts);
    var verifier = new ArcVerifier(locator);
    verifier.Enable(DkimSignatureAlgorithm.RsaSha1);
    var result = verifier.Verify(message);
    var dump = new {
        chain = result.Chain.ToString(),
        chainErrors = (int) result.ChainErrors,
        messageSignature = result.MessageSignature?.Signature.ToString(),
        seals = result.Seals?.Select(s => s.Signature.ToString()).ToArray(),
    };
    Console.WriteLine(JsonSerializer.Serialize(dump, json));
    return 0;
}

sealed class FixedDkimSigner : DkimSigner {
    readonly long t;
    public FixedDkimSigner(string keyfile, string domain, string selector, DkimSignatureAlgorithm algo, long t)
        : base(keyfile, domain, selector, algo) { this.t = t; }
    protected override long GetTimestamp() => t;
}

sealed class OracleArcSigner : ArcSigner {
    public IDkimPublicKeyLocator? PublicKeyLocator { get; set; }
    public string SrvId { get; set; } = "";
    public long Timestamp { get; set; }
    public OracleArcSigner(string keyfile, string domain, string selector, DkimSignatureAlgorithm algo)
        : base(keyfile, domain, selector, algo) { }
    protected override long GetTimestamp() => Timestamp;
    protected override AuthenticationResults GenerateArcAuthenticationResults(FormatOptions options, MimeMessage message, CancellationToken cancellationToken) {
        var results = new AuthenticationResults(SrvId);
        foreach (var header in message.Headers) {
            if (header.Id != HeaderId.AuthenticationResults) continue;
            if (!AuthenticationResults.TryParse(header.RawValue, out var authres)) continue;
            if (authres!.AuthenticationServiceIdentifier != SrvId) continue;
            foreach (var r in authres.Results)
                if (!results.Results.Any(x => x.Method == r.Method)) results.Results.Add(r);
        }
        return results;
    }
    protected override Task<AuthenticationResults> GenerateArcAuthenticationResultsAsync(FormatOptions options, MimeMessage message, CancellationToken cancellationToken)
        => Task.FromResult(GenerateArcAuthenticationResults(options, message, cancellationToken));
}

sealed class TestLocator : DkimPublicKeyLocatorBase {
    readonly Dictionary<string, string> keys = new();
    public void Add(string key, string value) => keys[key] = value;
    public override AsymmetricKeyParameter LocatePublicKey(string methods, string domain, string selector, CancellationToken cancellationToken = default) {
        var query = selector + "._domainkey." + domain;
        if (keys.TryGetValue(query, out var txt)) return GetPublicKey(txt);
        throw new Exception($"no key for {query}");
    }
    public override Task<AsymmetricKeyParameter> LocatePublicKeyAsync(string methods, string domain, string selector, CancellationToken cancellationToken = default)
        => Task.FromResult(LocatePublicKey(methods, domain, selector, cancellationToken));
}
