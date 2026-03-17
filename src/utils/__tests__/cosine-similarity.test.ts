import { cosineSimilarity } from '../cosine-similarity';

describe('cosineSimilarity', () => {
  it('returns 1 for identical normalized vectors', () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBe(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns -1 for opposite normalized vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBe(-1);
  });

  it('returns dot product for normalized vectors of length 384', () => {
    const dim = 384;
    const a = new Array(dim).fill(0);
    a[0] = 1;
    const b = new Array(dim).fill(0);
    b[0] = 1;
    expect(cosineSimilarity(a, b)).toBe(1);
  });

  it('returns correct value for two normalized vectors with same direction', () => {
    const a = [0.6, 0.8, 0];
    const b = [0.6, 0.8, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it('throws on length mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vector length mismatch');
    expect(() => cosineSimilarity([1], [1, 2])).toThrow('1 vs 2');
  });
});
