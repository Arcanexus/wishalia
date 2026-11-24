/**
 * A big photo made lighter on the device before it is sent (docs/images.md): 2 048 px on its
 * longest side, as a JPEG. Quicker on a weak connection, lighter in the bucket; the browser also
 * turns it the right way and drops its EXIF data (where it was taken). Small files, GIFs (they may
 * move) and anything the browser cannot read go as they are.
 */
export const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;
export const MAX_SIDE = 2048;

/** The size to draw at, the longest side at most `max`. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function shrinkPhoto(file: File): Promise<File | Blob> {
  if (
    file.size <= SHRINK_ABOVE_BYTES ||
    file.type === "image/gif" ||
    typeof createImageBitmap !== "function"
  ) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // A transparent PNG gets a white background, as on a shop's page
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
