const CALVER = /^(\d{4})\.(\d{2})\.(\d{2})$/;

function parts(value: string): [number, number, number] {
  const match = CALVER.exec(value);
  if (!match) throw new Error("calver-invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || year < 1)
    throw new Error("calver-invalid");
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error("calver-invalid");
  return [year, month, day];
}

export function isCalver(value: string): boolean {
  try {
    parts(value);
    return true;
  } catch {
    return false;
  }
}

export function calverForUtc(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("date-invalid");
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join(".");
}

export function compareCalver(left: string, right: string): number {
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference) return difference;
  }
  return 0;
}
