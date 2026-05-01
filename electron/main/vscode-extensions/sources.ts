import {
  TARGET_VSCODE_AI_EXTENSIONS,
  normalizeVscodeExtensionId,
  type SupportedVscodeAiExtensionId,
} from './profiles.js'
import type { VscodeExtensionInstallSource } from './store.js'

export interface VscodeExtensionRemoteVersion {
  extensionId: SupportedVscodeAiExtensionId
  source: Extract<VscodeExtensionInstallSource, 'marketplace' | 'open-vsx'>
  version: string
  downloadUrl: string
  itemUrl: string
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  },
) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
  json(): Promise<unknown>
}>

export async function queryLatestRemoteVersion(
  extensionId: SupportedVscodeAiExtensionId,
  options: {
    source: Extract<VscodeExtensionInstallSource, 'marketplace' | 'open-vsx'>
    marketplaceTermsAccepted?: boolean
    fetch?: FetchLike
  },
): Promise<VscodeExtensionRemoteVersion> {
  const fetcher = options.fetch ?? fetch
  if (options.source === 'marketplace') {
    if (!options.marketplaceTermsAccepted) {
      throw new Error(
        'Visual Studio Marketplace source requires explicit terms acceptance before querying or downloading VSIX packages.',
      )
    }
    return queryLatestMarketplaceVersion(extensionId, fetcher)
  }
  return queryLatestOpenVsxVersion(extensionId, fetcher)
}

export async function queryLatestOpenVsxVersion(
  extensionId: SupportedVscodeAiExtensionId,
  fetcher: FetchLike = fetch,
): Promise<VscodeExtensionRemoteVersion> {
  const target = TARGET_VSCODE_AI_EXTENSIONS[extensionId]
  const [publisher, name] = target.marketplaceItemName.split('.')
  const url = `https://open-vsx.org/api/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}/latest`
  const res = await fetcher(url)
  if (!res.ok) {
    throw new Error(`Open VSX query failed for ${extensionId}: HTTP ${res.status}`)
  }
  const body = (await res.json()) as {
    namespace?: string
    name?: string
    version?: string
    files?: { download?: string }
  }
  const version = body.version?.trim()
  const downloadUrl = body.files?.download?.trim()
  if (!version || !downloadUrl) {
    throw new Error(`Open VSX response missing version/download for ${extensionId}`)
  }
  return {
    extensionId,
    source: 'open-vsx',
    version,
    downloadUrl,
    itemUrl: `https://open-vsx.org/extension/${encodeURIComponent(body.namespace ?? publisher)}/${encodeURIComponent(body.name ?? name)}`,
  }
}

export async function queryLatestMarketplaceVersion(
  extensionId: SupportedVscodeAiExtensionId,
  fetcher: FetchLike = fetch,
): Promise<VscodeExtensionRemoteVersion> {
  const target = TARGET_VSCODE_AI_EXTENSIONS[extensionId]
  const [publisher, name] = target.marketplaceItemName.split('.')
  const res = await fetcher(
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json;api-version=7.2-preview.1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: [
          {
            criteria: [
              { filterType: 7, value: target.marketplaceItemName },
              { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
            ],
          },
        ],
        flags: 0x1 | 0x2 | 0x80 | 0x100,
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`Marketplace query failed for ${extensionId}: HTTP ${res.status}`)
  }
  const body = (await res.json()) as MarketplaceQueryResponse
  const extension = body.results?.flatMap((result) => result.extensions ?? [])[0]
  const latest = extension?.versions?.[0]
  const version = latest?.version?.trim()
  const downloadUrl = latest?.files
    ?.find((file) => file.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')
    ?.source?.trim()
  if (!version || !downloadUrl) {
    throw new Error(`Marketplace response missing version/download for ${extensionId}`)
  }
  const normalized = normalizeVscodeExtensionId(`${publisher}.${name}`)
  if (normalized !== extensionId) {
    throw new Error(`Marketplace target mismatch: expected ${extensionId}, got ${normalized}`)
  }
  return {
    extensionId,
    source: 'marketplace',
    version,
    downloadUrl,
    itemUrl: `https://marketplace.visualstudio.com/items?itemName=${encodeURIComponent(target.marketplaceItemName)}`,
  }
}

interface MarketplaceQueryResponse {
  results?: Array<{
    extensions?: Array<{
      versions?: Array<{
        version?: string
        files?: Array<{
          assetType?: string
          source?: string
        }>
      }>
    }>
  }>
}
