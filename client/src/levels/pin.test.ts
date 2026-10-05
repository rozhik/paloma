import { describe, it, expect } from 'vitest';
import { sha256 } from './sha256.js';
import { checkPin, createPin, isPinRecord, isValidPin } from './pin.js';

describe('sha256', () => {
  it('matches the NIST test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('hashes UTF-8 text and messages longer than one block', () => {
    expect(sha256('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
    expect(sha256('Привіт')).toHaveLength(64);
  });
});

describe('PIN', () => {
  it('has 4 to 8 digits', () => {
    expect(isValidPin('2580')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin(' 2580')).toBe(false);
  });

  it('is checked against its record', () => {
    const record = createPin('2580');
    expect(checkPin('2580', record)).toBe(true);
    expect(checkPin('2581', record)).toBe(false);
  });

  it('never stores the digits', () => {
    // A fixed salt keeps the test deterministic: a random hash may contain any 4 digits by chance
    for (const pin of ['2580', '0000', '12345678']) {
      expect(JSON.stringify(createPin(pin, 'abcdefabcdefabcdefabcdefabcdefab'))).not.toContain(pin);
    }
  });

  it('uses a fresh salt each time', () => {
    expect(createPin('2580').hash).not.toBe(createPin('2580').hash);
  });

  it('accepts only well-formed records', () => {
    expect(isPinRecord(createPin('2580'))).toBe(true);
    expect(isPinRecord({ salt: 'x', hash: 'y' })).toBe(false);
    expect(isPinRecord('2580')).toBe(false);
    expect(isPinRecord(null)).toBe(false);
  });
});
