import { Message } from "./types";
import { createProvider } from "./factory";
import { getLLMConfig } from "./config";

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
        } : {};

        const provider = createProvider(rewriteConfig);

        // 构建一个保守的改写 prompt：输出仅为改写后的一句话查询
        // 重要：禁止将查询改写成“已完成/已执行”的陈述（例如“已删除...”、“已成功...”等）——改写结果必须是请求/任务形式，用于指导后续模型执行。
        const systemPrompt = `你是一个查询改写助手。对用户的输入进行保守改写，目标是：
    1) 保留所有与意图相关的关键词和实体；
    2) 删除无意义闲聊或客套语；
    3) 将问题或请求简化为适合意图识别与任务执行的短句（不超过 60 个字符）；
    4) **不要**使用过去时或声称任何动作已经完成（不要输出“已删除”、“已完成”、“已成功”等）；
    5) 输出必须是请求/任务形式，例如“删除文件 foo.md 的末尾总结部分”或“将 xxx 合并到 yyy”；
    6) 只输出改写后的单句（不要添加解释、前缀或多余标点）。`;

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
