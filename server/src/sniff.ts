/**
 * File type detection from the leading bytes.
 *
 * Kept free of any dependency on configuration or Google Cloud on purpose:
 * this is the security-relevant check in the whole upload path, so it has to
 * be unit-testable without credentials or a bucket.
 */

export type SniffedKind = 'image' | 'video' | 'unknown';

const ISOBMFF_IMAGE_BRANDS = ['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1', 'avif'];

const ISOBMFF_VIDEO_BRANDS = [
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'qt  ',
  'M4V ',
  'mmp4',
  '3gp4',
  '3gp5',
  '3g2a',
  'hvc1',
  'hev1',
  'dash',
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MATROSKA_SIGNATURE = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/**
 * Classify a file by its first bytes.
 *
 * This is the check that actually matters. The browser-side validation is
 * pure UX and trivially bypassed, because the bytes travel straight to
 * storage without passing through this service. Anything not recognised here
 * never gets a submission record.
 */
export function sniffKind(head: Buffer): SniffedKind {
  if (head.length < 12) return 'unknown';

  const ascii = (start: number, end: number): string =>
    head.subarray(start, end).toString('latin1');

  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image';
  if (head.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image';
  if (ascii(0, 4) === 'GIF8') return 'image';
  if (head[0] === 0x42 && head[1] === 0x4d) return 'image'; // BMP

  if (ascii(0, 4) === 'RIFF') {
    const form = ascii(8, 12);
    if (form === 'WEBP') return 'image';
    if (form === 'AVI ') return 'video';
    return 'unknown';
  }

  if (head.subarray(0, 4).equals(MATROSKA_SIGNATURE)) return 'video'; // MKV / WebM

  // MPEG program or elementary stream.
  if (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01) return 'video';

  // ISO base media format: MP4, MOV, HEIC and AVIF all share this container,
  // so the brand at offset 8 is what tells them apart.
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (ISOBMFF_IMAGE_BRANDS.includes(brand)) return 'image';
    if (ISOBMFF_VIDEO_BRANDS.includes(brand)) return 'video';
    // A known container with an unfamiliar brand is almost always a phone
    // recording, so treat it as video -- the stricter size limit still holds.
    return 'video';
  }

  return 'unknown';
}
