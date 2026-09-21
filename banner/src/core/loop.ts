
export const LOOP_WIDTH = 70
export const LOOP_HALF = LOOP_WIDTH / 2
export const LOOP_COPIES = [-1, 0, 1] as const

export function wrapLoop(value: number): number {
  let v = value % LOOP_WIDTH
  if (v >= LOOP_HALF) v -= LOOP_WIDTH
  if (v < -LOOP_HALF) v += LOOP_WIDTH
  return v
}
