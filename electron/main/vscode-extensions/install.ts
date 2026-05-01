import extract from 'extract-zip'
import fs from 'node:fs'
import path from 'node:path'

import type { VscodeExtensionDownloadResult } from './download.js'
import {
  extensionIdFromPackage,
  type VscodeExtensionPackageLike,
} from './profiles.js'

export interface VscodeExtensionInstallFilesResult {
  extensionPath: string
  packageJson: VscodeExtensionPackageLike
}

export async function installDownloadedVsix(
  download: VscodeExtensionDownloadResult,
  options: {
    installRoot: string
    platform?: string
  },
): Promise<VscodeExtensionInstallFilesResult> {
  const platform = options.platform ?? `${process.platform}-${process.arch}`
  const installDir = path.join(
    options.installRoot,
    `${download.remote.extensionId}-${download.remote.version}-${platform}`,
  )
  const tmpDir = `${installDir}.${process.pid}.tmp`

  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(tmpDir, { recursive: true })

  try {
    await extract(download.filePath, { dir: tmpDir })
    const extensionPath = resolveExtractedExtensionPath(tmpDir)
    const packagePath = path.join(extensionPath, 'package.json')
    const packageJson = JSON.parse(
      fs.readFileSync(packagePath, 'utf-8'),
    ) as VscodeExtensionPackageLike

    const packageExtensionId = extensionIdFromPackage(packageJson)
    if (packageExtensionId !== download.remote.extensionId) {
      throw new Error(
        `VSIX package id mismatch: expected ${download.remote.extensionId}, got ${packageExtensionId ?? 'missing'}`,
      )
    }
    if (packageJson.version !== download.remote.version) {
      throw new Error(
        `VSIX package version mismatch: expected ${download.remote.version}, got ${packageJson.version ?? 'missing'}`,
      )
    }

    fs.rmSync(installDir, { recursive: true, force: true })
    fs.renameSync(tmpDir, installDir)

    return {
      extensionPath: path.join(installDir, path.relative(tmpDir, extensionPath)),
      packageJson,
    }
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    throw err
  }
}

function resolveExtractedExtensionPath(root: string): string {
  const extensionPath = path.join(root, 'extension')
  if (fs.existsSync(path.join(extensionPath, 'package.json'))) {
    return extensionPath
  }
  if (fs.existsSync(path.join(root, 'package.json'))) {
    return root
  }
  throw new Error('VSIX package is missing extension/package.json')
}
