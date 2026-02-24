/**
 * PDF 批注工具函数测试
 */
import { describe, it, expect } from 'vitest';
import {
  generateAnnotationId,
  getAnnotationFilePath,
  getPdfFileName,
  parseAnnotationsMarkdown,
  stringifyAnnotationsMarkdown,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  createEmptyAnnotationFile,
  parseLuminaLink,
} from './annotations';

describe('generateAnnotationId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateAnnotationId();
    const id2 = generateAnnotationId();
    expect(id1).not.toBe(id2);
  });

  it('should start with "ann-"', () => {
    const id = generateAnnotationId();
    expect(id).toMatch(/^ann-/);
  });
});

describe('getAnnotationFilePath', () => {
  it('should replace .pdf with .annotations.md', () => {
    expect(getAnnotationFilePath('document.pdf')).toBe('document.annotations.md');
    expect(getAnnotationFilePath('/path/to/file.pdf')).toBe('/path/to/file.annotations.md');
  });

  it('should handle case insensitive', () => {
    expect(getAnnotationFilePath('file.PDF')).toBe('file.annotations.md');
  });
});

describe('getPdfFileName', () => {
  it('should extract filename from path', () => {
    expect(getPdfFileName('/path/to/document.pdf')).toBe('document.pdf');
    expect(getPdfFileName('C:\\Users\\test\\file.pdf')).toBe('file.pdf');
  });

  it('should return filename for simple name', () => {
    expect(getPdfFileName('simple.pdf')).toBe('simple.pdf');
  });

  it('should return unknown.pdf for empty path', () => {
    expect(getPdfFileName('')).toBe('unknown.pdf');
  });
});

describe('parseLuminaLink', () => {
  it('should parse valid lumina link', () => {
    const result = parseLuminaLink('lumina://pdf?file=test.pdf&page=5&id=ann-123');
    expect(result).toEqual({
      file: 'test.pdf',
      page: 5,
      id: 'ann-123',
    });
  });

  it('should handle encoded file path', () => {
    const result = parseLuminaLink('lumina://pdf?file=%2Fpath%2Fto%2Ffile.pdf&page=1');
    expect(result?.file).toBe('/path/to/file.pdf');
  });

  it('should return null for non-lumina links', () => {
    expect(parseLuminaLink('http://example.com')).toBeNull();
    expect(parseLuminaLink('lumina://other')).toBeNull();
  });

  it('should handle partial params', () => {
    const result = parseLuminaLink('lumina://pdf?page=3');
    expect(result).toEqual({
      file: undefined,
      page: 3,
      id: undefined,
    });
  });
});

describe('createEmptyAnnotationFile', () => {
  it('should create empty file with correct structure', () => {
    const file = createEmptyAnnotationFile('/path/to/doc.pdf');
    
    expect(file.pdfPath).toBe('/path/to/doc.pdf');
    expect(file.pdfName).toBe('doc.pdf');
    expect(file.annotations).toEqual([]);
    expect(file.createdAt).toBeTruthy();
    expect(file.updatedAt).toBeTruthy();
  });
});

describe('addAnnotation', () => {
  it('should add annotation with generated id and timestamps', () => {
    const file = createEmptyAnnotationFile('/test.pdf');
    const newFile = addAnnotation(file, {
      type: 'highlight',
      color: 'yellow',
      pageIndex: 1,
      selectedText: 'Test text',
      position: { pageIndex: 1, rects: [] },
    });
    
    expect(newFile.annotations).toHaveLength(1);
    expect(newFile.annotations[0].id).toMatch(/^ann-/);
    expect(newFile.annotations[0].selectedText).toBe('Test text');
    expect(newFile.annotations[0].createdAt).toBeTruthy();
  });

  it('should not mutate original file', () => {
    const file = createEmptyAnnotationFile('/test.pdf');
    addAnnotation(file, {
      type: 'highlight',
      color: 'yellow',
      pageIndex: 1,
      selectedText: 'Test',
      position: { pageIndex: 1, rects: [] },
    });
    
    expect(file.annotations).toHaveLength(0);
  });
});

