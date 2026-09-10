import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '../config';
import {
  detectKind,
  formatBytes,
  isProbablyUndisplayable,
  validateFile,
} from './file-validation';

/** Builds a File of a given size without allocating the bytes. */
function fakeFile(name: string, type: string, size: number): File {
  const file = new File([], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('detectKind', () => {
  it('classifies by MIME type when present', () => {
    expect(detectKind({ name: 'a.jpg', type: 'image/jpeg' })).toBe('image');
    expect(detectKind({ name: 'a.mp4', type: 'video/mp4' })).toBe('video');
  });

  it('falls back to the extension when iOS reports an empty type', () => {
    // This is the actual iPhone case: HEIC photos and some .mov recordings
    // arrive with type === ''. A MIME-only check would reject them.
    expect(detectKind({ name: 'IMG_0042.HEIC', type: '' })).toBe('image');
    expect(detectKind({ name: 'IMG_0043.MOV', type: '' })).toBe('video');
  });

  it('reports unknown for non-media files', () => {
    expect(detectKind({ name: 'notizen.pdf', type: 'application/pdf' })).toBe('unknown');
  });
});

describe('validateFile', () => {
  it('accepts a normal photo', () => {
    expect(validateFile(fakeFile('foto.jpg', 'image/jpeg', 3_000_000)).ok).toBe(true);
  });

  it('accepts iPhone HEIC and MOV without a MIME type', () => {
    expect(validateFile(fakeFile('IMG_1.HEIC', '', 4_000_000)).ok).toBe(true);
    expect(validateFile(fakeFile('IMG_2.MOV', '', 800_000_000)).ok).toBe(true);
  });

  it('accepts a large video up to the video limit', () => {
    expect(validateFile(fakeFile('film.mp4', 'video/mp4', MAX_VIDEO_BYTES)).ok).toBe(true);
  });

  it('rejects a video above the video limit', () => {
    const result = validateFile(fakeFile('film.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Zu groß');
  });

  it('applies the smaller image limit to images', () => {
    expect(validateFile(fakeFile('gross.png', 'image/png', MAX_IMAGE_BYTES + 1)).ok).toBe(false);
    // ...while the same size is still fine for a video.
    expect(validateFile(fakeFile('gross.mp4', 'video/mp4', MAX_IMAGE_BYTES + 1)).ok).toBe(true);
  });

  it('rejects documents', () => {
    expect(validateFile(fakeFile('zeugnis.pdf', 'application/pdf', 1000)).ok).toBe(false);
  });

  it('rejects empty files', () => {
    expect(validateFile(fakeFile('leer.jpg', 'image/jpeg', 0)).ok).toBe(false);
  });
});

describe('isProbablyUndisplayable', () => {
  it('flags HEIC so the UI is ready for a failed preview', () => {
    expect(isProbablyUndisplayable({ name: 'a.heic', type: '' })).toBe(true);
    expect(isProbablyUndisplayable({ name: 'a.jpg', type: 'image/jpeg' })).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats with German decimal separators', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1,0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2,0 GB');
  });
});
