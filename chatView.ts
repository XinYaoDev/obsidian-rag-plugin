import { ItemView, WorkspaceLeaf, setIcon, Notice, MarkdownRenderer, TFile, normalizePath } from 'obsidian';
import type RagPlugin from './main';

export const VIEW_TYPE_CHAT = "rag-chat-view";

export class ChatView extends ItemView {
    plugin: RagPlugin;

    // ✅ 1. 定义历史文件保存路径
    private readonly historyFilePath = 'Assets/History/chat_history.json';
    
    // 内存中的对话历史
    private chatHistory: { role: 'user' | 'assistant', content: string }[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: RagPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_CHAT; }
    getDisplayText() { return "RAG 助手"; }
    getIcon() { return "bot"; }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('rag-chat-container');

        // ===========================
        // 1. 顶部区域：标题 + 清空按钮
        // ===========================
        const header = container.createEl('div', { cls: 'chat-header' });
        header.createEl('h4', { text: '知识库助手' });

        // ✅ 添加清空历史按钮
        const clearBtn = header.createEl('button', { 
            cls: 'chat-header-btn', // 后面会给这个类加点样式
            attr: { 'aria-label': '清空历史记录' }
        });
        setIcon(clearBtn, 'trash');
        
        // 绑定清空事件
        clearBtn.onclick = async () => {
            // 简单确认一下，防止手滑
            // if (!confirm('确定要清空所有历史记录吗？')) return; 
            
            this.chatHistory = []; // 清空内存
            const msgContainer = container.querySelector('.chat-messages');
            if (msgContainer) msgContainer.empty(); // 清空界面
            await this.saveHistory(); // 清空文件
            new Notice('对话历史已清空');
        };

        // ===========================
        // 2. 消息区域
        // ===========================
        const messageHistory = container.createEl('div', { cls: 'chat-messages' });

        // ===========================
        // 3. 输入区域
        // ===========================
        const inputArea = container.createEl('div', { cls: 'chat-input-area' });
        
        // ✅ 深度思考开关容器
        const toggleContainer = inputArea.createEl('div', { cls: 'deep-thinking-toggle-container' });
        
        const toggleButton = toggleContainer.createEl('div', { 
            cls: 'deep-thinking-toggle',
            attr: { 'aria-label': '切换深度思考模式' }
        });
        
        const toggleIcon = toggleButton.createEl('span', { cls: 'toggle-icon' });
        setIcon(toggleIcon, 'zap');
        
        const toggleLabel = toggleButton.createEl('span', { 
            cls: 'toggle-label',
            text: '深度思考'
        });
        
        // ✅ 初始化开关状态
        const updateToggleState = () => {
            if (this.plugin.settings.enableDeepThinking) {
                toggleButton.removeClass('inactive');
                toggleButton.addClass('active');
            } else {
                toggleButton.removeClass('active');
                toggleButton.addClass('inactive');
            }
        };
        updateToggleState();
        
        // ✅ 绑定开关点击事件
        toggleButton.onclick = async () => {
            // 切换状态
            this.plugin.settings.enableDeepThinking = !this.plugin.settings.enableDeepThinking;
            
            // 更新 UI
            updateToggleState();
            
            // 保存设置
            await this.plugin.saveSettings();
            
            // 可选：显示反馈
            const status = this.plugin.settings.enableDeepThinking ? '开启' : '关闭';
            new Notice(`深度思考模式已${status}`);
        };
        
        // ✅ 输入框和发送按钮的容器（保持在同一行）
        const inputRowContainer = inputArea.createEl('div', { cls: 'input-row-container' });
        const inputBoxContainer = inputRowContainer.createEl('div', { cls: 'input-box-container' });

        const inputEl = inputBoxContainer.createEl('textarea', {
            placeholder: '输入问题，按 Ctrl+Enter 发送...',
            cls: 'chat-input'
        });
        
