import { Plugin, TFile, Notice } from 'obsidian';
// 🔥 注意文件名的大小写，建议统一使用 ChatView (大写开头)
import { ChatView, VIEW_TYPE_CHAT } from './chatView';
// 🔥 引入我们拆分出来的设置定义
import { RagSettings, DEFAULT_SETTINGS } from './settings';
import { RagSettingTab } from './settingTab';

export default class RagPlugin extends Plugin {
    settings: RagSettings;
    // 防抖计时器
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

    // ✅ 新增：记录用户最后一次敲键盘的时间
    private lastUserTypingTime: number = 0;

    async onload() {
        // 加载设置
        await this.loadSettings();

        // 添加设置面板
        this.addSettingTab(new RagSettingTab(this.app, this));

        console.log('RAG 插件已加载 - 开始监听文件变化');

        // ============================================================
        // ✅ 新增：监听编辑器变化 (这是过滤 Remote Save 的关键)
        // 只有用户手动打字、粘贴时，这个事件才会触发。
        // 我们利用它来更新“最后活跃时间”，以此区分是人改的还是机器改的。
        // ============================================================
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                this.lastUserTypingTime = Date.now();
            })
        );

        // 1. 注册视图类型
        this.registerView(
            VIEW_TYPE_CHAT,
            // 🔥🔥🔥 关键修改：这里必须传入 'this'，因为 ChatView 的构造函数改了
            (leaf) => new ChatView(leaf, this)
        );

        // 2. 添加左侧 Ribbon 图标
        this.addRibbonIcon('bot', '打开 RAG 助手', () => {
            this.activateView();
        });

        // 3. 监听文件事件
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.handleFileChange(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.handleFileChange(file);
                }
            })
        );
    }

    onunload() {
        console.log('RAG 插件已卸载');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];

        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_CHAT,
                    active: true,
                });
            }
            leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    // 处理文件变化（防抖 2秒）
    private handleFileChange(file: TFile) {
        
        // 1. 检查是否开启了同步开关
        if (!this.settings.enableSync) return;

        // 2. 过滤：只同步当前窗口正在编辑的文件
        // 如果 Remote Save 在后台偷偷改了其他文件，这里直接拦截
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.path !== file.path) {
            return;
        }

        // 3. 过滤：核心逻辑！检查是否是用户刚刚操作过的
        // 如果 Remote Save 改了文件，但你过去 3秒 没敲键盘，说明是机器改的 -> 拦截
        const timeSinceTyping = Date.now() - this.lastUserTypingTime;
        if (timeSinceTyping > 3000) {
            // console.debug(`[RAG 忽略] 检测到非用户操作 (距上次输入 ${timeSinceTyping}ms)`);
            return;
        }

        const filePath = file.path;

        if (this.debounceTimers.has(filePath)) {
            clearTimeout(this.debounceTimers.get(filePath));
        }

        const timerId = setTimeout(async () => {
            await this.syncToBackend(file);
            this.debounceTimers.delete(filePath);
        }, 2000); // 如果你在 settings.ts 里加了 debounceDelay 字段，这里可以用 this.settings.debounceDelay

        this.debounceTimers.set(filePath, timerId);
    }


// 真正的上传逻辑
    private async syncToBackend(file: TFile) {
        try {
            const content = await this.app.vault.read(file);
            const baseUrl = this.settings.javaBackendUrl.replace(/\/$/, '');
            const syncUrl = `${baseUrl}/api/rag/sync`;

            const payload = {
                title: file.basename,
                path: file.path,
                content: content,
                timestamp: Date.now(),
                
                // ✅ 关键修改：发送 Embedding 的完整配置
                embeddingProvider: this.settings.selectedEmbeddingProvider, // 服务商 (aliyun)
                embeddingModel: this.settings.embeddingModelName            // 模型名 (text-embedding-v1)
            };

            // ✅ 关键修改：使用 Embedding 专属的 API Key
            // 如果用户没填 Embedding Key，可以回退使用 LLM Key，或者留空
            const apiKeyToUse = this.settings.embeddingApiKey || this.settings.llmApiKey;

            const response = await fetch(syncUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKeyToUse // 将 Key 放入 Header
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                console.log(`[RAG Sync] Success: ${file.name}`);
            } else {
                console.warn(`[RAG Sync] Fail: ${response.status}`);
            }

        } catch (error) {
            console.debug(`[RAG Sync] Error: ${error.message}`);
        }
    }
}