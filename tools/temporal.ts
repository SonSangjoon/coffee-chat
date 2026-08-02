export type ExpandedPeriod = { start: string; end: string };

const partialDatePattern = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const fullDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  return (
    [31, leapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
      month - 1
    ] ?? 0
  );
}

function formatDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function expandPartialDate(value: string): ExpandedPeriod {
  const match = partialDatePattern.exec(value);
  if (!match) {
    throw new Error("Expected a supported Gregorian date precision");
  }

  const year = Number(match[1]);
  const month = match[2] === undefined ? undefined : Number(match[2]);
  const day = match[3] === undefined ? undefined : Number(match[3]);
  if (year < 1 || (month !== undefined && (month < 1 || month > 12))) {
    throw new Error("Invalid Gregorian calendar unit");
  }
  if (
    day !== undefined &&
    (month === undefined || day < 1 || day > daysInMonth(year, month))
  ) {
    throw new Error("Invalid Gregorian calendar unit");
  }

  if (month === undefined) {
    return {
      start: formatDate(year, 1, 1),
      end: formatDate(year, 12, 31),
    };
  }
  if (day === undefined) {
    return {
      start: formatDate(year, month, 1),
      end: formatDate(year, month, daysInMonth(year, month)),
    };
  }
  const date = formatDate(year, month, day);
  return { start: date, end: date };
}

export function expandTemporalCoverage(value: string): ExpandedPeriod {
  const parts = value.split("/");
  if (parts.length > 2 || parts.some((part) => part.length === 0)) {
    throw new Error("Expected one date or one closed date range");
  }

  const start = expandPartialDate(parts[0] as string).start;
  const end = expandPartialDate(parts[1] ?? (parts[0] as string)).end;
  if (start > end) {
    throw new Error("Reversed temporal range");
  }
  return { start, end };
}

export function temporalCoverageOverlaps(
  coverage: string,
  selected: string,
): boolean {
  const left = expandTemporalCoverage(coverage);
  const right = expandTemporalCoverage(selected);
  return left.start <= right.end && right.start <= left.end;
}

export function recordedOnThrough(recordedOn: string, cutoff: string): boolean {
  if (!fullDatePattern.test(recordedOn) || !fullDatePattern.test(cutoff)) {
    throw new Error("First-recorded cutoff requires a full Gregorian date");
  }
  const recorded = expandPartialDate(recordedOn);
  const through = expandPartialDate(cutoff);
  if (recorded.start !== recorded.end || through.start !== through.end) {
    throw new Error("First-recorded cutoff requires a full Gregorian date");
  }
  return recordedOn <= cutoff;
}
