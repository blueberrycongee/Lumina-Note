import { beforeEach, describe, expect, it, vi } from "vitest";

const getAIConfigMock = vi.hoisted(() =>
  vi.fn(() => ({
    provider: "openai",
    model: "gpt-5.4",
    apiKey: "sk-test",
    temperature: 0.5,
  })),
);

const setConfigMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/ai/ai", () => ({
  getAIConfig: getAIConfigMock,
}));

vi.mock("@/stores/useAIStore", () => ({
  useAIStore: {
    getState: () => ({
      setConfig: setConfigMock,
    }),
  },
}));

import { useAgentProfileStore } from "./useAgentProfileStore";

describe("useAgentProfileStore", () => {
  beforeEach(() => {
    setConfigMock.mockReset();
    useAgentProfileStore.setState({
      profiles: [],
      currentProfileId: null,
    });
  });

  it("applies desktop profiles through AIStore config sync", () => {
    useAgentProfileStore.setState({
      profiles: [
        {
          id: "profile-deepseek",
          name: "DeepSeek",
          autoApprove: false,
          config: {
            provider: "deepseek",
            model: "deepseek-v4-flash",
            apiKey: "sk-deepseek",
            temperature: 0.7,
          },
        },
      ],
      currentProfileId: null,
    });

    useAgentProfileStore
      .getState()
      .setCurrentProfile("profile-deepseek", true);

    expect(setConfigMock).toHaveBeenCalledWith({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKey: "sk-deepseek",
      temperature: 0.7,
    });
    expect(useAgentProfileStore.getState().currentProfileId).toBe("profile-deepseek");
  });
});
