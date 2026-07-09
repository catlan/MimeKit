import { err, ok, type Result } from '../result.js';

export interface DateTimeOffset {
  readonly epochMillis: number;
  readonly offsetMinutes: number;
}

const enum DateTokenFlags {
  None = 0,
  NonNumeric = 1 << 0,
  NonWeekday = 1 << 1,
  NonMonth = 1 << 2,
  NonTime = 1 << 3,
  NonAlphaZone = 1 << 4,
  NonNumericZone = 1 << 5,
  HasColon = 1 << 6,
  HasSign = 1 << 7,
}

interface DateToken {
  readonly flags: DateTokenFlags;
  readonly start: number;
  readonly length: number;
}

const monthCharacters = 'JanuaryFebruaryMarchAprilMayJuneJulyAugustSeptemberOctoberNovemberDecember';
const weekdayCharacters = 'SundayMondayTuesdayWednesdayThursdayFridaySaturday';
const alphaZoneCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const numericZoneCharacters = '+-0123456789';
const numericCharacters = '0123456789';
const timeCharacters = '0123456789:';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const timezones = new Map<string, number>([
  ['UT', 0], ['UTC', 0], ['GMT', 0],
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
]);

const datetok = makeDateTokenTable();
const utf8 = new TextEncoder();

function makeDateTokenTable(): DateTokenFlags[] {
  const table = new Array<DateTokenFlags>(256).fill(DateTokenFlags.None);
  for (let c = 0; c < 256; c++) {
    const ch = String.fromCharCode(c);
    const any = c >= 0x41 && c <= 0x5a
      ? [ch, String.fromCharCode(c + 0x20)]
      : c >= 0x61 && c <= 0x7a
        ? [String.fromCharCode(c - 0x20), ch]
        : [ch];

    if (!numericZoneCharacters.includes(ch)) table[c]! |= DateTokenFlags.NonNumericZone;
    if (!alphaZoneCharacters.includes(ch)) table[c]! |= DateTokenFlags.NonAlphaZone;
    if (!any.some((value) => weekdayCharacters.includes(value))) table[c]! |= DateTokenFlags.NonWeekday;
    if (!numericCharacters.includes(ch)) table[c]! |= DateTokenFlags.NonNumeric;
    if (!any.some((value) => monthCharacters.includes(value))) table[c]! |= DateTokenFlags.NonMonth;
    if (!timeCharacters.includes(ch)) table[c]! |= DateTokenFlags.NonTime;
  }

  table[':'.charCodeAt(0)]! |= DateTokenFlags.HasColon;
  table['+'.charCodeAt(0)]! |= DateTokenFlags.HasSign;
  table['-'.charCodeAt(0)]! |= DateTokenFlags.HasSign;
  return table;
}

function isNumeric(token: DateToken): boolean {
  return (token.flags & DateTokenFlags.NonNumeric) === 0;
}

function isWeekday(token: DateToken): boolean {
  return (token.flags & DateTokenFlags.NonWeekday) === 0;
}

function isMonth(token: DateToken): boolean {
  return (token.flags & DateTokenFlags.NonMonth) === 0;
}

function isTimeOfDay(token: DateToken): boolean {
  return (token.flags & DateTokenFlags.NonTime) === 0 && (token.flags & DateTokenFlags.HasColon) !== 0;
}

function isNumericZone(token: DateToken): boolean {
  return (token.flags & DateTokenFlags.NonNumericZone) === 0 && (token.flags & DateTokenFlags.HasSign) !== 0;
}

function isAlphaZone(token: DateToken): boolean {
  return (token.flags & DateTokenFlags.NonAlphaZone) === 0;
}

function isTimeZone(token: DateToken): boolean {
  return isNumericZone(token) || isAlphaZone(token);
}

function asciiToken(text: Uint8Array, token: DateToken, length = token.length): string {
  let value = '';
  for (let i = 0; i < length; i++) value += String.fromCharCode(text[token.start + i]!);
  return value;
}

