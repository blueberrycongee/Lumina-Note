import extract from 'extract-zip'
import fs from 'node:fs'
import path from 'node:path'

import type { VscodeExtensionDownloadResult } from './download.js'
import {
  extensionIdFromPackage,
  isSupportedVscodeAiExtensionId,
  type SupportedVscodeAiExtensionId,
  type VscodeExtensionPackageLike,
} from './profiles.js'

export interface VscodeExtensionInstallFilesResult {
  extensionPath: string
  packageJson: VscodeExtensionPackageLike
}

export interface LocalVsixInstallFilesResult extends VscodeExtensionInstallFilesResult {
  extensionId: SupportedVscodeAiExtensionId
  version: string
}

const UNIVERSAL_TARGET_PLATFORMS = new Set(['universal'])

export async function installDownloadedVsix(
  download: VscodeExtensionDownloadResult,
  options: {
    installRoot: string
    platform?: string
  },
): Promise<VscodeExtensionInstallFilesResult> {
  const platform = options.platform ?? getCurrentVsixTargetPlatform()
  const installDir = path.join(
    options.installRoot,
    `${download.remote.extensionId}-${download.remote.version}-${platform}`,
  )
  const tmpDir = `${installDir}.${process.pid}.tmp`

  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(tmpDir, { recursive: true })

  try {
    await extract(download.filePath, { dir: tmpDir })
    validateExtractedVsixTargetPlatform(tmpDir, platform)
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

export async function installLocalVsixFile(
  vsixPath: string,
  options: {
    installRoot: string
    platform?: string
    expectedExtensionId?: SupportedVscodeAiExtensionId
  },
): Promise<LocalVsixInstallFilesResult> {
  if (!vsixPath.endsWith('.vsix')) {
    throw new Error('Manual VSIX import requires a .vsix file')
  }
  const tmpDir = path.join(
    options.installRoot,
    `.manual-${process.pid}-${Date.now()}.tmp`,
  )
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(tmpDir, { recursive: true })

  try {
    await extract(vsixPath, { dir: tmpDir })
    const platform = options.platform ?? getCurrentVsixTargetPlatform()
    validateExtractedVsixTargetPlatform(tmpDir, platform)
    const extensionPath = resolveExtractedExtensionPath(tmpDir)
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf-8'),
    ) as VscodeExtensionPackageLike
    const extensionId = extensionIdFromPackage(packageJson)
    if (!extensionId || !isSupportedVscodeAiExtensionId(extensionId)) {
      throw new Error(`Unsupported VS Code extension in VSIX: ${extensionId ?? 'missing'}`)
    }
    if (options.expectedExtensionId && extensionId !== options.expectedExtensionId) {
      throw new Error(
        `VSIX package id mismatch: expected ${options.expectedExtensionId}, got ${extensionId}`,
      )
    }
    const version = packageJson.version?.trim()
    if (!version) throw new Error('VSIX package version is missing')

    const installDir = path.join(
      options.installRoot,
      `${extensionId}-${version}-${platform}`,
    )
    fs.rmSync(installDir, { recursive: true, force: true })
    fs.renameSync(tmpDir, installDir)

    return {
      extensionId,
      version,
      extensionPath: path.join(installDir, path.relative(tmpDir, extensionPath)),
      packageJson,
    }
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    throw err
  }
}

export function getCurrentVsixTargetPlatform(): string {
  return `${process.platform}-${process.arch}`
}

function validateExtractedVsixTargetPlatform(root: string, platform: string): void {
  const targetPlatform = readExtractedVsixTargetPlatform(root)
  if (!targetPlatform || UNIVERSAL_TARGET_PLATFORMS.has(targetPlatform)) return
  if (targetPlatform !== platform) {
    throw new Error(
      `VSIX target platform mismatch: expected ${platform}, got ${targetPlatform}`,
    )
  }
}

function readExtractedVsixTargetPlatform(root: string): string | null {
  const manifestPath = path.join(root, 'extension.vsixmanifest')
  if (!fs.existsSync(manifestPath)) return null
  const manifest = fs.readFileSync(manifestPath, 'utf-8')
  const match = manifest.match(/\bTargetPlatform=(["'])([^"']+)\1/)
  return match?.[2]?.trim() || null
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
