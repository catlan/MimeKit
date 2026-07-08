// Differential-testing oracle for the TypeScript port (ts/).
//
// Wraps MimeKitLite behind a CLI that emits deterministic JSON dumps and raw
// bytes, so the TS side can be compared byte-for-byte. Culture is pinned via
// InvariantGlobalization. No GUIDs/clock values may reach any output.
//
// Commands:
//   oracle parse     --base <dir> --out <dir> [--mbox] <files...>
//   oracle roundtrip --base <dir> --out <dir> [--mbox] <files...>
//   oracle transcode <base64|qp|uu|yenc|hex> <encode|decode> <in> <out>
//   oracle hdr <addr|ctype|cdisp|date|rfc2047> <in-list> <out-json>
//       in-list: one base64-encoded raw input per line

using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MimeKit;
using MimeKit.Encodings;
using MimeKit.Utils;

// Match the upstream test suite: full codepage support + pinned culture.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;

var jsonOptions = new JsonSerializerOptions {
	WriteIndented = true,
	Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
};

return args switch {
	["parse", .. var rest] => RunTree(rest, roundtrip: false),
	["roundtrip", .. var rest] => RunTree(rest, roundtrip: true),
	["transcode", var codec, var direction, var input, var output] => RunTranscode(codec, direction, input, output),
	["hdr", var kind, var inList, var outJson] => RunHeaderDump(kind, inList, outJson),
	["idn", var inList, var outJson] => RunIdnDump(inList, outJson),
	_ => Fail("usage: oracle parse|roundtrip|transcode|hdr|idn ..."),
};

int RunIdnDump(string inListPath, string outJsonPath)
{
	var idn = new MimeKit.Encodings.Punycode();
	var results = new List<object>();
	foreach (var line in File.ReadAllLines(inListPath)) {
		if (line.Length == 0)
			continue;
		var input = Encoding.UTF8.GetString(Convert.FromBase64String(line));
		string? ascii = null, unicode = null;
		try { ascii = idn.Encode(input); } catch { }
		try { unicode = idn.Decode(input); } catch { }
		results.Add(new { input, ascii, unicode });
	}
	File.WriteAllText(outJsonPath, JsonSerializer.Serialize(results, jsonOptions) + "\n");
	return 0;
}

int Fail(string message)
{
	Console.Error.WriteLine(message);
	return 1;
}

(string baseDir, string outDir, bool mbox, List<string> files) ParseTreeArgs(string[] rest)
{
	string? baseDir = null, outDir = null;
	bool mbox = false;
	var files = new List<string>();
	for (int i = 0; i < rest.Length; i++) {
		switch (rest[i]) {
		case "--base": baseDir = rest[++i]; break;
		case "--out": outDir = rest[++i]; break;
		case "--mbox": mbox = true; break;
		default: files.Add(rest[i]); break;
		}
	}
	if (baseDir is null || outDir is null || files.Count == 0)
		throw new ArgumentException("parse/roundtrip require --base, --out and at least one file");
	return (Path.GetFullPath(baseDir), Path.GetFullPath(outDir), mbox, files);
}

int RunTree(string[] rest, bool roundtrip)
{
	var (baseDir, outDir, mbox, files) = ParseTreeArgs(rest);
	int failures = 0;
	foreach (var file in files) {
		var full = Path.GetFullPath(file);
		var rel = Path.GetRelativePath(baseDir, full);
		var suffix = roundtrip ? ".roundtrip" : ".parse.json";
		var outPath = Path.Combine(outDir, rel + suffix);
		Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
		try {
			using var stream = File.OpenRead(full);
			var parser = new MimeParser(stream, mbox ? MimeFormat.Mbox : MimeFormat.Entity);
			if (roundtrip) {
				using var outStream = File.Create(outPath);
				while (!parser.IsEndOfStream) {
					var message = parser.ParseMessage();
					message.WriteTo(FormatOptions.Default, outStream);
				}
			} else {
				var dumps = new List<object>();
				while (!parser.IsEndOfStream) {
					var message = parser.ParseMessage();
					dumps.Add(DumpMessage(message));
				}
				var doc = new { file = rel.Replace('\\', '/'), format = mbox ? "mbox" : "entity", messages = dumps };
				File.WriteAllText(outPath, JsonSerializer.Serialize(doc, jsonOptions) + "\n");
			}
		} catch (Exception ex) {
			failures++;
			File.WriteAllText(outPath + ".error", $"{ex.GetType().Name}: {ex.Message}\n");
		}
	}
	Console.WriteLine($"{(roundtrip ? "roundtrip" : "parse")}: {files.Count - failures}/{files.Count} ok");
	return 0; // per-file errors are recorded as .error artifacts, not process failure
}

object DumpMessage(MimeMessage message)
{
	return new {
		headers = message.Headers.Select(DumpHeader).ToArray(),
		body = message.Body is null ? null : DumpEntity(message.Body),
	};
}

object DumpHeader(Header header)
{
	return new { field = header.Field, value = header.Value };
}

object DumpEntity(MimeEntity entity)
{
	var headers = entity.Headers.Select(DumpHeader).ToArray();
	var contentType = new {
		mimeType = entity.ContentType.MimeType,
		parameters = entity.ContentType.Parameters.Select(p => new { name = p.Name, value = p.Value }).ToArray(),
	};
	var disposition = entity.ContentDisposition is null ? null : new {
		value = entity.ContentDisposition.Disposition,
		parameters = entity.ContentDisposition.Parameters.Select(p => new { name = p.Name, value = p.Value }).ToArray(),
	};

