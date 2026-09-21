import * as THREE from 'three'

import { applyModelTransform, centerModelOnGround, setupModelShadows } from '../models/model-utils'
import { LOOP_WIDTH } from '../core/loop'
import { loadModelAsset } from '../models/model-loader'
import { walkerRouteAt } from './walker-route'

export class Walker {
  readonly root = new THREE.Group()

  private mixer: THREE.AnimationMixer | null = null
  private speed = 0.4

  private readonly minX = -LOOP_WIDTH / 2 + 2
  private readonly maxX = LOOP_WIDTH / 2 - 2

  async load(): Promise<void> {
    const { model, animations } = await loadModelAsset('/models/person-man.glb')

    setupModelShadows(model)

    applyModelTransform(model, {
      scale: 0.65,
      rotationY: 90,
    })

    model.updateMatrixWorld(true)
    centerModelOnGround(model)

    this.root.add(model)

    
    const start = walkerRouteAt(-12)
    this.root.position.set(-12, start.y, start.z)

    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model)
      const action = this.mixer.clipAction(animations[0])
      action.play()
    }
  }

  update(delta: number): void {
    this.mixer?.update(delta)

    const current = walkerRouteAt(this.root.position.x)
    this.root.position.x += this.speed * delta / Math.hypot(1, current.slope)

    if (this.root.position.x > this.maxX) {
      this.root.position.x = this.minX
    }

    const route = walkerRouteAt(this.root.position.x)
    this.root.position.z = route.z
    this.root.position.y = route.y
    this.root.rotation.y = -Math.atan(route.slope)
  }
}
