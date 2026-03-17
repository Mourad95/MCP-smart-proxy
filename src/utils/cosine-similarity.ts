/**
 * Cosine similarity for normalized vectors.
 * For unit-normalized vectors, dot product equals cosine similarity.
 * Used by semantic cache and any code that compares embeddings from VectorMemory
 * (which uses normalize: true).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // If vectors are normalized, dot product is cosine similarity (no need to divide by norms)
  return dot;
}
