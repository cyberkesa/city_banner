import './style.css'

import { createSceneEditor } from './controller'

type EditorWindow = Window & {
  __createSceneEditor?: typeof createSceneEditor
}

;(window as EditorWindow).__createSceneEditor = createSceneEditor

await import('../../banner/src/main.ts')
