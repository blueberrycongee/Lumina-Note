export interface SlugOptions {
  fallbackPrefix?: string;
}

const DEFAULT_FALLBACK_PREFIX = "note";

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const hashString = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

export function createStableSlug(input: string, fallbackSeed?: string, options?: SlugOptions): string {
  const base = slugify(input);
  if (base) return base;

  const prefix = slugify(options?.fallbackPrefix || DEFAULT_FALLBACK_PREFIX) || DEFAULT_FALLBACK_PREFIX;
  const seed = fallbackSeed ?? input;
  return `${prefix}-${hashString(seed)}`;
}

export function ensureUniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(slug);
  return slug;
}
