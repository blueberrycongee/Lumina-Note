import { describe, expect, it, vi } from 'vitest'

import {
  queryLatestMarketplaceVersion,
  queryLatestOpenVsxVersion,
  queryLatestRemoteVersion,
  type FetchLike,
} from './sources.js'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body)
    },
    async json() {
      return body
    },
  }
}

describe('vscode extension remote sources', () => {
  it('queries Open VSX latest metadata', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        namespace: 'OpenAI',
        name: 'chatgpt',
        version: '6.1.0',
        files: {
          download: 'https://open-vsx.example/openai.chatgpt-6.1.0.vsix',
        },
      }),
    ) satisfies FetchLike

    const latest = await queryLatestOpenVsxVersion('openai.chatgpt', fetcher)

    expect(fetcher).toHaveBeenCalledWith('https://open-vsx.org/api/OpenAI/chatgpt/latest')
    expect(latest).toEqual({
      extensionId: 'openai.chatgpt',
      source: 'open-vsx',
      version: '6.1.0',
      downloadUrl: 'https://open-vsx.example/openai.chatgpt-6.1.0.vsix',
      itemUrl: 'https://open-vsx.org/extension/OpenAI/chatgpt',
    })
  })

  it('requires explicit terms acceptance before using Marketplace source', async () => {
    await expect(
      queryLatestRemoteVersion('anthropic.claude-code', {
        source: 'marketplace',
        fetch: vi.fn() as unknown as FetchLike,
      }),
    ).rejects.toThrow(/requires explicit terms acceptance/)
  })

  it('queries Marketplace latest metadata after terms acceptance', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            extensions: [
              {
                versions: [
                  {
                    version: '2.1.81',
                    files: [
                      {
                        assetType: 'Microsoft.VisualStudio.Services.VSIXPackage',
                        source: 'https://marketplace.example/anthropic.claude-code-2.1.81.vsix',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ) satisfies FetchLike

    const latest = await queryLatestRemoteVersion('anthropic.claude-code', {
      source: 'marketplace',
      marketplaceTermsAccepted: true,
      fetch: fetcher,
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(latest).toMatchObject({
      extensionId: 'anthropic.claude-code',
      source: 'marketplace',
      version: '2.1.81',
      downloadUrl: 'https://marketplace.example/anthropic.claude-code-2.1.81.vsix',
    })
  })

  it('fails closed when remote metadata has no VSIX download', async () => {
    await expect(
      queryLatestMarketplaceVersion(
        'openai.chatgpt',
        vi.fn(async () =>
          jsonResponse({
            results: [{ extensions: [{ versions: [{ version: '6.1.0', files: [] }] }] }],
          }),
        ) satisfies FetchLike,
      ),
    ).rejects.toThrow(/missing version\/download/)
  })
})
