import { describe, expect, test } from 'vitest';
import { formatDate, parseDate } from '../../src/utils/date-utils.js';

const dates = [
  'Sun, 08 Dec 91 09:11:00 +0000',
  '8 Dec 1991 09:11 (Sunday)',
  '26 Dec 1991 20:45 (Thursday)',
  'Tue, 9 Jun 92 03:45:24 JST',
  'Mon, 17 Jan 1994 11:14:55 -0500',
  'Mon, 17 Jan 01 11:14:55 -0500',
  'Tue, 30 Mar 2004 13:01:38 +0000',
  'Sat Mar 24 21:23:03 EDT 2007',
  'Sat, 24 Mar 2007 21:23:03 EDT',
  'Sat, 24 Mar 2007 21:23:03 GMT',
  '17-6-2008 17:10:08',
  'FRI, 30 NOV 2012 02:09:10 +0100',
  'Tue, 11 Feb 2014 22:27:10 +0100 (CET)',
  'Wed, 6 Aug 2014 01:53:48 -2200',
  'Tue, 21 Apr 15 14:44:51 GMT',
  'Tue, 21 April 15 14:44:51 GMT',
  'Thu, 1 Oct 2015 14:40:57 +0200 (Mitteleuropäische Sommerzeit)',
  'Tue, 12 Jun 2012 19:22:28 0200',
  'Fri, 8 May 2015',
  'Fri, 8 May 2015 12',
  'Fri, 8 May 2015 12:05',
  'Fri, 8 May 2015 12:05:01',
  'Fri, 8 May 2015 12:05:01 400',
  'Sat, 9 May 2015 24:00:00 -0400',
  'Sat, 9 May 2015 25:00:00 -0400',
  'May 9 2015 25:00:00 -0400',
  '2015 May 9 25:00:00 -0400',
  '2015 May 9 25:99:78 -0400',
  '25 Sep 81 06:03:27 -0400',
  'Sat, 10 Sep 2022 12:59:19 -1234567890123456789',
  'Sat, 10 Sep 2022 12:59:19 1234567890123456789',
  'Sat, 10 Sep 2022 12:59:19 04+00',
  'Sat, 10 Sep 2022 12:59:19 ECST',
  'Sat, Sep 10 2022 12:59:19 0400',
  'Sat, Sep 10 77 12:59:19 0400',
  'Sat, 01 Mar 2025 09:00:00 XYZ',
  'Mon, 28 Feb 2025 09:00:00 -0500',
  'Fri, 28 Feb 2025 12:15:00 AM -0500',
  'Fri, 28 Feb 2025 11:30:00 PM -0500',
  'Feb 28 2025 12:15:00 AM -0500',
  'Feb 28 2025 11:30:00 PM -0500',
  'Fri, 28 Feb 2025 23:59:60 -0500',
  'Fri, 28 Feb 2025 23:59:61 -0500',
  'Fri, 28 Feb 2025 22:59:60 -0500',
  'Fri, 28 Feb 2025 23:60:59 -0500',
  '31 Dec 2024 10:15:00 AM',
  '31 Dec 2024 10:15:00 PM',
] as const;

const expected = [
  'Sun, 08 Dec 1991 09:11:00 +0000',
  'Sun, 08 Dec 1991 09:11:00 +0000',
  'Thu, 26 Dec 1991 20:45:00 +0000',
  'Tue, 09 Jun 1992 03:45:24 +0900',
  'Mon, 17 Jan 1994 11:14:55 -0500',
  'Wed, 17 Jan 2001 11:14:55 -0500',
  'Tue, 30 Mar 2004 13:01:38 +0000',
  'Sat, 24 Mar 2007 21:23:03 -0400',
  'Sat, 24 Mar 2007 21:23:03 -0400',
  'Sat, 24 Mar 2007 21:23:03 +0000',
  'Tue, 17 Jun 2008 17:10:08 +0000',
  'Fri, 30 Nov 2012 02:09:10 +0100',
  'Tue, 11 Feb 2014 22:27:10 +0100',
  'Wed, 06 Aug 2014 01:53:48 +0000',
  'Tue, 21 Apr 2015 14:44:51 +0000',
  'Tue, 21 Apr 2015 14:44:51 +0000',
  'Thu, 01 Oct 2015 14:40:57 +0200',
  'Tue, 12 Jun 2012 19:22:28 +0200',
  'Fri, 08 May 2015 00:00:00 +0000',
  'Fri, 08 May 2015 00:00:00 +0000',
  'Fri, 08 May 2015 12:05:00 +0000',
  'Fri, 08 May 2015 12:05:01 +0000',
  'Fri, 08 May 2015 12:05:01 +0400',
  'Sat, 09 May 2015 00:00:00 -0400',
  'Sat, 09 May 2015 00:00:00 -0400',
  'Sat, 09 May 2015 00:00:00 -0400',
  'Sat, 09 May 2015 00:00:00 -0400',
  'Sat, 09 May 2015 00:00:00 -0400',
  'Fri, 25 Sep 1981 06:03:27 -0400',
  'Sat, 10 Sep 2022 12:59:19 +0000',
  'Sat, 10 Sep 2022 12:59:19 +0000',
  'Sat, 10 Sep 2022 12:59:19 +0000',
  'Sat, 10 Sep 2022 12:59:19 +0000',
  'Sat, 10 Sep 2022 12:59:19 +0400',
  'Sat, 10 Sep 1977 12:59:19 +0400',
  'Sat, 01 Mar 2025 09:00:00 +0000',
  'Fri, 28 Feb 2025 09:00:00 -0500',
  'Fri, 28 Feb 2025 00:15:00 -0500',
  'Fri, 28 Feb 2025 23:30:00 -0500',
  'Fri, 28 Feb 2025 00:15:00 -0500',
  'Fri, 28 Feb 2025 23:30:00 -0500',
  'Fri, 28 Feb 2025 23:59:59 -0500',
  'Fri, 28 Feb 2025 00:00:00 -0500',
  'Fri, 28 Feb 2025 00:00:00 -0500',
  'Fri, 28 Feb 2025 00:00:00 -0500',
  'Tue, 31 Dec 2024 10:15:00 +0000',
  'Tue, 31 Dec 2024 22:15:00 +0000',
] as const;

