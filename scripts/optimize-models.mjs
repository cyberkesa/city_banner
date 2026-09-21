import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = path.join(root, 'assets', 'models-source')
const outputDirectory = path.join(root, 'artifacts', 'models-optimized-candidate')
const cli = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform'
)

async function listGlbFiles(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listGlbFiles(fullPath, relativePath))
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) files.push(relativePath)
  }
  return files
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { stdio: 'pipe' })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(output)))
  })
}

const files = (await listGlbFiles(sourceDirectory)).sort((a, b) => a.localeCompare(b, 'ru'))
const requested = process.argv.slice(2)
const selected = requested.length ? files.filter((file) => requested.includes(file)) : files
if (requested.length && selected.length !== requested.length) throw new Error('Не найдены некоторые запрошенные модели.')

if (!requested.length) {
  await rm(outputDirectory, { recursive: true, force: true })
}
await mkdir(outputDirectory, { recursive: true })
const results = []

for (const relativePath of selected) {
  const source = path.join(sourceDirectory, relativePath)
  const output = path.join(outputDirectory, relativePath)
  await mkdir(path.dirname(output), { recursive: true })
  try {
    await run(['meshopt', source, output, '--level', 'medium', '--quantize-position', '16', '--quantize-normal', '12', '--quantize-texcoord', '14'])
    await run(['validate', output, '--format', 'csv'])
    const [before, after] = await Promise.all([stat(source), stat(output)])
    results.push({ file: relativePath, before: before.size, after: after.size, status: 'ok' })
  } catch {
    await cp(source, output)
    const size = (await stat(source)).size
    results.push({ file: relativePath, before: size, after: size, status: 'source-copy' })
    console.warn(`Сжать не удалось, сохранена исходная копия: ${relativePath}`)
  }
}

const totals = results.reduce((sum, item) => ({ before: sum.before + item.before, after: sum.after + item.after }), { before: 0, after: 0 })
await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify({ profile: 'meshopt-geometry-only-v1', generatedAt: new Date().toISOString(), totals, models: results }, null, 2))
console.log(`Проверено моделей: ${results.length}`)
console.log(`Размер: ${(totals.before / 1024 / 1024).toFixed(2)} МБ → ${(totals.after / 1024 / 1024).toFixed(2)} МБ`)
