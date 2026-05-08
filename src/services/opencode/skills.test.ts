import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  getDefaultDirectory: vi.fn(),
  getOpencodeServerInfo: vi.fn(),
}));

vi.mock("./client", () => ({
  getDefaultDirectory: clientMocks.getDefaultDirectory,
  getOpencodeServerInfo: clientMocks.getOpencodeServerInfo,
}));

import { listOpencodeSkills } from "./skills";

describe("listOpencodeSkills", () => {
  beforeEach(() => {
    clientMocks.getDefaultDirectory.mockReturnValue("/tmp/vault");
    clientMocks.getOpencodeServerInfo.mockResolvedValue({
      url: "http://127.0.0.1:1234",
      username: "user",
      password: "pass",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            name: "image-gen",
            description: "Generate images",
            location: "/app/out/main/skills/image-gen/SKILL.md",
            content: "Use this skill.",
          },
        ],
      })),
    );
  });

  it("requests skills from the active opencode directory", async () => {
    const skills = await listOpencodeSkills();

    expect(skills).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:1234/skill", {
      headers: {
        authorization: `Basic ${btoa("user:pass")}`,
        "x-opencode-directory": "/tmp/vault",
      },
    });
  });
});