function tryParseInt32(text: Uint8Array, state: { index: number }, endIndex: number): number | null {
  const startIndex = state.index;
  let value = 0;

  while (state.index < endIndex && text[state.index]! >= 0x30 && text[state.index]! <= 0x39) {
    const digit = text[state.index]! - 0x30;
    if (value > 214748364 || (value === 214748364 && digit > 7)) return null;
    value = (value * 10) + digit;
    state.index++;
  }

  return state.index > startIndex ? value : null;
}

function isWhitespace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0d || c === 0x0a;
}

function skipComment(text: Uint8Array, state: { index: number }, endIndex: number): boolean {
  let escaped = false;
  let depth = 1;
  state.index++;

  while (state.index < endIndex && depth > 0) {
    const c = text[state.index]!;
    if (c === 0x5c) {
      escaped = !escaped;
    } else if (!escaped) {
      if (c === 0x28) depth++;
      else if (c === 0x29) depth--;
    } else {
      escaped = false;
    }

    state.index++;
  }

  return depth === 0;
}

function skipWhiteSpace(text: Uint8Array, state: { index: number }, endIndex: number): boolean {
  const startIndex = state.index;
  while (state.index < endIndex && isWhitespace(text[state.index]!)) state.index++;
  return state.index > startIndex;
}

function skipCommentsAndWhiteSpace(text: Uint8Array, state: { index: number }, endIndex: number): boolean {
  skipWhiteSpace(text, state, endIndex);

  while (state.index < endIndex && text[state.index] === 0x28) {
    if (!skipComment(text, state, endIndex)) return false;
    skipWhiteSpace(text, state, endIndex);
  }

  return true;
}

function tryGetWeekday(token: DateToken, text: Uint8Array): number | null {
  if (!isWeekday(token) || token.length < 3) return null;

  const name = asciiToken(text, token, 3).toLowerCase();
  for (let day = 0; day < weekDays.length; day++) {
    if (weekDays[day].toLowerCase() === name) return day;
  }

  return null;
}

function tryGetDayOfMonth(token: DateToken, text: Uint8Array): number | null {
  if (!isNumeric(token)) return null;

  const state = { index: token.start };
  const day = tryParseInt32(text, state, token.start + token.length);
  if (day === null || day <= 0 || day > 31) return null;
  return day;
}

function tryGetMonth(token: DateToken, text: Uint8Array): number | null {
  if (!isMonth(token) || token.length < 3) return null;

  const name = asciiToken(text, token, 3).toLowerCase();
  for (let i = 0; i < months.length; i++) {
    if (months[i].toLowerCase() === name) return i + 1;
  }

  return null;
}

function tryGetYear(token: DateToken, text: Uint8Array): number | null {
  if (!isNumeric(token)) return null;

  const state = { index: token.start };
  let year = tryParseInt32(text, state, token.start + token.length);
  if (year === null) return null;
  if (year < 100) year += year < 70 ? 2000 : 1900;
  // C# rejects years DateTimeOffset can't represent (> 9999) — final-review #3
  return year >= 1969 && year <= 9999 ? year : null;
}

function tryGetTimeOfDay(token: DateToken, text: Uint8Array): [number, number, number] | null {
  if (!isTimeOfDay(token)) return null;

  const endIndex = token.start + token.length;
  const state = { index: token.start };
  const hour = tryParseInt32(text, state, endIndex);
  if (hour === null || hour > 23) return null;

  if (state.index >= endIndex || text[state.index++] !== 0x3a) return null;

  const minute = tryParseInt32(text, state, endIndex);
  if (minute === null || minute > 59) return null;

  if (state.index >= endIndex || text[state.index++] !== 0x3a) return [hour, minute, 0];

  let second = tryParseInt32(text, state, endIndex);
  if (second === null || second > 60) return null;

  if (hour === 23 && minute === 59 && second === 60) {
    second = 59;
  } else if (second === 60) {
    return null;
  }

  return state.index === endIndex ? [hour, minute, second] : null;
}

