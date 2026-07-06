#!/usr/bin/env node
import { chmod, mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const HANDLERS_DIR = join(ROOT, 'src/hooks/handlers')
const OUT_DIR = join(ROOT, 'dist-hooks')

const files = (await readdir(HANDLERS_DIR)).filter((f) => f.endsWith('.ts'))
if (files.length === 0) {
  console.error('build-hooks: no handler files found')
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })

for (const f of files) {
  const kind = f.replace(/\.ts$/, '')
  const handlerExport = `${kind.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Handler`
  const handlerImport = join(HANDLERS_DIR, f)
  const shimSource = `
import { runHook } from '${join(ROOT, 'src/hooks/entrypoint.ts').replace(/\\/g, '/')}'
import * as mod from '${handlerImport.replace(/\\/g, '/')}'
const handler = mod['${handlerExport}']
if (typeof handler !== 'function') {
  process.stderr.write("anvil hook ${kind}: expected export '${handlerExport}' not found\\n")
  process.exit(2)
}
runHook('${kind}', handler)
`
  const tmpFile = join(OUT_DIR, `.stub-${kind}.mjs`)
  await writeFile(tmpFile, shimSource)
  try {
    await build({
      entryPoints: [tmpFile],
      outfile: join(OUT_DIR, `${kind}.cjs`),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      banner: { js: '#!/usr/bin/env node' },
      logLevel: 'error',
      sourcemap: false,
    })
  } catch (err) {
    console.error(`build-hooks: failed to compile ${kind}:`, err)
    process.exit(1)
  } finally {
    await unlink(tmpFile).catch(() => {})
  }
}

// Set executable bit on every output
for (const f of files) {
  const kind = f.replace(/\.ts$/, '')
  await chmod(join(OUT_DIR, `${kind}.cjs`), 0o755)
}

console.log(`build-hooks: compiled ${files.length} hooks → ${OUT_DIR}`)
