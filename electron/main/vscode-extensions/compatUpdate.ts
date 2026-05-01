import fs from 'node:fs'
import path from 'node:path'

import {
  type VscodeExtensionCompatProfile,
} from './profiles.js'
import { parseCompatProfileObject } from './profileLoader.js'
import type { FetchLike } from './sources.js'

export interface VscodeCompatProfileInstallResult {
  sourceUrl: string
  installedAt: string
  profiles: Array<{
    extensionId: string
    channel: string
    versionRange: string
    filePath: string
  }>
}

export async function installCompatProfilesFromIndex(options: {
  indexUrl: string
  profilesRoot: string
  fetch?: FetchLike
  installedAt?: string
}): Promise<VscodeCompatProfileInstallResult> {
  const indexUrl = normalizeCompatIndexUrl(options.indexUrl)
  const fetcher = options.fetch ?? fetch
  const response = await fetcher(indexUrl)
  if (!response.ok) {
    throw new Error(`VS Code compatibility profile index download failed: HTTP ${response.status}`)
  }

  const body = await response.json()
  const rawProfiles = readProfileIndex(body, indexUrl)
  const profiles = rawProfiles.map((profile, index) =>
    parseCompatProfileObject(profile, `${indexUrl} profile[${index}]`),
  )
  const installedAt = options.installedAt ?? new Date().toISOString()
  const installed = profiles.map((profile) => writeProfile(options.profilesRoot, profile))

  return {
    sourceUrl: indexUrl,
    installedAt,
    profiles: installed,
  }
}

function normalizeCompatIndexUrl(input: string): string {
  const url = new URL(input)
  if (url.protocol !== 'https:') {
    throw new Error('VS Code compatibility profile index URL must use https')
  }
  return url.toString()
}

function readProfileIndex(body: unknown, sourceUrl: string): unknown[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`Invalid VS Code compatibility profile index ${sourceUrl}: expected object`)
  }
  const index = body as { schemaVersion?: unknown; profiles?: unknown }
  if (index.schemaVersion !== 1) {
    throw new Error(`Invalid VS Code compatibility profile index ${sourceUrl}: schemaVersion must be 1`)
  }
  if (!Array.isArray(index.profiles)) {
    throw new Error(`Invalid VS Code compatibility profile index ${sourceUrl}: profiles must be an array`)
  }
  return index.profiles
}

function writeProfile(root: string, profile: VscodeExtensionCompatProfile) {
  const dir = path.join(root, profile.extensionId)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(
    dir,
    `${profile.channel}-${sanitizeFilePart(profile.versionRange)}.json`,
  )
  const tmpPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf-8')
  fs.renameSync(tmpPath, filePath)
  return {
    extensionId: profile.extensionId,
    channel: profile.channel,
    versionRange: profile.versionRange,
    filePath,
  }
}

function sanitizeFilePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'profile'
}
