import { Message } from "./types";
import { createProvider } from "./factory";
import { getLLMConfig } from "./config";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

/**
 * QueryRewriter
 * 在意图识别前对用户输入做简短且保守的改写：去噪、抽取实体、保留意图相关信息
 * 默认使用 routing.intentProvider / intentModel 的配置；若未配置则回退到全局配置
 */
export class QueryRewriter {
    async rewrite(input: string, history: Message[] = []): Promise<string> {
        const config = getLLMConfig();

        // 优先使用 routing.intent 的 provider 配置（与 IntentRouter 保持一致）
        const rewriteConfig: Partial<any> = config.routing?.intentProvider ? {
            provider: config.routing.intentProvider,
            apiKey: config.routing.intentApiKey || config.apiKey,
            model: config.routing.intentModel,
            customModelId: config.routing.intentCustomModelId,
            baseUrl: config.routing.intentBaseUrl,
            thinkingMode: "auto",
        } : {};

        const provider = createProvider(rewriteConfig);

        // 构建保守的改写 prompt（使用本地化翻译）
        const t = getCurrentTranslations();
        const systemPrompt = t.prompts.rewriter.system;

        const messages: Message[] = [
            { role: "system", content: systemPrompt },
            ...history.slice(-3),
            { role: "user", content: input },
        ];

        try {
            const response = await provider.call(messages, { temperature: 0.0 });
            // 提取纯文本并去除代码块标记
            const content = response.content.replace(/```[\s\S]*?```/g, "").trim();
            // 取第一行作为改写结果
            const firstLine = content.split(/\r?\n/)[0].trim();
            return firstLine || input;
        } catch (e) {
            console.warn("[QueryRewriter] rewrite failed, fallback to original input", e);
            return input;
        }
    }
}

export const queryRewriter = new QueryRewriter();
