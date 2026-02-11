import { Message, Intent, LLMConfig } from "./types";
import { createProvider } from "./factory";
import { getLLMConfig } from "./config";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

export class IntentRouter {
  /**
   * 分析用户意图
   */
  async route(message: string, history: Message[] = []): Promise<Intent> {
    const config = getLLMConfig();
    
    // 如果未启用路由，默认返回 chat
    if (!config.routing?.enabled) {
      return { type: "chat", confidence: 1.0, reasoning: "Routing disabled" };
    }

    try {
      // 准备路由使用的配置
      // 使用专门的 intent 配置，如果未配置则回退到主配置
      const routerConfig: Partial<LLMConfig> = config.routing.intentProvider ? {
        provider: config.routing.intentProvider,
        apiKey: config.routing.intentApiKey || config.apiKey,
        model: config.routing.intentModel,
        customModelId: config.routing.intentCustomModelId,
        baseUrl: config.routing.intentBaseUrl,
        thinkingMode: "auto",
      } : {};

      const provider = createProvider(routerConfig);

      // 构建 Prompt（使用本地化翻译）
      const t = getCurrentTranslations();
      const systemPrompt = t.prompts.router.system;

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        // 仅使用最近的几条消息作为上下文
        ...history.slice(-3),
        { role: "user", content: message }
      ];

      const response = await provider.call(messages, { temperature: 0.1 });
      
      // 解析 JSON
      const content = response.content.replace(/```json\n?|\n?```/g, "").trim();
      const result = JSON.parse(content) as Intent;
      
      return {
        type: result.type || "chat",
        confidence: result.confidence || 0.5,
        reasoning: result.reasoning || "Parsed from LLM"
      };

    } catch (error) {
      console.error("[IntentRouter] Routing failed:", error);
      // 降级处理
      return { type: "chat", confidence: 0, reasoning: "Routing failed, fallback to chat" };
    }
  }
}

export const intentRouter = new IntentRouter();
