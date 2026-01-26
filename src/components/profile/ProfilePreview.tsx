import { useEffect, useMemo, useState } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useProfileStore } from "@/stores/useProfileStore";
import { buildProfileData } from "@/services/profile/profileData";
import type { ProfilePageData } from "@/types/profile";
import { cn } from "@/lib/utils";

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
  const [data, setData] = useState<ProfilePageData>(emptyData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = profileConfig.displayName || "未命名用户";
  const profileId = profileConfig.id;

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
        <div className="flex items-start gap-6">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {profileConfig.avatarUrl ? (
              <img src={profileConfig.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-semibold text-muted-foreground">
                {displayName.slice(0, 1) || "U"}
              </span>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
              <span className="text-xs text-muted-foreground">/u/{profileId}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {profileConfig.bio || "写点关于你的简介吧…"}
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

        {isLoading && (
          <div className="mt-10 text-sm text-muted-foreground">正在生成公开主页预览…</div>
        )}
        {error && (
          <div className="mt-10 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <section className="mt-12 space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">置顶</h2>
            <span className="text-xs text-muted-foreground">{data.pinned.length}/3</span>
          </header>
          {data.pinned.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              还没有置顶内容。你可以在设置中选择置顶笔记。
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.pinned.map((note) => (
                <article key={note.path} className="rounded-lg border border-border bg-card p-4">
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
            <h2 className="text-lg font-semibold">最近更新</h2>
            <span className="text-xs text-muted-foreground">{data.recent.length}/10</span>
          </header>
          {data.recent.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              暂无公开笔记。请在笔记 frontmatter 中设置 visibility: public。
            </div>
          ) : (
            <div className="space-y-3">
              {data.recent.map((note) => (
                <div key={note.path} className="rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{note.title}</h3>
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
            <h2 className="text-lg font-semibold">标签</h2>
            <span className="text-xs text-muted-foreground">{data.tags.length}</span>
          </header>
          {data.tags.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              没有可展示的标签。
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
