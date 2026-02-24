import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfilePreview } from "./ProfilePreview";
import { useFileStore } from "@/stores/useFileStore";
import { useProfileStore } from "@/stores/useProfileStore";

const buildProfileDataMock = vi.fn();

vi.mock("@/services/profile/profileData", () => ({
  buildProfileData: (...args: unknown[]) => buildProfileDataMock(...args),
}));

describe("ProfilePreview", () => {
  beforeEach(() => {
    buildProfileDataMock.mockReset();
    useFileStore.setState({
      fileTree: [
        {
          name: "NoteA.md",
          path: "/vault/NoteA.md",
          is_dir: false,
          children: null,
        },
      ],
    });
    useProfileStore.setState({
      config: {
        id: "profile-1",
        displayName: "Ada",
        bio: "Bio",
        avatarUrl: "",
        links: [],
        pinnedNotePaths: [],
      },
    });
  });

  it("renders cover image for pinned notes when cover is remote", async () => {
    buildProfileDataMock.mockResolvedValue({
      profile: useProfileStore.getState().config,
      pinned: [
        {
          path: "/vault/NoteA.md",
          title: "Pinned A",
          summary: "Summary",
          tags: [],
          cover: "https://example.com/cover.jpg",
        },
      ],
      recent: [],
      tags: [],
    });

    render(<ProfilePreview />);

    expect(await screen.findByAltText("Pinned A")).toBeInTheDocument();
  });
});
