import { describe, it, expect } from 'vitest';
import { AiCallError, checkAnswer, toCallError } from './answer.js';

describe('checkAnswer', () => {
  it('clips a box outside the image', () => {
    const checked = checkAnswer('objects', { objects: [{ label: 'dog', rect: { left: 0.5, top: -0.1, right: 1.2, bottom: 0.9 }, confidence: 0.92 }] });
    expect(checked.objects).toEqual([{ label: 'dog', rect: { left: 0.5, top: 0, right: 1, bottom: 0.9 }, confidence: 0.92 }]);
  });

  it('drops objects without a label or area', () => {
    const checked = checkAnswer('objects', {
      objects: [
        { label: ' ', rect: { left: 0, top: 0, right: 1, bottom: 1 } },
        { label: 'flat', rect: { left: 0.5, top: 0, right: 0.5, bottom: 1 } },
        { label: 'gone', rect: { left: 1.1, top: 0, right: 1.5, bottom: 1 } },
        { label: 'ball', rect: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 } },
      ],
    });
    expect(checked.objects).toEqual([{ label: 'ball', rect: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 }, confidence: null }]);
  });

  it('drops empty tags and case duplicates, and clamps confidences', () => {
    const checked = checkAnswer('tags', { tags: [{ name: 'beach' }, { name: '' }, '  sea ', { name: 'Beach', confidence: 0.9 }, { name: 'sky', confidence: 3 }] });
    expect(checked.tags).toEqual([{ name: 'beach', confidence: null }, { name: 'sea', confidence: null }, { name: 'sky', confidence: 1 }]);
  });

  it('trims the text and keeps token usage', () => {
    const checked = checkAnswer('text', { text: '  Two children on a sandy beach \n', usage: { inputTokens: 812, outputTokens: 9.4 } });
    expect(checked).toMatchObject({ text: 'Two children on a sandy beach', inputTokens: 812, outputTokens: 9 });
  });

  it('refuses an answer without the part the task asks for', () => {
    expect(() => checkAnswer('tags', { text: 'x' })).toThrow(AiCallError);
    expect(() => checkAnswer('text', { tags: [] })).toThrow('The answer has no text');
    expect(() => checkAnswer('objects', null)).toThrow('The answer is not an object');
  });
});

describe('toCallError', () => {
  it('keeps the kind and wait of a provider error', () => {
    const err = Object.assign(new Error('Slow down'), { kind: 'rate-limit', retryAfterMs: 2000 });
    expect(toCallError(err)).toMatchObject({ kind: 'rate-limit', message: 'Slow down', retryAfterMs: 2000 });
  });

  it('counts an error without a known kind as other', () => {
    expect(toCallError(new Error('boom'))).toMatchObject({ kind: 'other', message: 'boom' });
    expect(toCallError(Object.assign(new Error('x'), { kind: 'weird' })).kind).toBe('other');
  });
});
