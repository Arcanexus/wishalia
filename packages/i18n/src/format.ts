import { LOCALE_TAGS, type Locale } from "./locales.js";

/**
 * Dates, amounts and lists of names in the reader's language. Amounts are in cents and in euros
 * (the currency of the data model); days are YYYY-MM-DD and read in UTC, like the API writes them.
 */
export interface Formatters {
  locale: Locale;
  /** BCP 47 tag, for <html lang> and Intl. */
  tag: string;
  /** « 49,90 € » or « 120 € » in French, « €49.90 » or « €120 » in English. */
  money(cents: number): string;
  /** An amount as typed back into a field, with no currency nor grouping: « 12,50 », « 12.50 », « 320 ». */
  amount(cents: number): string;
  /** An event's day: « samedi 24 décembre 2026 », « Saturday 24 December 2026 ». */
  day(date: string): string;
  /** A moment, without the weekday: « 24 décembre 2026 », « 24 December 2026 ». */
  date(iso: string | Date): string;
  /** A moment with its time, in the reader's time zone. */
  dateTime(iso: string | Date): string;
  /** « Paul et Jeanne », « Paul, Jeanne et Léa ». */
  list(names: readonly string[]): string;
  /** A whole number: « 1 200 », « 1,200 ». */
  number(value: number): string;
  /** The first letter of a word, upper-cased for this language. */
  upper(text: string): string;
}

const cache = new Map<Locale, Formatters>();

export function formatters(locale: Locale): Formatters {
  const known = cache.get(locale);
  if (known) return known;
  const tag = LOCALE_TAGS[locale];
  const money = new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" });
  const wholeMoney = new Intl.NumberFormat(tag, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  const decimal = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, useGrouping: false });
  const day = new Intl.DateTimeFormat(tag, { dateStyle: "full", timeZone: "UTC" });
  const date = new Intl.DateTimeFormat(tag, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: "long", timeStyle: "short" });
  const list = new Intl.ListFormat(tag, { style: "long", type: "conjunction" });
  const number = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const made: Formatters = {
    locale,
    tag,
    money: (cents) => (cents % 100 === 0 ? wholeMoney : money).format(cents / 100),
    amount: (cents) => (cents % 100 === 0 ? String(cents / 100) : decimal.format(cents / 100)),
    day: (value) => day.format(new Date(`${value}T00:00:00Z`)),
    date: (value) => date.format(new Date(value)),
    dateTime: (value) => dateTime.format(new Date(value)),
    list: (names) => list.format(names),
    number: (value) => number.format(value),
    upper: (text) => text.toLocaleUpperCase(tag),
  };
  cache.set(locale, made);
  return made;
}
