/**
 * What a barcode scanned in the quick add gives (docs/management-app.md, « Scan a barcode »). A
 * book's code (an EAN-13 starting with 978 or 979, its ISBN) becomes a link to its page on Open
 * Library, which the worker reads like any link: its title and its cover. Any other product's code
 * is said back, for the person to name it: no free directory names every product.
 */
export type Scanned = { kind: "book"; isbn: string; url: string } | { kind: "other"; code: string };

/** Whether 13 digits carry a right EAN-13 check digit. */
export function validEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const sum = digits
    .slice(0, 12)
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

export function readScanned(raw: string): Scanned | null {
  const code = raw.replace(/[\s-]/g, "");
  if (!validEan13(code)) return /^\d{8,14}$/.test(code) ? { kind: "other", code } : null;
  if (code.startsWith("978") || code.startsWith("979")) {
    return { kind: "book", isbn: code, url: `https://openlibrary.org/isbn/${code}` };
  }
  return { kind: "other", code };
}

/** An ISBN as it is printed: 978-2-07-061275-8 is too much to know, 978 2070 612758 reads well. */
export function spacedIsbn(isbn: string): string {
  return `${isbn.slice(0, 3)} ${isbn.slice(3, 7)} ${isbn.slice(7)}`;
}
