import * as THREE from 'three'

import {
  ENVIRONMENT_MODELS,
  type EnvironmentModelConfig,
} from './environment.config'

import {
  LOOP_COPIES,
  LOOP_WIDTH,
} from '../core/loop'

import { loadModelAsset } from '../models/model-loader'

import {
  applyModelTransform,
  centerModelOnGround,
  setupModelShadows,
} from '../models/model-utils'
import { freezeStaticTransforms } from '../core/static-transforms'

export class Environment {
  private readonly world: THREE.Group

  private readonly ownedObjects:
    THREE.Object3D[] = []

  private readonly mixers:
    THREE.AnimationMixer[] = []

  constructor(
    world: THREE.Group
  ) {
    this.world = world
  }

  async load(): Promise<void> {
    await Promise.all(
      ENVIRONMENT_MODELS.flatMap(
        (config) =>
          LOOP_COPIES.map(
            (cycle) =>
              this.addModel(
                config,
                cycle
              )
          )
      )
    )
  }

  update(delta: number): void {
    for (const mixer of this.mixers) {
      mixer.update(delta)
    }
  }

  freezeStaticTransforms(): void {
    if (this.mixers.length > 0) return
    for (const object of this.ownedObjects) freezeStaticTransforms(object)
  }

  dispose(): void {
    for (const mixer of this.mixers) {
      mixer.stopAllAction()
    }

    this.mixers.length = 0

    for (
      const object
      of this.ownedObjects
    ) {
      object.parent?.remove(
        object
      )
    }

    this.ownedObjects.length = 0
  }

  private async addModel(
    config: EnvironmentModelConfig,
    cycle: number
  ): Promise<void> {
    try {
      const {
        model,
        animations,
      } = await loadModelAsset(
        config.model
      )

      setupModelShadows(
        model
      )

      applyModelTransform(
        model,
        {
          scale:
            config.scale,

          rotationY:
            config.rotationY,
        }
      )

      model.updateMatrixWorld(
        true
      )

      centerModelOnGround(
        model
      )

      model.position.x +=
        config.position[0] +
        cycle * LOOP_WIDTH

      model.position.y +=
        config.position[1]

      model.position.z +=
        config.position[2]

      model.name =
        `environment:${config.id}@${cycle}`

      this.world.add(
        model
      )

      this.ownedObjects.push(
        model
      )

      if (config.animation) {
        const clip =
          THREE.AnimationClip.findByName(
            animations,
            config.animation
          )

        if (!clip) {
          console.warn(
            `Анимация "${config.animation}" не найдена у "${config.id}". Доступно:`,
            animations.map(
              (animation) => animation.name
            )
          )
          return
        }

        const mixer =
          new THREE.AnimationMixer(
            model
          )

        mixer
          .clipAction(clip)
          .play()

        this.mixers.push(
          mixer
        )
      }
    } catch (error) {
      console.error(
        `Ошибка загрузки окружения "${config.id}":`,
        error
      )
    }
  }
}
