export type LocalDateParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
};

export type LocalDateTimeParts = LocalDateParts & {
  hour: number;
  minute: number;
  second?: number;
};

function getInt(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((p) => p.type === type)?.value;
  if (!value) throw new Error(`Missing Intl part: ${type}`);
  return parseInt(value, 10);
}

export function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  return {
    year: getInt(parts, 'year'),
    month: getInt(parts, 'month'),
    day: getInt(parts, 'day'),
  };
}

export function getWeekdayKey(date: Date, timeZone: string):
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday' {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' })
    .format(date)
    .toLowerCase();
  switch (weekday) {
    case 'monday':
    case 'tuesday':
    case 'wednesday':
    case 'thursday':
    case 'friday':
    case 'saturday':
    case 'sunday':
      return weekday;
    default:
      throw new Error(`Unexpected weekday: ${weekday}`);
  }
}

function getTimeZoneOffsetMs(dateUtc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(dateUtc);
  const year = getInt(parts, 'year');
  const month = getInt(parts, 'month');
  const day = getInt(parts, 'day');
  const hour = getInt(parts, 'hour');
  const minute = getInt(parts, 'minute');
  const second = getInt(parts, 'second');
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - dateUtc.getTime();
}

export function zonedTimeToUtcMs(local: LocalDateTimeParts, timeZone: string): number {
  const second = local.second ?? 0;
  let guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, second);
  for (let i = 0; i < 2; i++) {
    const offset = getTimeZoneOffsetMs(new Date(guess), timeZone);
    const next = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, second) - offset;
    if (Math.abs(next - guess) < 1000) return next;
    guess = next;
  }
  return guess;
}

export function parseHHmm(hhmm: string): { hour: number; minute: number } {
  const trimmed = (hhmm || '').trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!m) throw new Error(`Invalid HH:mm: ${hhmm}`);
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}

export function addUtcDays(dateParts: LocalDateParts, days: number): LocalDateParts {
  const d = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + days, 12, 0, 0));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

