// settings.ts

// 定义可选的服务商列表（用于 Embedding 下拉）
export const EMBEDDING_PROVIDERS = [
	{ text: "Aliyun (通义 DashScope)", value: "aliyun" },
	{ text: "OpenAI (Text-Embed)", value: "openai" },
	{ text: "Ollama (本地)", value: "ollama" },
];

// Chat 模型配置
export interface ChatModelConfig {
	id: string;        // 唯一 ID
	name: string;      // 模型展示名称
	provider: string;  // 厂商标识（传给后端）
	model: string;     // 模型名（传给后端）
	baseUrl: string;   // 模型的 Base URL
	apiKey: string;    // 模型专属 API Key
	enabled: boolean;  // 是否启用
}

export interface RagSettings {
	javaBackendUrl: string;

	// --- LLM 设置 ---
	chatModels: ChatModelConfig[];     // 可用的聊天模型列表
	selectedChatModelId: string;       // 当前选中的模型 ID

	// --- Embedding 设置 ---
	selectedEmbeddingProvider: string;
	embeddingApiKey: string; // ✅ 新增：Embedding 独立 Key
	embeddingModelName: string; // ✅ 新增：Embedding 模型名称 (如 text-embedding-v1)

	// --- 同步设置 ---
	enableSync: boolean; // 是否开启同步
	debounceDelay: number; // 防抖延迟 (毫秒)

	// --- 深度思考设置 ---
	enableDeepThinking: boolean; // 是否启用深度思考模式

	// --- 高级设置：自动生成会话标题 ---
	titleGenerationProvider: string; // 标题生成服务商
	titleGenerationModelName: string; // 标题生成模型名称
	titleGenerationApiKey: string; // 标题生成 API Key

	// --- 提示词使用记录（按最近使用排序） ---
	promptUsage: Record<string, number>; // key: file.path, value: timestamp
}

export const DEFAULT_SETTINGS: RagSettings = {
	javaBackendUrl: "http://localhost:8081",

	chatModels: [
		{
			id: "deepseek-chat",
			name: "DeepSeek Chat",
			provider: "deepseek",
			model: "deepseek-chat",
			baseUrl: "https://api.deepseek.com",
			apiKey: "",
			enabled: true,
		},
		{
			id: "aliyun-qwen-max",
			name: "Aliyun Qwen-Max",
			provider: "aliyun",
			model: "qwen-max",
			baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
			apiKey: "",
			enabled: true,
		},
	],
	selectedChatModelId: "deepseek-chat",

	selectedEmbeddingProvider: "aliyun",
	embeddingApiKey: "",
	embeddingModelName: "text-embedding-v1", // 默认值

	enableSync: true,
	debounceDelay: 2000,

	enableDeepThinking: false, // 默认关闭深度思考

	// 默认使用与 LLM 相同的配置
	titleGenerationProvider: "deepseek",
	titleGenerationModelName: "deepseek-chat",
	titleGenerationApiKey: "",

	// 提示词使用记录
	promptUsage: {},
};

// 规范化设置：填充缺失字段 & 兜底选择
export function normalizeSettings(raw: RagSettings): RagSettings {
	const settings: RagSettings = Object.assign({}, DEFAULT_SETTINGS, raw || {});

	if (!settings.chatModels || settings.chatModels.length === 0) {
		settings.chatModels = DEFAULT_SETTINGS.chatModels.map(m => ({ ...m }));
	}

	// 兜底选中模型：优先启用的第一条
	const enabledModels = settings.chatModels.filter(m => m.enabled);
	const fallback = enabledModels[0] || settings.chatModels[0];
	if (!settings.selectedChatModelId || !settings.chatModels.some(m => m.id === settings.selectedChatModelId)) {
		settings.selectedChatModelId = fallback?.id || "";
	}

	return settings;
}
