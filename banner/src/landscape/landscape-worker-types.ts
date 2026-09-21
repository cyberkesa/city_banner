import type { LandscapeMap } from './landscape-schema'
import type { ResolvedVegetation } from './vegetation-layout'

export type LandscapeWorkerTask =
  | { id: number; type: 'resolve-vegetation'; map: LandscapeMap }

export type LandscapeWorkerSuccess =
  | { id: number; ok: true; type: 'resolve-vegetation'; result: ResolvedVegetation[] }

export type LandscapeWorkerFailure = { id: number; ok: false; error: string }

export type LandscapeWorkerResult = LandscapeWorkerSuccess | LandscapeWorkerFailure
