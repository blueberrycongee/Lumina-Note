/**
 * PDF 导出工具函数测试
 */
import { describe, it, expect } from 'vitest';
import { getTranslations } from '@/i18n';
import { getExportFileName } from './exportPdf';

describe('getExportFileName', () => {
  it('should extract filename without extension', () => {
    expect(getExportFileName('/path/to/note.md')).toBe('note');
    expect(getExportFileName('C:\\Users\\test\\file.md')).toBe('file');
  });

  it('should handle simple filename', () => {
    expect(getExportFileName('document.md')).toBe('document');
  });

  it('should return default for null path', () => {
    expect(getExportFileName(null)).toBe(getTranslations('zh-CN').common.untitled);
  });

  it('should handle case insensitive .md extension', () => {
    expect(getExportFileName('file.MD')).toBe('file');
  });

  it('should preserve filename without .md extension', () => {
    expect(getExportFileName('/path/to/file.txt')).toBe('file.txt');
  });
});
