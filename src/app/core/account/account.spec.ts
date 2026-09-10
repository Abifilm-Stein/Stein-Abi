import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatCode,
  generateCode,
  isCompleteCode,
  isValidCode,
  normalizeCode,
} from './account';

describe('normalizeCode', () => {
  it('accepts the code exactly as printed', () => {
    expect(normalizeCode('ABCD-EFGH-JKMN')).toBe('ABCDEFGHJKMN');
  });

  it('tolerates lower case, spaces and missing dashes', () => {
    expect(normalizeCode('abcd efgh jkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizeCode('abcdefghjkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizeCode('  ABCD--EFGH  JKMN ')).toBe('ABCDEFGHJKMN');
  });

  it('caps at the code length so extra keystrokes cannot smuggle characters', () => {
    expect(normalizeCode('ABCDEFGHJKMNXXXX').length).toBe(CODE_LENGTH);
  });

  it('does not silently rewrite look-alike characters', () => {
    // O is not in the alphabet. Rewriting it would produce a different code
    // that then fails for a reason the student cannot see, so it is kept and
    // reported as invalid instead.
    expect(normalizeCode('OBCD-EFGH-JKMN')).toContain('O');
    expect(isValidCode('OBCD-EFGH-JKMN')).toBe(false);
  });
});

describe('isCompleteCode / isValidCode', () => {
  it('rejects an unfinished code', () => {
    expect(isCompleteCode('ABCD-EFGH')).toBe(false);
    expect(isValidCode('ABCD-EFGH')).toBe(false);
  });

  it('accepts a complete code built from the alphabet', () => {
    expect(isCompleteCode('ABCD-EFGH-JKMN')).toBe(true);
    expect(isValidCode('ABCD-EFGH-JKMN')).toBe(true);
  });

  it('treats a complete code with an excluded glyph as invalid', () => {
    // Right length, but I, L, O, U, 0 and 1 cannot occur.
    expect(isCompleteCode('ABCD-EFGH-JKM1')).toBe(true);
    expect(isValidCode('ABCD-EFGH-JKM1')).toBe(false);
  });
});

describe('formatCode', () => {
  it('groups in fours for printing', () => {
    expect(formatCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });

  it('groups partial input while typing', () => {
    expect(formatCode('ABCDE')).toBe('ABCD-E');
    expect(formatCode('AB')).toBe('AB');
  });
});

describe('generateCode', () => {
  it('produces a valid code of the right shape', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = generateCode();
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(isValidCode(code)).toBe(true);
    }
  });

  it('never emits an ambiguous glyph', () => {
    const excluded = ['I', 'O', 'L', 'U', '0', '1'];
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = normalizeCode(generateCode());
      for (const character of code) {
        expect(CODE_ALPHABET.includes(character)).toBe(true);
        expect(excluded).not.toContain(character);
      }
    }
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(codes.size).toBe(200);
  });
});
