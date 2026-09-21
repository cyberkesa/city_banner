export type GrassPoint = readonly [number, number]

export type GrassBladeOptions = {
  density?: number
  maxInstances?: number
  height?: number
  width?: number
  y?: number
  seed?: number
}

export type GrassInstanceLayout = {
  matrices: Float32Array
  colors: Float32Array
  count: number
  centerX: number
  centerZ: number
  radius: number
}
