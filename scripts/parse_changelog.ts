/**
 * 解析 CHANGELOG.md，提取指定版本的更新日志
 * 用于 CI 检查和 latest.json 生成
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ChangelogEntry {
  version: string;
  date: string | null;
  content: string;
}

/**
 * 解析 CHANGELOG.md 文件
 */
export function parseChangelog(changelogPath: string): ChangelogEntry[] {
  if (!fs.existsSync(changelogPath)) {
    return [];
  }

  const content = fs.readFileSync(changelogPath, 'utf-8');
  const entries: ChangelogEntry[] = [];

  // 匹配 ## [version] - date 或 ## [version]
  const versionRegex = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}|\d{4}-XX-XX))?/gm;
  const matches = [...content.matchAll(versionRegex)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const version = match[1];
    const date = match[2] || null;
    const startIndex = match.index! + match[0].length;
    const endIndex = matches[i + 1]?.index ?? content.length;

    // 提取该版本的内容
    let entryContent = content.slice(startIndex, endIndex).trim();

    // 跳过 [Unreleased]
    if (version.toLowerCase() === 'unreleased') {
      continue;
    }

    entries.push({
      version,
      date,
      content: entryContent,
    });
  }

  return entries;
}

/**
 * 获取指定版本的更新日志
 */
export function getChangelogForVersion(version: string, changelogPath?: string): ChangelogEntry | null {
  const filePath = changelogPath || path.resolve(process.cwd(), 'CHANGELOG.md');
  const entries = parseChangelog(filePath);

  // 移除 v 前缀进行匹配
  const normalizedVersion = version.replace(/^v/, '');

  return entries.find(e => e.version === normalizedVersion) || null;
}

/**
 * 检查指定版本是否有 changelog
 */
export function hasChangelogForVersion(version: string, changelogPath?: string): boolean {
  const entry = getChangelogForVersion(version, changelogPath);
  return entry !== null && entry.content.length > 0;
}

// CLI 模式
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const version = args[1];

  if (command === 'check' && version) {
    const has = hasChangelogForVersion(version);
    if (has) {
      console.log(`✅ Changelog found for version ${version}`);
      process.exit(0);
    } else {
      console.error(`❌ No changelog found for version ${version}`);
      console.error(`Please add an entry to CHANGELOG.md before releasing.`);
      process.exit(1);
    }
  } else if (command === 'get' && version) {
    const entry = getChangelogForVersion(version);
    if (entry) {
      console.log(entry.content);
    } else {
      console.error(`No changelog found for version ${version}`);
      process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  npx ts-node scripts/parse_changelog.ts check <version>');
    console.log('  npx ts-node scripts/parse_changelog.ts get <version>');
    process.exit(1);
  }
}