function isAmOrPm(token: DateToken, text: Uint8Array, hour: number): number | null {
  if (isAlphaZone(token) && token.length === 2) {
    const first = text[token.start]!;
    const second = text[token.start + 1]!;
    if (second === 0x4d || second === 0x6d) {
      if (first === 0x41 || first === 0x61) return hour === 12 ? 0 : hour;
      if (first === 0x50 || first === 0x70) return hour < 12 ? hour + 12 : hour;
    }
  }

  return null;
}

function tryGetTimeZone(token: DateToken, text: Uint8Array, allowNumeric = true): number | null {
  let tzone = 0;

  if (isNumericZone(token)) {
    const endIndex = token.start + token.length;
    const state = { index: token.start };
    let sign: number;

    if (text[state.index] === 0x2d) sign = -1;
    else if (text[state.index] === 0x2b) sign = 1;
    else return null;

    state.index++;
    const parsed = tryParseInt32(text, state, endIndex);
    if (parsed === null || state.index !== endIndex) return null;
    tzone = parsed * sign;
  } else if (isAlphaZone(token)) {
    if (token.length > 3) return null;
    const value = timezones.get(asciiToken(text, token).toUpperCase());
    if (value === undefined) return null;
    tzone = value;
  } else if (allowNumeric && isNumeric(token)) {
    const endIndex = token.start + token.length;
    const state = { index: token.start };
    const parsed = tryParseInt32(text, state, endIndex);
    if (parsed === null || state.index !== endIndex) return null;
    tzone = parsed;
  }

  if (tzone < -1200 || tzone > 1400) return null;
  return tzone;
}

function isTokenDelimiter(c: number): boolean {
  return c === 0x2d || c === 0x2f || c === 0x2c || isWhitespace(c);
}

function tokenizeDate(text: Uint8Array, startIndex: number, length: number): DateToken[] {
  const tokens: DateToken[] = [];
  const endIndex = startIndex + length;
  let index = startIndex;

  while (index < endIndex) {
    const state = { index };
    if (!skipCommentsAndWhiteSpace(text, state, endIndex)) break;
    index = state.index;

    if (index >= endIndex) break;

    let mask = datetok[text[index]!]!;
    if (mask !== DateTokenFlags.None) {
      const start = index++;

      while (index < endIndex && !isTokenDelimiter(text[index]!)) {
        mask |= datetok[text[index]!]!;
        index++;
      }

      tokens.push({ flags: mask, start, length: index - start });
    }

    index++;
  }

  return tokens;
}

function offsetFromTZone(tzone: number): number {
  const minutes = tzone % 100;
  const hours = Math.trunc(tzone / 100);
  return (hours * 60) + minutes;
}

function makeDateTimeOffset(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  offsetMinutes: number,
): DateTimeOffset | null {
  if (offsetMinutes < -14 * 60 || offsetMinutes > 14 * 60) return null;

  const localMillis = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const local = new Date(localMillis);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return null;
  }

  return { epochMillis: localMillis - (offsetMinutes * 60_000), offsetMinutes };
}

function tryParseStandardDateFormat(tokens: DateToken[], text: Uint8Array): DateTimeOffset | null {
  let n = 0;

  if (tokens.length < 5) return null;

  if (tryGetWeekday(tokens[n]!, text) !== null) {
    if (tokens.length < 6) return null;
    n++;
  }

  const day = tryGetDayOfMonth(tokens[n++]!, text);
  if (day === null) return null;

  const month = tryGetMonth(tokens[n++]!, text);
  if (month === null) return null;

  const year = tryGetYear(tokens[n++]!, text);
  if (year === null) return null;

  const tod = tryGetTimeOfDay(tokens[n++]!, text);
  if (tod === null) return null;
  let [hour, minute, second] = tod;

  const ampm = isAmOrPm(tokens[n]!, text, hour);
  if (ampm !== null) {
    hour = ampm;
    n++;
  }

  const tzone = n >= tokens.length ? 0 : (tryGetTimeZone(tokens[n]!, text) ?? 0);
  return makeDateTimeOffset(year, month, day, hour, minute, second, offsetFromTZone(tzone));
}

