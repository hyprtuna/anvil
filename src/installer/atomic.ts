import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GeneratedFile } from '../adapters/interface.js'

export async function writeAtomic(
  path: string,
  content: string | Buffer,
  opts: { executable?: boolean } = {},
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`
  await writeFile(tmpPath, content)
  if (opts.executable) {
    const { chmod } = await import('node:fs/promises')
    await chmod(tmpPath, 0o755)
  }
  await rename(tmpPath, path)
}

export async function writeManyAtomic(
  root: string,
  files: Array<Pick<GeneratedFile, 'relativePath' | 'content' | 'executable'>>,
  opts: { onRollback?: (paths: string[]) => void } = {},
): Promise<string[]> {
  const written: string[] = []
  try {
    for (const f of files) {
      const path = join(root, f.relativePath)
      await writeAtomic(path, f.content, { executable: f.executable })
      written.push(path)
    }
    return written
  } catch (err) {
    for (const path of written) await unlink(path).catch(() => {})
    opts.onRollback?.(written)
    throw err
  }
}
