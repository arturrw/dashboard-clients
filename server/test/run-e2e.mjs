/**
 * Boots a throwaway API on its own database, seeds it, runs the integration
 * suite against it and shuts it down. The dev database is never touched.
 *
 * Set API_URL to skip the boot and test an already-running stack instead
 * (e.g. the docker-compose one behind nginx).
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const node = (args, env, opts = {}) =>
  spawnSync(process.execPath, ['--no-warnings', ...args], { cwd: root, env, stdio: 'inherit', ...opts })

if (process.env.API_URL) {
  process.exit(node(['test/e2e.mjs'], process.env).status ?? 1)
}

const dir = mkdtempSync(path.join(tmpdir(), 'forno-e2e-'))
const port = String(4100 + Math.floor(Math.random() * 800))
const env = { ...process.env, DB_PATH: path.join(dir, 'e2e.db'), PORT: port }
const apiUrl = `http://127.0.0.1:${port}`

if (node(['src/seed.js'], env, { stdio: 'ignore' }).status !== 0) {
  console.error('seed failed')
  process.exit(1)
}

const server = spawn(process.execPath, ['--no-warnings', 'src/index.js'], { cwd: root, env, stdio: 'ignore' })
let code = 1
try {
  const deadline = Date.now() + 15_000
  for (;;) {
    try {
      if ((await fetch(`${apiUrl}/api/health`)).ok) break
    } catch {}
    if (Date.now() > deadline) throw new Error('API did not start')
    await new Promise((r) => setTimeout(r, 150))
  }
  code = node(['test/e2e.mjs'], { ...env, API_URL: apiUrl }).status ?? 1
} catch (err) {
  console.error(err.message)
} finally {
  server.kill()
  await new Promise((r) => server.once('exit', r))
  rmSync(dir, { recursive: true, force: true })
}
process.exit(code)