        inputEl.addEventListener('keydown', (e) => {
            // 1. 如果正在使用输入法（比如打中文拼音时），按回车是为了选字，不应该发送
            if (e.isComposing) {
                return;
            }

            // 2. 如果只按了 Enter (没有按 Shift)
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // 阻止默认的换行行为
                sendMessage();      // 执行发送
            }
        });

        const sendBtn = inputRowContainer.createEl('button', {
            cls: 'chat-send-btn',
            attr: { 'aria-label': '发送' }
        });
        setIcon(sendBtn, 'send');

        // ✅ 加载历史记录并渲染
        await this.loadHistory(messageHistory);

        // ============================================================
        // 4. 发送逻辑
        // ============================================================
        const sendMessage = async () => {
            const content = inputEl.value.trim();
            if (!content) return;

            inputEl.value = '';
            inputEl.style.height = 'auto';

            // 显示并保存用户问题
            await this.appendMessage(messageHistory, content, 'user');
            this.chatHistory.push({ role: 'user', content: content });
            await this.saveHistory(); // ✅ 立即保存

            const loadingMsgWrapper = await this.appendMessage(messageHistory, '', 'ai', true);

            const backendUrl = this.plugin.settings.javaBackendUrl.replace(/\/$/, '');
            const chatUrl = `${backendUrl}/api/rag/chat`;
            
            const providerCode = this.plugin.settings.selectedLlmProvider;
            const apiKey = this.plugin.settings.llmApiKey;
            const modelName = this.plugin.settings.llmModelName;

            try {
                const response = await fetch(chatUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-API-KEY': apiKey 
                    },
                    body: JSON.stringify({
                        question: content,
                        provider: providerCode,
                        model: modelName,
                        history: this.chatHistory, // ✅ 发送历史给后端
                        enableDeepThinking: this.plugin.settings.enableDeepThinking // ✅ 添加深度思考参数
                    })
                });

                loadingMsgWrapper.remove();
                
                const result = await response.json();

                if (response.ok && result.success) {
                    // 显示并保存 AI 回复
                    const aiContent = result.data;
                    await this.appendMessage(messageHistory, aiContent, 'ai');
                    
                    this.chatHistory.push({ role: 'assistant', content: aiContent });
                    await this.saveHistory(); // ✅ 立即保存

                } else {
                    const errorMsg = result.message || `请求失败 (${response.status})`;
                    await this.appendMessage(messageHistory, errorMsg, 'ai', false, true);
                }

            } catch (e) {
                loadingMsgWrapper.remove();
                await this.appendMessage(messageHistory, `🔌 无法连接后端: ${e.message}`, 'ai', false, true);
            }
        };

        sendBtn.onclick = sendMessage;
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // ============================================================
    // 5. 核心：历史记录的保存与加载
    // ============================================================
    
    // 从文件加载历史
    private async loadHistory(container: HTMLElement) {
        try {
            const file = this.app.vault.getAbstractFileByPath(this.historyFilePath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                const history = JSON.parse(content);
                
                if (Array.isArray(history)) {
                    this.chatHistory = history;
                    // 逐条渲染历史消息
                    for (const msg of history) {
                        await this.appendMessage(container, msg.content, msg.role);
                    }
                    // 滚到底部
                    container.scrollTo({ top: container.scrollHeight });
                }
            }
        } catch (e) {
            console.warn('加载历史记录失败或文件不存在:', e);
        }
    }

    // 保存历史到文件
    private async saveHistory() {
        try {
            // 1. 确保目录存在 (Assets/History)
            const pathParts = this.historyFilePath.split('/');
            let currentPath = '';
            for (let i = 0; i < pathParts.length - 1; i++) {
                currentPath += (i === 0 ? '' : '/') + pathParts[i];
                if (!this.app.vault.getAbstractFileByPath(currentPath)) {
                    await this.app.vault.createFolder(currentPath);
                }
            }

            // 2. 写入文件
            const file = this.app.vault.getAbstractFileByPath(this.historyFilePath);
            const jsonContent = JSON.stringify(this.chatHistory, null, 2);

            if (file instanceof TFile) {
                await this.app.vault.modify(file, jsonContent);
            } else {
                await this.app.vault.create(this.historyFilePath, jsonContent);
            }
        } catch (e) {
            console.error('保存历史记录失败:', e);
            new Notice('保存对话历史失败');
        }
    }

    // ============================================================
    // 辅助方法：渲染 Markdown
    // ============================================================
    private async appendMessage(container: HTMLElement, text: string, type: 'user' | 'ai', isLoading = false, isError = false) {
        const msgWrapper = container.createEl('div', {
            cls: `chat-message-wrapper ${type === 'user' ? 'user' : 'ai'}`
        });

        const msgBubble = msgWrapper.createEl('div', {
            cls: `chat-message-bubble ${type === 'user' ? 'user' : 'ai'} ${isError ? 'error' : ''}`
        });

        if (isLoading) {
            msgBubble.addClass('loading');
            setIcon(msgBubble, 'loader-2');
        } else {
            await MarkdownRenderer.render(this.app, text, msgBubble, '', this);
        }

        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        return msgWrapper;
    }
}