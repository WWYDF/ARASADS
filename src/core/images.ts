import sharp from 'sharp';
import fs from 'fs/promises';

// Longest edge an optimized image is allowed to keep; 0 disables resizing.
const MAX_DIMENSION = Number(process.env.IMAGE_OPTIMIZE_MAX_DIMENSION || 4096);

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

// Re-encodes the image at sourcePath into optimizedPath as WebP: auto-orients
// from EXIF, caps runaway dimensions, and recompresses at a fixed quality.
// Returns false (leaving optimizedPath untouched) if sharp can't handle the
// source format, so the caller can fall back to storing the original.
export async function optimizeImage(sourcePath: string, optimizedPath: string, extension: string): Promise<boolean> {
  try {
    let pipeline = sharp(sourcePath, { animated: extension === 'gif' || extension === 'webp' })
      .rotate()
      .webp({ quality: 82 });

    if (MAX_DIMENSION > 0) {
      pipeline = pipeline.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    await pipeline.toFile(optimizedPath);
    return true;
  } catch {
    await fs.rm(optimizedPath, { force: true });
    return false;
  }
}
