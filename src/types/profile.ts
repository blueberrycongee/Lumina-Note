export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileConfig {
  id: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  links: ProfileLink[];
  pinnedNotePaths: string[];
}

export interface ProfileNoteMeta {
  path: string;
  title: string;
  summary: string;
  tags: string[];
  cover?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileTagSummary {
  tag: string;
  count: number;
}

export interface ProfilePageData {
  profile: ProfileConfig;
  pinned: ProfileNoteMeta[];
  recent: ProfileNoteMeta[];
  tags: ProfileTagSummary[];
}
