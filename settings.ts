// settings.ts

// 定义可选的服务商列表
export const LLM_PROVIDERS = [
	{ text: "DeepSeek (深度求索)", value: "deepseek" },
	{ text: "Aliyun (通义千问)", value: "aliyun" },
	{ text: "OpenAI (官方)", value: "openai" },
	{ text: "Ollama (本地)", value: "ollama" },
	{ text: "Moonshot (Kimi)", value: "moonshot" },
];

export const EMBEDDING_PROVIDERS = [
	{ text: "Aliyun (通义 DashScope)", value: "aliyun" },
	{ text: "OpenAI (Text-Embed)", value: "openai" },
	{ text: "Ollama (本地)", value: "ollama" },
];

export interface RagSettings {
	javaBackendUrl: string;

	// --- LLM 设置 ---
	selectedLlmProvider: string;
	llmApiKey: string;
	llmModelName: string; // ✅ 新增：LLM 模型名称 (如 deepseek-coder)

	// --- Embedding 设置 ---
	selectedEmbeddingProvider: string;
	embeddingApiKey: string; // ✅ 新增：Embedding 独立 Key
	embeddingModelName: string; // ✅ 新增：Embedding 模型名称 (如 text-embedding-v1)

	// --- 同步设置 ---
	enableSync: boolean; // 是否开启同步
	debounceDelay: number; // 防抖延迟 (毫秒)

	// --- 深度思考设置 ---
	enableDeepThinking: boolean; // 是否启用深度思考模式
}

export const DEFAULT_SETTINGS: RagSettings = {
	javaBackendUrl: "http://localhost:8081",

	selectedLlmProvider: "deepseek",
	llmApiKey: "",
	llmModelName: "deepseek-chat", // 默认值

	selectedEmbeddingProvider: "aliyun",
	embeddingApiKey: "",
	embeddingModelName: "text-embedding-v1", // 默认值

	enableSync: true,
	debounceDelay: 2000,

	enableDeepThinking: false, // 默认关闭深度思考
};
