export function normalizeDatePart(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function formatBirthDate(year: string, month: string, day: string) {
  return `${year}-${month}-${day}`;
}

export function splitPastedBirthDate(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return {
    year: digits.slice(0, 4),
    month: digits.slice(4, 6),
    day: digits.slice(6, 8),
  };
}
