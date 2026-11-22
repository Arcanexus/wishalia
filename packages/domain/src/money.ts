/**
 * Amounts are always integers in minor units (cents). Floating point never touches money:
 * 0.1 + 0.2 must not end up in a gift pool.
 */

/** An amount in minor units (cents), always a safe integer. */
export type Cents = number & { readonly __brand: "Cents" };

const DECIMAL = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/;

/** Builds an amount from an integer number of cents. */
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`An amount in cents must be a safe integer, got ${value}`);
  }
  return value as Cents;
}

/**
 * Parses an amount typed by a person ("12", "12.5", "12,50"). The comma is accepted because the
 * family types amounts the French way. Returns null when the text is not an amount.
 */
export function parseAmount(text: string): Cents | null {
  const match = DECIMAL.exec(text.trim().replace(/\s/g, ""));
  if (!match) {
    return null;
  }
  const [, sign, units = "0", fraction = ""] = match;
  const value = Number(units) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(value)) {
    return null;
  }
  return cents(sign ? -value : value);
}

/** Adds amounts, without floating point. */
export function sum(amounts: readonly Cents[]): Cents {
  return cents(amounts.reduce<number>((total, amount) => total + amount, 0));
}

/** Formats an amount for display, in the given locale and currency (default: fr-FR, EUR). */
export function formatAmount(amount: Cents, locale = "fr-FR", currency = "EUR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);
}
