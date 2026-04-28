/**
 * Persist generated images + metadata to the vault.
 *
 * Layout:
 *   <vault>/assets/generated/<YYYY-MM>/<id>.png   PNG bytes
 *   <vault>/assets/generated/<YYYY-MM>/<id>.json  sidecar (model, prompt, refs, ts)
 *
 * No dot prefix on `assets/` — Lumina's file tree filter hides leading-dot
 * dirs (electron/main/handlers/fs.ts:22 except .lumina), and these are user
 * content the user should be able to browse/delete.
 *
 * `id` is a short hex string derived from current time + a random byte to
 * keep filenames stable, sortable, and clash-resistant for the rare case
 * where two generations land in the same millisecond.
 */

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface SavedImage {
  /** Absolute path of the .png file. */
  absolutePath: string
  /** Path relative to the vault root, with forward slashes. */
  relativePath: string
  /** Sidecar JSON path (absolute). */
  sidecarPath: string
  /** Generation id (the filename stem). */
  id: string
}

export interface SaveImageInput {
  vaultPath: string
  bytes: Buffer
  /** Metadata to persist alongside the image. */
  metadata: {
    providerId: string
    modelId: string
    prompt: string
    aspectRatio?: string
    referenceCount: number
    /** ISO 8601 timestamp the image was generated at. */
    generatedAt: string
  }
}

export async function writeImageToVault(input: SaveImageInput): Promise<SavedImage> {
  const { vaultPath, bytes, metadata } = input
  const ts = new Date(metadata.generatedAt)
  const yearMonth = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}`

  const id = generateId(ts)
  const dir = path.join(vaultPath, 'assets', 'generated', yearMonth)
  await fs.mkdir(dir, { recursive: true })

  const absolutePath = path.join(dir, `${id}.png`)
  const sidecarPath = path.join(dir, `${id}.json`)

  await fs.writeFile(absolutePath, new Uint8Array(bytes))
  await fs.writeFile(
    sidecarPath,
    JSON.stringify(
      {
        id,
        ...metadata,
      },
      null,
      2,
    ),
  )

  const relativePath = path
    .relative(vaultPath, absolutePath)
    .split(path.sep)
    .join('/')

  return { absolutePath, relativePath, sidecarPath, id }
}

function generateId(ts: Date): string {
  // YYMMDDHHmmss + 4-byte hex tail. Sortable + unlikely to collide.
  const yy = String(ts.getUTCFullYear() % 100).padStart(2, '0')
  const mm = String(ts.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(ts.getUTCDate()).padStart(2, '0')
  const hh = String(ts.getUTCHours()).padStart(2, '0')
  const min = String(ts.getUTCMinutes()).padStart(2, '0')
  const ss = String(ts.getUTCSeconds()).padStart(2, '0')
  const tail = crypto.randomBytes(2).toString('hex')
  return `${yy}${mm}${dd}-${hh}${min}${ss}-${tail}`
}
