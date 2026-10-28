// Exact money helpers. All accounting arithmetic is performed in integer cents
// (BigInt), never with JavaScript floating point.
export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0n;
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d{1,4})?$/.test(raw)) throw new Error(`无效金额：${raw}`);
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  const frac = (fraction + '00').slice(0, 2);
  const cents = BigInt(whole) * 100n + BigInt(frac);
  return negative ? -cents : cents;
}

export function fromCents(cents) {
  const value = BigInt(cents);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const fraction = String(abs % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function maxCents(a, b) {
  return a > b ? a : b;
}

export function minCents(a, b) {
  return a < b ? a : b;
}

export function sumCents(values) {
  return values.reduce((sum, value) => sum + toCents(value), 0n);
}

export function moneyString(value) {
  return fromCents(toCents(value));
}
