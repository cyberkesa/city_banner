export function createPRNG(seed: number): () => number {
  let v = (seed >>> 0) | 0
  return () => {
    v = (v + 0x6d2b79f5) | 0
    let r = Math.imul(v ^ (v >>> 15), v | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
