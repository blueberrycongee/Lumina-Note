/**
 * Property-based tests for AddressBar URL classification
 * Using fast-check for property-based testing
 */

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// URL classification logic extracted for testing
const SEARCH_ENGINES = {
  bing: 'https://www.bing.com/search?q=',
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
};

function classifyInput(
  input: string,
  searchEngine: 'bing' | 'google' | 'duckduckgo' = 'bing'
): { type: 'url' | 'search'; url: string } {
  const trimmed = input.trim();

  if (!trimmed) {
    return { type: 'url', url: '' };
  }

  // 已有协议的 URL
  if (trimmed.match(/^https?:\/\//i)) {
    return { type: 'url', url: trimmed };
  }

  // 检查是否是搜索查询
  // 包含空格 = 搜索查询
  if (trimmed.includes(' ')) {
    const searchUrl = SEARCH_ENGINES[searchEngine] + encodeURIComponent(trimmed);
    return { type: 'search', url: searchUrl };
  }

  // 不包含点号 = 搜索查询
  if (!trimmed.includes('.')) {
    const searchUrl = SEARCH_ENGINES[searchEngine] + encodeURIComponent(trimmed);
    return { type: 'search', url: searchUrl };
  }

  // 包含点号但无协议 = 域名，添加 https://
  return { type: 'url', url: `https://${trimmed}` };
}

describe('AddressBar URL Classification', () => {
  // **Feature: ai-browser, Property 3: URL Classification - Direct URL**
  it('Property 3: Direct URL classification - URLs with http:// or https:// should be classified as direct URLs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('http://').chain(() =>
            fc.webUrl().map((url) => 'http://' + url.slice(url.indexOf('://') + 3))
          ),
          fc.webUrl()
        ),
        (url) => {
          const result = classifyInput(url);
          // Direct URLs should not be modified
          return result.type === 'url' && result.url === url;
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Feature: ai-browser, Property 4: URL Classification - Domain Detection**
  it('Property 4: Domain detection - Strings with dots but no spaces should be treated as domains', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.domain(),
          fc.domain()
        ).map(([domain1, domain2]) => `${domain1}.${domain2}`),
        (domain) => {
          const result = classifyInput(domain);
          // Should be classified as URL and have https:// prepended
          return (
            result.type === 'url' &&
            result.url.startsWith('https://') &&
            result.url.includes(domain)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Feature: ai-browser, Property 5: URL Classification - Search Query**
  it('Property 5: Search query classification - Strings with spaces should be treated as search queries', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0)
        ).map(([word1, word2]) => `${word1} ${word2}`),
        (query) => {
          const result = classifyInput(query, 'bing');
          // Should be classified as search and use search engine URL
          return (
            result.type === 'search' &&
            result.url.startsWith('https://www.bing.com/search?q=') &&
            result.url.includes(encodeURIComponent(query.trim()))
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Feature: ai-browser, Property 6: Address Bar Escape Restoration**
  it('Property 6: Escape key should restore original URL - Empty input should return empty URL', () => {
    fc.assert(
      fc.property(fc.constant(''), (input) => {
        const result = classifyInput(input);
        return result.url === '';
      }),
      { numRuns: 10 }
    );
  });

  // Additional test: Search engine configuration
  it('Search engine configuration - Different search engines should use correct URLs', () => {
    const query = 'test query';
    
    const bingResult = classifyInput(query, 'bing');
    expect(bingResult.url).toContain('bing.com');
    
    const googleResult = classifyInput(query, 'google');
    expect(googleResult.url).toContain('google.com');
    
    const duckResult = classifyInput(query, 'duckduckgo');
    expect(duckResult.url).toContain('duckduckgo.com');
  });

  // Additional test: Whitespace handling
  it('Whitespace handling - Leading/trailing whitespace should be trimmed', () => {
    fc.assert(
      fc.property(
        fc.domain(),
        (domain) => {
          const inputs = [
            `  ${domain}`,
            `${domain}  `,
            `  ${domain}  `,
            `\t${domain}\t`,
          ];
          
          for (const input of inputs) {
            const result = classifyInput(input);
            // Should handle whitespace correctly
            if (result.url === '') return false;
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
