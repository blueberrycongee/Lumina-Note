import type { ProfileConfig, ProfileNoteMeta, ProfileTagSummary } from "@/types/profile";
import { createStableSlug, ensureUniqueSlug } from "./slug";

export interface PublishNoteInput extends ProfileNoteMeta {
  slug?: string;
}

export interface PublishPostIndex extends ProfileNoteMeta {
  slug: string;
  url: string;
}

export interface PublishIndex {
  profile: ProfileConfig;
  posts: PublishPostIndex[];
  pinned: string[];
  tags: ProfileTagSummary[];
}

export interface PublishIndexOptions {
  postsBasePath?: string;
  slugFallbackPrefix?: string;
}

const getFileStem = (path: string): string => {
  const name = path.split(/[/\\]/).pop() || path;
  return name.replace(/\.[^/.]+$/, "");
};

const normalizePostsBasePath = (input?: string): string => {
  const raw = input?.trim() || "posts";
  const stripped = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  return `/${stripped || "posts"}`;
};

const getSortTimestamp = (note: ProfileNoteMeta): number => {
  const candidates = [note.publishAt, note.updatedAt, note.createdAt];
  for (const value of candidates) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

const buildTagSummary = (notes: ProfileNoteMeta[]): ProfileTagSummary[] => {
  const tagMap = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags || []) {
      const key = tag.toLowerCase();
      tagMap.set(key, (tagMap.get(key) || 0) + 1);
    }
  }
  return Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));
};

export function buildPublishIndexFromNotes(
  notes: PublishNoteInput[],
  profile: ProfileConfig,
  options?: PublishIndexOptions
): PublishIndex {
  const postsBasePath = normalizePostsBasePath(options?.postsBasePath);
  const usedSlugs = new Set<string>();
  const slugMap = new Map<string, string>();

  const slugCandidates = [...notes].sort((a, b) => a.path.localeCompare(b.path));
  for (const note of slugCandidates) {
    const baseInput = note.slug || note.title || getFileStem(note.path);
    const baseSlug = createStableSlug(baseInput, note.path, { fallbackPrefix: options?.slugFallbackPrefix });
    const uniqueSlug = ensureUniqueSlug(baseSlug, usedSlugs);
    slugMap.set(note.path, uniqueSlug);
  }

  const posts = [...notes]
    .sort((a, b) => {
      const delta = getSortTimestamp(b) - getSortTimestamp(a);
      if (delta !== 0) return delta;
      return a.title.localeCompare(b.title);
    })
    .map((note) => {
      const slug = slugMap.get(note.path) || createStableSlug(note.title, note.path);
      return {
        ...note,
        slug,
        url: `${postsBasePath}/${slug}/`,
      };
    });

  const pinned = profile.pinnedNotePaths
    .map((path) => slugMap.get(path))
    .filter((slug): slug is string => Boolean(slug));

  return {
    profile,
    posts,
    pinned,
    tags: buildTagSummary(notes),
  };
}
