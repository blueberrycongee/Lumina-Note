import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FileEntry } from "@/lib/tauri";
import { useProfileStore } from "@/stores/useProfileStore";
import { ProfileSettingsSection } from "./ProfileSettingsSection";

const makeFile = (path: string): FileEntry => ({
  name: path.split("/").pop() || path,
  path,
  is_dir: false,
  children: null,
});

describe("ProfileSettingsSection", () => {
  beforeEach(() => {
    useProfileStore.setState({
      config: {
        id: "profile-test",
        displayName: "",
        bio: "",
        avatarUrl: "",
        links: [],
        pinnedNotePaths: [],
      },
    });
  });

  it("updates display name and bio", () => {
    render(
      <ProfileSettingsSection
        fileTree={[makeFile("/vault/NoteA.md")]}
      />
    );

    fireEvent.change(screen.getByLabelText("Profile display name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("Profile bio"), {
      target: { value: "First programmer" },
    });

    const { config } = useProfileStore.getState();
    expect(config.displayName).toBe("Ada Lovelace");
    expect(config.bio).toBe("First programmer");
  });

  it("toggles pinned notes", () => {
    render(
      <ProfileSettingsSection
        fileTree={[
          makeFile("/vault/NoteA.md"),
          makeFile("/vault/NoteB.md"),
        ]}
      />
    );

    fireEvent.click(screen.getByLabelText("Pin NoteA"));
    expect(useProfileStore.getState().config.pinnedNotePaths).toEqual(["/vault/NoteA.md"]);

    fireEvent.click(screen.getByLabelText("Pin NoteB"));
    expect(useProfileStore.getState().config.pinnedNotePaths).toEqual([
      "/vault/NoteA.md",
      "/vault/NoteB.md",
    ]);

    fireEvent.click(screen.getByLabelText("Pin NoteA"));
    expect(useProfileStore.getState().config.pinnedNotePaths).toEqual(["/vault/NoteB.md"]);
  });
});