function tryParseUnknownDateFormat(tokens: DateToken[], text: Uint8Array): DateTimeOffset | null {
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  let tzone: number | null = null;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let numericMonth = false;
  let haveWeekday = false;
  let haveTime = false;
  let haveAmPm = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!haveWeekday && tryGetWeekday(token, text) !== null) {
      haveWeekday = true;
      continue;
    }

    const monthValue = tryGetMonth(token, text);
    if ((month === null || numericMonth) && monthValue !== null) {
      if (numericMonth) {
        numericMonth = false;
        day = month;
      }

      month = monthValue;
      continue;
    }

    const tod = tryGetTimeOfDay(token, text);
    if (!haveTime && tod !== null) {
      [hour, minute, second] = tod;
      haveTime = true;
      continue;
    }

    const ampm = isAmOrPm(token, text, hour);
    if (haveTime && tzone === null && !haveAmPm && ampm !== null) {
      hour = ampm;
      haveAmPm = true;
      continue;
    }

    const zoneValue = isTimeZone(token) ? tryGetTimeZone(token, text, false) : null;
    if (tzone === null && zoneValue !== null) {
      tzone = zoneValue;
      continue;
    }

    if (isNumeric(token)) {
      if (token.length === 4) {
        if (year === null) {
          const value = tryGetYear(token, text);
          if (value !== null) year = value;
        } else if (tzone === null) {
          const value = tryGetTimeZone(token, text);
          if (value !== null) tzone = value;
        }

        continue;
      }

      if (token.length > 2) continue;

      const state = { index: token.start };
      const value = tryParseInt32(text, state, token.start + token.length);
      if (value === null) continue;

      if (month === null && value > 0 && value <= 12) {
        numericMonth = true;
        month = value;
        continue;
      }

      if (day === null && value > 0 && value <= 31) {
        day = value;
        continue;
      }

      if (year === null && value >= 69) {
        year = 1900 + value;
        continue;
      }
    }
  }

  if (year === null || month === null || day === null) return null;
  if (!haveTime) hour = minute = second = 0;

  return makeDateTimeOffset(year, month, day, hour, minute, second, offsetFromTZone(tzone ?? 0));
}

function inputToBytes(text: string | Uint8Array): Uint8Array {
  return typeof text === 'string' ? utf8.encode(text) : text;
}

export function parseDate(text: string | Uint8Array): Result<DateTimeOffset> {
  const buffer = inputToBytes(text);
  const tokens = tokenizeDate(buffer, 0, buffer.length);
  const date = tryParseStandardDateFormat(tokens, buffer) ?? tryParseUnknownDateFormat(tokens, buffer);

  if (date === null) return err('invalid-date', 'Invalid date.');
  return ok(date);
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function pad4(value: number): string {
  if (value < 10) return `000${value}`;
  if (value < 100) return `00${value}`;
  if (value < 1000) return `0${value}`;
  return `${value}`;
}

export function formatDate(dto: DateTimeOffset): string {
  const local = new Date(dto.epochMillis + (dto.offsetMinutes * 60_000));
  const sign = dto.offsetMinutes < 0 ? '-' : '+';
  const offset = Math.abs(dto.offsetMinutes);
  const offsetHours = Math.trunc(offset / 60);
  const offsetMinutes = offset % 60;

  return `${weekDays[local.getUTCDay()]}, ${pad2(local.getUTCDate())} ${months[local.getUTCMonth()]} ` +
    `${pad4(local.getUTCFullYear())} ${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}:` +
    `${pad2(local.getUTCSeconds())} ${sign}${pad2(offsetHours)}${pad2(offsetMinutes)}`;
}
