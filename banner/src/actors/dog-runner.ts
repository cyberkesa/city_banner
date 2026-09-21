import * as THREE from 'three'

import { LOOP_COPIES, LOOP_WIDTH } from '../core/loop'
import { loadModelAsset } from '../models/model-loader'
import {
  centerModelOnGround,
  setupModelShadows,
} from '../models/model-utils'
import {
  DOG_COURSE_ORIGIN_X,
  DOG_COURSE_ORIGIN_Z,
  DOG_ROTATION_OFFSET_DEG,
  DOG_ROUTE_LENGTH,
  DOG_SCALE,
  DOG_SPEED,
  isDogBarrierJump,
  sampleDogRoute,
} from './dog-route'

type DogInstance = {
  holder: THREE.Group
  model: THREE.Group
  mixer: THREE.AnimationMixer
  run: THREE.AnimationAction
  jump: THREE.AnimationAction | null
  state: 'run' | 'jump'
}

const routePosition = new THREE.Vector3()
const routeTangent = new THREE.Vector3()
const routeTarget = new THREE.Vector3()
const routeLookTarget = new THREE.Vector3()
const routeWorldPosition = new THREE.Vector3()
const routeFacing = new THREE.Object3D()

export class DogRunner {
  readonly root =
    new THREE.Group()

  private readonly instances:
    DogInstance[] = []

  private distance = 0

  private direction:
    1 | -1 = -1

  setCourseAnchor(
    x: number,
    z: number
  ): void {
    this.root.position.set(
      x - DOG_COURSE_ORIGIN_X,
      0,
      z - DOG_COURSE_ORIGIN_Z
    )
  }

  async load(): Promise<void> {
    const loaded =
      await Promise.all(
        LOOP_COPIES.map(
          () =>
            loadModelAsset(
              '/models/dog.glb'
            )
        )
      )

    for (
      let i = 0;
      i < LOOP_COPIES.length;
      i += 1
    ) {
      const cycle =
        LOOP_COPIES[i]

      const {
        model,
        animations,
      } = loaded[i]

      setupModelShadows(
        model
      )

      model.scale.setScalar(
        DOG_SCALE
      )

      model.updateMatrixWorld(
        true
      )

      centerModelOnGround(
        model
      )

      
      const holder =
        new THREE.Group()

      holder.position.x =
        cycle * LOOP_WIDTH

      holder.add(
        model
      )

      this.root.add(
        holder
      )

      const mixer =
        new THREE.AnimationMixer(
          model
        )

      const runClip =
        THREE.AnimationClip.findByName(
          animations,
          'RunCycle'
        ) ??
        THREE.AnimationClip.findByName(
          animations,
          'WalkCycle'
        ) ??
        animations[0]

      if (!runClip) {
        throw new Error(
          'У dog.glb нет анимации для движения'
        )
      }

      const run =
        mixer.clipAction(
          runClip
        )

      run.play()

      const jumpClip =
        THREE.AnimationClip.findByName(
          animations,
          'Jump'
        )

      const jump =
        jumpClip
          ? mixer.clipAction(
              jumpClip
            )
          : null

      if (jump) {
        jump.enabled = true

        jump.setLoop(
          THREE.LoopOnce,
          1
        )

        jump.clampWhenFinished = true

        jump.setEffectiveWeight(
          0
        )

        jump.play()
      }

      this.instances.push({
        holder,
        model,
        mixer,
        run,
        jump,
        state: 'run',
      })
    }

    this.applyPose(0)
  }

  update(
    delta: number
  ): void {
    if (
      this.instances.length === 0
    ) {
      return
    }

    this.distance +=
      DOG_SPEED *
      delta *
      this.direction

    if (
      this.distance <= 0
    ) {
      this.distance = 0
      this.direction = 1
    } else if (
      this.distance >=
      DOG_ROUTE_LENGTH
    ) {
      this.distance =
        DOG_ROUTE_LENGTH

      this.direction = -1
    }

    this.applyPose(
      delta
    )
  }

  private applyPose(
    delta: number
  ): void {
    sampleDogRoute(this.distance, routePosition, routeTangent)
    routeTangent.multiplyScalar(this.direction)
    routeTarget.copy(routePosition).add(routeTangent)

    const jumpNow =
      isDogBarrierJump(
        routePosition
      )

    for (
      let i = 0;
      i < this.instances.length;
      i += 1
    ) {
      const instance =
        this.instances[i]

      const cycle =
        LOOP_COPIES[i]

      instance.holder.position.set(
        routePosition.x +
          cycle * LOOP_WIDTH,

        routePosition.y,

        routePosition.z
      )

      
      routeLookTarget.copy(routeTarget)
      routeLookTarget.x +=
        cycle * LOOP_WIDTH

      this.root.localToWorld(
        routeLookTarget
      )

      instance.holder.getWorldPosition(routeWorldPosition)
      routeFacing.position.copy(routeWorldPosition)
      routeFacing.lookAt(routeLookTarget)

      if (delta <= 0) {
        instance.holder.quaternion.copy(routeFacing.quaternion)
      } else {
        instance.holder.quaternion.slerp(
          routeFacing.quaternion,
          1 - Math.exp(-delta * 11)
        )
      }

      
      instance.model.rotation.y =
        THREE.MathUtils.degToRad(
          DOG_ROTATION_OFFSET_DEG
        )

      const nextState:
        'run' | 'jump' =
        jumpNow &&
        instance.jump
          ? 'jump'
          : 'run'

      if (
        nextState !==
        instance.state
      ) {
        if (
          nextState ===
            'jump' &&
          instance.jump
        ) {
          instance.jump
            .reset()
            .setDuration(0.9)
            .setEffectiveWeight(
              1
            )
            .fadeIn(
              0.10
            )
            .play()

          instance.run.fadeOut(
            0.10
          )
        } else {
          instance.run
            .reset()
            .setEffectiveWeight(
              1
            )
            .fadeIn(
              0.10
            )
            .play()

          instance.jump?.fadeOut(
            0.10
          )
        }

        instance.state =
          nextState
      }

      instance.mixer.update(
        delta
      )
    }
  }
}
