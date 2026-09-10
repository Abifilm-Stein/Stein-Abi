import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '../config';

export type FileKind = 'image' | 'video' | 'unknown';

/** Extensions we accept when the browser reports no (or a useless) MIME type. */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'hif'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', '3gp', 'hevc', 'mpg', 'mpeg'];

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Classify a picked file.
 *
 * MIME type first, extension as the fallback: iOS Safari hands over HEIC
 * photos and some `.mov` recordings with an empty `type`, so a MIME-only
 * check rejects perfectly valid iPhone material.
 */
export function detectKind(file: { name: string; type: string }): FileKind {
  const type = file.type.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';

  const ext = fileExtension(file.name);
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return 'unknown';
}

/**
 * HEIC/HEIF cannot be decoded by Chrome or Firefox, but Safari renders it
 * natively. So this is only a hint for choosing an optimistic preview -- the
 * UI still relies on the <img> error event, rather than assuming.
 */
export function isProbablyUndisplayable(file: { name: string; type: string }): boolean {
  const ext = fileExtension(file.name);
  return ['heic', 'heif', 'hif'].includes(ext) || file.type.includes('hei');
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function maxBytesFor(kind: FileKind): number {
  return kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // One decimal below 10 in every unit, so "1,4 GB" stays informative while
  // "512 MB" does not carry a pointless ",0".
  const decimals = value < 10 ? 1 : 0;
  return `${value.toFixed(decimals).replace('.', ',')} ${units[unit]}`;
}

/**
 * Client-side gate for fast feedback only.
 *
 * The server MUST validate again by sniffing magic bytes -- everything here is
 * attacker-controlled.
 */
export function validateFile(file: File): ValidationResult {
  if (file.size === 0) {
    return { ok: false, reason: 'Die Datei ist leer und kann nicht hochgeladen werden.' };
  }

  const kind = detectKind(file);
  if (kind === 'unknown') {
    return {
      ok: false,
      reason: 'Nur Fotos und Videos sind erlaubt. Diese Datei ist keines von beidem.',
    };
  }

  const limit = maxBytesFor(kind);
  if (file.size > limit) {
    const what = kind === 'video' ? 'Videos' : 'Fotos';
    return {
      ok: false,
      reason: `Zu groß (${formatBytes(file.size)}). ${what} dürfen maximal ${formatBytes(limit)} haben.`,
    };
  }

  return { ok: true };
}