describe('updateAnnotation', () => {
  it('should update annotation by id', () => {
    let file = createEmptyAnnotationFile('/test.pdf');
    file = addAnnotation(file, {
      type: 'highlight',
      color: 'yellow',
      pageIndex: 1,
      selectedText: 'Original',
      position: { pageIndex: 1, rects: [] },
    });
    
    const id = file.annotations[0].id;
    const updatedFile = updateAnnotation(file, id, { note: 'My note' });
    
    expect(updatedFile.annotations[0].note).toBe('My note');
    expect(updatedFile.annotations[0].selectedText).toBe('Original');
  });

  it('should not affect other annotations', () => {
    let file = createEmptyAnnotationFile('/test.pdf');
    file = addAnnotation(file, {
      type: 'highlight', color: 'yellow', pageIndex: 1,
      selectedText: 'First', position: { pageIndex: 1, rects: [] },
    });
    file = addAnnotation(file, {
      type: 'highlight', color: 'green', pageIndex: 2,
      selectedText: 'Second', position: { pageIndex: 2, rects: [] },
    });
    
    const id = file.annotations[0].id;
    const updatedFile = updateAnnotation(file, id, { color: 'blue' });
    
    expect(updatedFile.annotations[0].color).toBe('blue');
    expect(updatedFile.annotations[1].color).toBe('green');
  });
});

describe('deleteAnnotation', () => {
  it('should remove annotation by id', () => {
    let file = createEmptyAnnotationFile('/test.pdf');
    file = addAnnotation(file, {
      type: 'highlight', color: 'yellow', pageIndex: 1,
      selectedText: 'Test', position: { pageIndex: 1, rects: [] },
    });
    
    const id = file.annotations[0].id;
    const deletedFile = deleteAnnotation(file, id);
    
    expect(deletedFile.annotations).toHaveLength(0);
  });
});

describe('stringifyAnnotationsMarkdown + parseAnnotationsMarkdown', () => {
  it('should roundtrip annotations', () => {
    let file = createEmptyAnnotationFile('/doc.pdf');
    file = addAnnotation(file, {
      type: 'highlight',
      color: 'yellow',
      pageIndex: 3,
      selectedText: 'Important text',
      note: 'This is my note',
      position: { pageIndex: 3, rects: [{ x: 0, y: 0, width: 100, height: 20 }] },
    });
    
    const markdown = stringifyAnnotationsMarkdown(file);
    const parsed = parseAnnotationsMarkdown(markdown, '/doc.pdf');
    
    expect(parsed.annotations).toHaveLength(1);
    expect(parsed.annotations[0].selectedText).toBe('Important text');
    expect(parsed.annotations[0].note).toBe('This is my note');
    expect(parsed.annotations[0].pageIndex).toBe(3);
  });

  it('should include title in markdown', () => {
    const file = createEmptyAnnotationFile('/my-doc.pdf');
    const markdown = stringifyAnnotationsMarkdown(file);
    
    expect(markdown).toContain('# 📝 批注 - my-doc.pdf');
  });

  it('should group by page', () => {
    let file = createEmptyAnnotationFile('/doc.pdf');
    file = addAnnotation(file, {
      type: 'highlight', color: 'yellow', pageIndex: 1,
      selectedText: 'Page 1', position: { pageIndex: 1, rects: [] },
    });
    file = addAnnotation(file, {
      type: 'highlight', color: 'yellow', pageIndex: 3,
      selectedText: 'Page 3', position: { pageIndex: 3, rects: [] },
    });
    
    const markdown = stringifyAnnotationsMarkdown(file);
    
    expect(markdown).toContain('## 第 1 页');
    expect(markdown).toContain('## 第 3 页');
  });
});