const invalidDates = [
  'this is pure junk',
  'Sunday is the day of our Lord',
  'Sun is so bright, I gotta wear shades',
  'Sat, 8 dogs did while 8 cats hid',
  'Sat, 9 May flies bit my arms',
] as const;

const monthCases = [
  ['Wed, 1 Jan 2025 09:00:00 -0500', 1],
  ['Sat, 1 Feb 2025 09:00:00 -0500', 2],
  ['Sat, 1 Mar 2025 09:00:00 -0500', 3],
  ['Tue, 1 Apr 2025 09:00:00 -0500', 4],
  ['Thu, 1 May 2025 09:00:00 -0500', 5],
  ['Sun, 1 Jun 2025 09:00:00 -0500', 6],
  ['Tue, 1 Jul 2025 09:00:00 -0500', 7],
  ['Fri, 1 Aug 2025 09:00:00 -0500', 8],
  ['Mon, 1 Sep 2025 09:00:00 -0500', 9],
  ['Wed, 1 Oct 2025 09:00:00 -0500', 10],
  ['Sat, 1 Nov 2025 09:00:00 -0500', 11],
  ['Mon, 1 Dec 2025 09:00:00 -0500', 12],
] as const;

const timezoneCases = [
  ['GMT', 0], ['UTC', 0],
  ['EDT', -400], ['EST', -500],
  ['CDT', -500], ['CST', -600],
  ['MDT', -600], ['MST', -700],
  ['PDT', -700], ['PST', -800],
  ['A', 100], ['B', 200], ['C', 300],
  ['D', 400], ['E', 500], ['F', 600],
  ['G', 700], ['H', 800], ['I', 900],
  ['K', 1000], ['L', 1100], ['M', 1200],
  ['N', -100], ['O', -200], ['P', -300],
  ['Q', -400], ['R', -500], ['S', -600],
  ['T', -700], ['U', -800], ['V', -900],
  ['W', -1000], ['X', -1100], ['Y', -1200],
  ['Z', 0],
  ['JST', 900], ['KST', 900],
] as const;

function parseOrThrow(value: string) {
  const parsed = parseDate(value);
  if (!parsed.ok) throw new Error(`Failed to parse date: ${value}`);
  return parsed.value;
}

function localMonth(dto: { epochMillis: number; offsetMinutes: number }): number {
  return new Date(dto.epochMillis + (dto.offsetMinutes * 60_000)).getUTCMonth() + 1;
}

function zoneToOffsetMinutes(tzone: number): number {
  return Math.trunc(tzone / 100) * 60 + (tzone % 100);
}

describe('DateUtils parser', () => {
  test.each(dates.map((value, i) => [value, expected[i]] as const))('parses %s', (value, formatted) => {
    const parsed = parseDate(value);
    expect(parsed.ok, `Failed to parse date: ${value}`).toBe(true);
    if (!parsed.ok) return;
    expect(formatDate(parsed.value)).toBe(formatted);

    const bytes = new TextEncoder().encode(value);
    const parsedBytes = parseDate(bytes);
    expect(parsedBytes.ok, `Failed to parse date bytes: ${value}`).toBe(true);
    if (!parsedBytes.ok) return;
    expect(formatDate(parsedBytes.value)).toBe(formatted);
  });

  test.each(invalidDates)('rejects invalid date %s', (value) => {
    const parsed = parseDate(value);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.kind).toBe('invalid-date');

    const parsedBytes = parseDate(new TextEncoder().encode(value));
    expect(parsedBytes.ok).toBe(false);
    if (!parsedBytes.ok) expect(parsedBytes.error.kind).toBe('invalid-date');
  });

  test.each(monthCases)('parses month from %s', (value, month) => {
    expect(localMonth(parseOrThrow(value))).toBe(month);
  });

  test.each(timezoneCases)('parses timezone %s', (zone, expectedOffset) => {
    const value = `Fri, 28 Feb 2025 09:00:00 ${zone}`;
    expect(parseOrThrow(value).offsetMinutes).toBe(zoneToOffsetMinutes(expectedOffset));
  });
});