	switch (entity) {
	case MessagePart rfc822:
		return new {
			type = entity.GetType().Name,
			contentType,
			disposition,
			headers,
			message = rfc822.Message is null ? null : DumpMessage(rfc822.Message),
		};
	case Multipart multipart:
		return new {
			type = entity.GetType().Name,
			contentType,
			disposition,
			headers,
			preamble = multipart.Preamble,
			epilogue = multipart.Epilogue,
			children = multipart.Select(DumpEntity).ToArray(),
		};
	case MimePart part:
		string? decodedSha = null;
		long decodedLength = -1;
		string? rawSha = null;
		if (part.Content is not null) {
			using (var decoded = new MemoryStream()) {
				part.Content.DecodeTo(decoded);
				decodedLength = decoded.Length;
				decodedSha = Convert.ToHexString(SHA256.HashData(decoded.GetBuffer().AsSpan(0, (int) decoded.Length))).ToLowerInvariant();
			}
			using (var raw = new MemoryStream()) {
				using var content = part.Content.Open();
				content.CopyTo(raw);
				rawSha = Convert.ToHexString(SHA256.HashData(raw.GetBuffer().AsSpan(0, (int) raw.Length))).ToLowerInvariant();
			}
		}
		return new {
			type = entity.GetType().Name,
			contentType,
			disposition,
			headers,
			encoding = part.ContentTransferEncoding.ToString(),
			decodedSha256 = decodedSha,
			decodedLength,
			rawSha256 = rawSha,
		};
	default:
		return new { type = entity.GetType().Name, contentType, disposition, headers };
	}
}

int RunTranscode(string codec, string direction, string inputPath, string outputPath)
{
	var input = File.ReadAllBytes(inputPath);
	byte[] output;
	if (direction == "encode") {
		IMimeEncoder encoder = codec switch {
			"base64" => new Base64Encoder(),
			"qp" => new QuotedPrintableEncoder(),
			"uu" => new UUEncoder(),
			"yenc" => new YEncoder(),
			"hex" => new HexEncoder(),
			_ => throw new ArgumentException($"unknown codec {codec}"),
		};
		output = new byte[encoder.EstimateOutputLength(input.Length)];
		int n = encoder.Flush(input, 0, input.Length, output);
		output = output[..n];
	} else {
		IMimeDecoder decoder = codec switch {
			"base64" => new Base64Decoder(),
			"qp" => new QuotedPrintableDecoder(),
			"uu" => new UUDecoder(),
			"uu-payload" => new UUDecoder(payloadOnly: true),
			"yenc" => new YDecoder(),
			"yenc-payload" => new YDecoder(payloadOnly: true),
			"hex" => new HexDecoder(),
			_ => throw new ArgumentException($"unknown codec {codec}"),
		};
		output = new byte[decoder.EstimateOutputLength(input.Length)];
		int n = decoder.Decode(input, 0, input.Length, output);
		output = output[..n];
	}
	File.WriteAllBytes(outputPath, output);
	return 0;
}

int RunHeaderDump(string kind, string inListPath, string outJsonPath)
{
	var lines = File.ReadAllLines(inListPath);
	var results = new List<object>(lines.Length);
	foreach (var line in lines) {
		if (line.Length == 0)
			continue;
		var raw = Convert.FromBase64String(line);
		results.Add(DumpHeaderValue(kind, raw));
	}
	File.WriteAllText(outJsonPath, JsonSerializer.Serialize(results, jsonOptions) + "\n");
	return 0;
}

object DumpAddress(InternetAddress address)
{
	switch (address) {
	case MailboxAddress mailbox:
		return new {
			type = "mailbox",
			name = mailbox.Name,
			address = mailbox.Address,
			route = mailbox.Route.ToArray(),
		};
	case GroupAddress group:
		return new {
			type = "group",
			name = group.Name,
			members = group.Members.Select(DumpAddress).ToArray(),
		};
	default:
		return new { type = address.GetType().Name, name = address.Name };
	}
}

object DumpHeaderValue(string kind, byte[] raw)
{
	var input = Convert.ToBase64String(raw);
	switch (kind) {
	case "addr": {
		if (!InternetAddressList.TryParse(ParserOptions.Default, raw, 0, raw.Length, out var list))
			return new { input, ok = false };
		return new { input, ok = true, addresses = list.Select(DumpAddress).ToArray(), canonical = list.ToString() };
	}
	case "ctype": {
		if (!ContentType.TryParse(ParserOptions.Default, raw, 0, raw.Length, out var ct))
			return new { input, ok = false };
		return new {
			input, ok = true, mimeType = ct.MimeType,
			parameters = ct.Parameters.Select(p => new { name = p.Name, value = p.Value }).ToArray(),
		};
	}
	case "cdisp": {
		if (!ContentDisposition.TryParse(ParserOptions.Default, raw, 0, raw.Length, out var cd))
			return new { input, ok = false };
		return new {
			input, ok = true, disposition = cd.Disposition,
			parameters = cd.Parameters.Select(p => new { name = p.Name, value = p.Value }).ToArray(),
		};
	}
	case "date": {
		if (!DateUtils.TryParse(raw, 0, raw.Length, out var date))
			return new { input, ok = false };
		return new {
			input, ok = true,
			unixSeconds = date.ToUnixTimeSeconds(),
			offsetMinutes = (int) date.Offset.TotalMinutes,
		};
	}
	case "rfc2047": {
		var decoded = Rfc2047.DecodeText(ParserOptions.Default, raw);
		return new { input, ok = true, decoded };
	}
	default:
		throw new ArgumentException($"unknown hdr kind {kind}");
	}
}
