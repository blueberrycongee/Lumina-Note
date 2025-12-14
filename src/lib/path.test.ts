/**
 * path.ts 测试
 */
import { describe, it, expect } from 'vitest';
import { join, dirname, basename, extname, isAbsolute, resolve, relative, normalize } from './path';

describe('join', () => {
  it('should join path segments', () => {
    expect(join('a', 'b', 'c')).toBe('a/b/c');
  });

  it('should normalize separators', () => {
    expect(join('a\\b', 'c/d')).toBe('a/b/c/d');
  });

  it('should remove duplicate slashes', () => {
    expect(join('a/', '/b', 'c')).toBe('a/b/c');
  });

  it('should filter empty segments', () => {
    expect(join('a', '', 'b')).toBe('a/b');
  });

  it('should handle single segment', () => {
    expect(join('abc')).toBe('abc');
  });
});

describe('dirname', () => {
  it('should get directory name', () => {
    expect(dirname('/a/b/c.txt')).toBe('/a/b');
  });

  it('should handle Windows paths', () => {
    expect(dirname('C:\\a\\b\\c.txt')).toBe('C:/a/b');
  });

  it('should return . for filename only', () => {
    expect(dirname('file.txt')).toBe('.');
  });

  it('should handle root path', () => {
    expect(dirname('/file.txt')).toBe('/');
  });
});

describe('basename', () => {
  it('should get base name', () => {
    expect(basename('/a/b/c.txt')).toBe('c.txt');
  });

  it('should strip extension if provided', () => {
    expect(basename('/a/b/c.txt', '.txt')).toBe('c');
  });

  it('should handle Windows paths', () => {
    expect(basename('C:\\a\\b\\c.txt')).toBe('c.txt');
  });

  it('should handle filename only', () => {
    expect(basename('file.md')).toBe('file.md');
  });
});

describe('extname', () => {
  it('should get extension', () => {
    expect(extname('file.txt')).toBe('.txt');
  });

  it('should handle multiple dots', () => {
    expect(extname('file.name.txt')).toBe('.txt');
  });

  it('should return empty for no extension', () => {
    expect(extname('file')).toBe('');
  });

  it('should handle dotfiles', () => {
    expect(extname('.gitignore')).toBe('');
  });

  it('should handle full path', () => {
    expect(extname('/path/to/file.md')).toBe('.md');
  });
});

describe('isAbsolute', () => {
  it('should detect Unix absolute paths', () => {
    expect(isAbsolute('/a/b/c')).toBe(true);
  });

  it('should detect Windows absolute paths', () => {
    expect(isAbsolute('C:\\a\\b')).toBe(true);
    expect(isAbsolute('D:/a/b')).toBe(true);
  });

  it('should detect UNC paths', () => {
    expect(isAbsolute('\\\\server\\share')).toBe(true);
  });

  it('should detect relative paths', () => {
    expect(isAbsolute('a/b/c')).toBe(false);
    expect(isAbsolute('./a/b')).toBe(false);
    expect(isAbsolute('../a/b')).toBe(false);
  });
});

describe('resolve', () => {
  it('should resolve relative path', () => {
    expect(resolve('/base', 'sub/file.txt')).toBe('/base/sub/file.txt');
  });

  it('should return absolute path as is', () => {
    expect(resolve('/base', '/absolute/path')).toBe('/absolute/path');
  });
});

describe('relative', () => {
  it('should get relative path', () => {
    expect(relative('/a/b/c', '/a/b/d/e')).toBe('../d/e');
  });

  it('should handle same directory', () => {
    expect(relative('/a/b', '/a/b/c')).toBe('c');
  });

  it('should handle going up multiple levels', () => {
    expect(relative('/a/b/c/d', '/a/e')).toBe('../../../e');
  });

  it('should return . for same path', () => {
    expect(relative('/a/b', '/a/b')).toBe('.');
  });
});

describe('normalize', () => {
  it('should normalize . segments', () => {
    expect(normalize('a/./b/./c')).toBe('a/b/c');
  });

  it('should normalize .. segments', () => {
    expect(normalize('a/b/../c')).toBe('a/c');
  });

  it('should handle Windows separators', () => {
    expect(normalize('a\\b\\c')).toBe('a/b/c');
  });

  it('should remove empty segments', () => {
    expect(normalize('a//b///c')).toBe('a/b/c');
  });

  it('should return . for empty result', () => {
    expect(normalize('a/..')).toBe('.');
  });
});
