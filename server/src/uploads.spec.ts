import { describe, expect, it } from 'vitest';
import { sniffKind } from './sniff.js';

/** Builds a 16-byte header, which is what verifyAssets downloads. */
function head(...parts: (number | string)[]): Buffer {
  const bytes: number[] = [];
  for (const part of parts) {
    if (typeof part === 'number') bytes.push(part);
    else for (const char of part) bytes.push(char.charCodeAt(0));
  }
  while (bytes.length < 16) bytes.push(0);
  return Buffer.from(bytes);
}

/** ISO base media container: 4 size bytes, 'ftyp', then the brand. */
const isobmff = (brand: string) => head(0, 0, 0, 0x20, 'ftyp', brand);

describe('sniffKind', () => {
  it('recognises the common photo formats', () => {
    expect(sniffKind(head(0xff, 0xd8, 0xff, 0xe0))).toBe('image');
    expect(sniffKind(head(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image');
    expect(sniffKind(head('GIF89a'))).toBe('image');
    expect(sniffKind(head('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image');
  });

  it('recognises iPhone HEIC as an image, not a video', () => {
    // Same container as MP4, so only the brand tells them apart. Getting this
    // wrong would apply the 2 GB video limit to photos and vice versa.
    expect(sniffKind(isobmff('heic'))).toBe('image');
    expect(sniffKind(isobmff('heix'))).toBe('image');
    expect(sniffKind(isobmff('mif1'))).toBe('image');
    expect(sniffKind(isobmff('avif'))).toBe('image');
  });

  it('recognises the common video formats', () => {
    expect(sniffKind(isobmff('isom'))).toBe('video');
    expect(sniffKind(isobmff('mp42'))).toBe('video');
    expect(sniffKind(isobmff('qt  '))).toBe('video'); // iPhone .mov
    expect(sniffKind(isobmff('3gp4'))).toBe('video');
    expect(sniffKind(head(0x1a, 0x45, 0xdf, 0xa3))).toBe('video'); // WebM / MKV
    expect(sniffKind(head('RIFF', 0, 0, 0, 0, 'AVI '))).toBe('video');
  });

  it('treats an unfamiliar brand in a known container as video', () => {
    expect(sniffKind(isobmff('zzzz'))).toBe('video');
  });

  it('rejects files that are neither photo nor video', () => {
    expect(sniffKind(head('%PDF-1.7'))).toBe('unknown');
    expect(sniffKind(head('PK', 0x03, 0x04))).toBe('unknown'); // zip, docx, apk
    expect(sniffKind(head('#!/bin/sh'))).toBe('unknown');
    expect(sniffKind(head(0x4d, 0x5a))).toBe('unknown'); // Windows executable
  });

  it('rejects a RIFF container that is neither WEBP nor AVI', () => {
    expect(sniffKind(head('RIFF', 0, 0, 0, 0, 'WAVE'))).toBe('unknown');
  });

  it('rejects a renamed file: the extension never decides here', () => {
    // A .zip renamed to .mp4 arrives with a zip header and must be refused,
    // which is exactly what the browser-side check cannot catch.
    expect(sniffKind(head('PK', 0x03, 0x04, 0x14))).toBe('unknown');
  });

  it('rejects a header too short to classify', () => {
    expect(sniffKind(Buffer.from([0xff, 0xd8, 0xff]))).toBe('unknown');
    expect(sniffKind(Buffer.alloc(0))).toBe('unknown');
  });
});
