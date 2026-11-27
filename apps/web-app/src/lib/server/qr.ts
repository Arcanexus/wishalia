import qrcode from "qrcode-generator";

/**
 * A QR code for a share link (docs/management-app.md, « Share »), drawn by the page as one SVG
 * path: one small square per dark module, on a grid of `size` modules plus a quiet zone of 2.
 * Made on the server, so that the page sends no QR library to the browser.
 */
export function qrPath(text: string): { size: number; path: string } {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const count = code.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (code.isDark(row, column)) parts.push(`M${column + 2} ${row + 2}h1v1h-1z`);
    }
  }
  return { size: count + 4, path: parts.join("") };
}
