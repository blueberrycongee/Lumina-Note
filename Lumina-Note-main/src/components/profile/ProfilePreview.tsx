import { useEffect, useMemo, useState } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useProfileStore } from "@/stores/useProfileStore";
import { buildProfileData } from "@/services/profile/profileData";
import type { ProfilePageData } from "@/types/profile";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";

const emptyData: ProfilePageData = {
  profile: {
    id: "",
    displayName: "",
    bio: "",
    avatarUrl: "",
    links: [],
    pinnedNotePaths: [],
  },
  pinned: [],
  recent: [],
  tags: [],
};

export function ProfilePreview() {
  const fileTree = useFileStore((state) => state.fileTree);
  const profileConfig = useProfileStore((state) => state.config);
  const { t } = useLocaleStore();
  const [data, setData] = useState<ProfilePageData>(emptyData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = profileConfig.displayName || t.profilePreview.unnamedUser;
  const profileId = profileConfig.id;
  const isRemoteCover = (cover?: string) =>
    Boolean(cover && (cover.startsWith("http://") || cover.startsWith("https://") || cover.startsWith("data:")));

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await buildProfileData(fileTree, profileConfig);
        if (alive) setData(result);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    if (fileTree.length > 0) {
      load();
    } else {
      setData({ ...emptyData, profile: profileConfig });
    }

    return () => {
      alive = false;
    };
  }, [fileTree, profileConfig]);

  const links = useMemo(() => data.profile.links.filter((link) => link.label && link.url), [data.profile.links]);

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="mx-auto w-full max-w-5xl px-8 py-10">
        <div className="rounded-2xl border border-border/70 bg-muted/30 px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-5">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-border/60">
                {profileConfig.avatarUrl ? (
                  <img src={profileConfig.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-semibold text-muted-foreground">
                    {displayName.slice(0, 1) || t.profilePreview.initialFallback}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
                    /u/{profileId}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground max-w-xl">
                  {profileConfig.bio || t.profilePreview.bioPlaceholder}
                </p>
                {links.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    {links.map((link) => (
                      <a
                        key={`${link.label}-${link.url}`}
                        href={link.url}
                        className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground md:text-right">
              <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                <p className="text-base font-semibold text-foreground">{data.pinned.length}</p>
                <p>{t.profilePreview.pinned}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                <p className="text-base font-semibold text-foreground">{data.recent.length}</p>
                <p>{t.profilePreview.recent}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                <p className="text-base font-semibold text-foreground">{data.tags.length}</p>
                <p>{t.profilePreview.tags}</p>
              </div>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="mt-10 text-sm text-muted-foreground">{t.profilePreview.loadingPreview}</div>
        )}
        {error && (
          <div className="mt-10 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <section className="mt-12 space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t.profilePreview.pinned}</h2>
            <span className="text-xs text-muted-foreground">{data.pinned.length}/3</span>
          </header>
          {data.pinned.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              {t.profilePreview.pinnedEmpty}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.pinned.map((note) => (
                <article key={note.path} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  {note.cover && isRemoteCover(note.cover) && (
                    <div className="mb-3 h-32 overflow-hidden rounded-lg border border-border/60 bg-muted">
                      <img src={note.cover} alt={note.title} className="h-full w-full object-cover" />
                    </div>
                  )}
                  <h3 className="font-medium">{note.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{note.summary}</p>
                  {note.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {note.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t.profilePreview.recent}</h2>
            <span className="text-xs text-muted-foreground">{data.recent.length}/10</span>
          </header>
          {data.recent.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              {t.profilePreview.recentEmpty}
            </div>
          ) : (
            <div className="space-y-3">
              {data.recent.map((note) => (
                <div key={note.path} className="rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {note.cover && isRemoteCover(note.cover) && (
                        <img
                          src={note.cover}
                          alt={note.title}
                          className="h-10 w-10 rounded-md object-cover border border-border/60"
                        />
                      )}
                      <h3 className="font-medium">{note.title}</h3>
                    </div>
                    {note.publishAt && (
                      <span className="text-xs text-muted-foreground">{note.publishAt}</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{note.summary}</p>
                  {note.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {note.tags.slice(0, 5).map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t.profilePreview.tags}</h2>
            <span className="text-xs text-muted-foreground">{data.tags.length}</span>
          </header>
          {data.tags.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              {t.profilePreview.tagsEmpty}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.tags.slice(0, 20).map((tag) => (
                <span
                  key={tag.tag}
                  className={cn(
                    "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground",
                    "bg-muted/40"
                  )}
                >
                  #{tag.tag} · {tag.count}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
