import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { VscodeExtensionRemoteVersion } from './sources.js'

export type BinaryFetchLike = (
  input: string,
) => Promise<{
  ok: boolean
  status: number
  arrayBuffer(): Promise<ArrayBuffer>
}>

export interface VscodeExtensionDownloadResult {
  remote: VscodeExtensionRemoteVersion
  filePath: string
  sha256: string
  byteLength: number
}

export async function downloadVsixToCache(
  remote: VscodeExtensionRemoteVersion,
  options: {
    cacheDir: string
    fetch?: BinaryFetchLike
  },
): Promise<VscodeExtensionDownloadResult> {
  const fetcher = options.fetch ?? fetch
  const res = await fetcher(remote.downloadUrl)
  if (!res.ok) {
    throw new Error(
      `VSIX download failed for ${remote.extensionId}@${remote.version}: HTTP ${res.status}`,
    )
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length === 0) {
    throw new Error(`VSIX download was empty for ${remote.extensionId}@${remote.version}`)
  }

  fs.mkdirSync(options.cacheDir, { recursive: true })
  const fileName = `${remote.extensionId}-${remote.version}.vsix`
  const filePath = path.join(options.cacheDir, fileName)
  const tmpPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, buffer)
  fs.renameSync(tmpPath, filePath)

  return {
    remote,
    filePath,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    byteLength: buffer.length,
  }
}
