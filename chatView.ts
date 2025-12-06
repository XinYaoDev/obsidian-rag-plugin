import { ItemView, WorkspaceLeaf, setIcon, Notice, MarkdownRenderer, TFile, normalizePath } from 'obsidian';
import type RagPlugin from './main';
import { SessionManager } from './sessionManager';
import { RenameModal } from './renameModal';

export const VIEW_TYPE_CHAT = "rag-chat-view";

export class ChatView extends ItemView {
    plugin: RagPlugin;
    sessionManager: SessionManager;

    // 失败撤回状态追踪
    private lastUserInput: string | null = null;
    private lastUserMessageElement: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: RagPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.sessionManager = new SessionManager(this.app);
    }

    getViewType() { return VIEW_TYPE_CHAT; }
    getDisplayText() { return "RAG 助手"; }
    getIcon() { return "bot"; }

    async onOpen() {
        // 初始化 SessionManager
        await this.sessionManager.initialize();
        
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('rag-chat-container');

        // ===========================
        // 1. 顶部区域：标题 + 会话管理按钮
        // ===========================
        const header = container.createEl('div', { cls: 'chat-header' });
        header.createEl('h4', { text: '知识库助手' });
        
        // 会话管理按钮组
        const sessionActions = header.createEl('div', { cls: 'session-actions' });
        
        // 会话列表按钮(下拉菜单)
        const sessionListBtn = sessionActions.createEl('button', { 
            cls: 'session-action-btn',
            attr: { 'aria-label': '会话列表' }
        });
        setIcon(sessionListBtn, 'list');
        
        // 新建会话按钮
        const newBtn = sessionActions.createEl('button', { 
            cls: 'session-action-btn',
            attr: { 'aria-label': '新建会话' }
        });
        setIcon(newBtn, 'plus');
        
        // 删除当前会话按钮
        const deleteBtn = sessionActions.createEl('button', { 
            cls: 'session-action-btn delete',
            attr: { 'aria-label': '删除当前会话' }
        });
        setIcon(deleteBtn, 'trash');
        
        // 清空当前会话按钮
        const clearBtn = sessionActions.createEl('button', { 
            cls: 'session-action-btn',
            attr: { 'aria-label': '清空当前会话' }
        });
        setIcon(clearBtn, 'eraser');
        
        // ===========================
        // 2. 消息区域（先创建，供后续事件处理使用）
        // ===========================
        const messageHistory = container.createEl('div', { cls: 'chat-messages' });
        
        // ===========================
        // 会话下拉菜单
        // ===========================
        let dropdownEl: HTMLElement | null = null;
        
        // 刷新会话列表显示
        const refreshSessionList = () => {
            if (!dropdownEl) return;
            
            dropdownEl.empty();
            const allSessions = this.sessionManager.getAllSessions();
            const currentSessionId = this.sessionManager.getCurrentSessionId();
            
            console.log('刷新会话列表，总数:', allSessions.length); // 调试日志
            
            // 渲染每个会话项
            for (const session of allSessions) {
                const itemEl = dropdownEl.createEl('div', {
                    cls: `session-item ${session.sessionId === currentSessionId ? 'active' : ''}`
                });
                
                // 激活状态图标
                const checkIcon = itemEl.createEl('div', { cls: 'check-icon' });
                if (session.sessionId === currentSessionId) {
                    setIcon(checkIcon, 'check');
                }
                
                // 会话信息
                const infoEl = itemEl.createEl('div', { cls: 'session-info' });
                infoEl.createEl('div', { cls: 'session-name', text: session.sessionName });
                infoEl.createEl('div', { 
                    cls: 'session-meta', 
                    text: `${session.messageCount} 条消息`
                });
                
                // 会话项操作按钮
                const actionsEl = itemEl.createEl('div', { cls: 'session-item-actions' });
                
                // 重命名按钮
                const renameBtn = actionsEl.createEl('button', {
                    cls: 'session-item-action',
                    attr: { 'aria-label': '重命名' }
                });
                setIcon(renameBtn, 'pencil');
                
                // 删除按钮
                const delBtn = actionsEl.createEl('button', {
                    cls: 'session-item-action delete',
                    attr: { 'aria-label': '删除' }
                });
                setIcon(delBtn, 'trash');
                
                // 点击会话项切换会话
                itemEl.addEventListener('click', async (e) => {
                    if ((e.target as HTMLElement).closest('.session-item-action')) {
                        return; // 点击操作按钮时不切换
                    }
                    
                    if (session.sessionId !== currentSessionId) {
                        await this.switchToSession(session.sessionId, container, messageHistory);
                        dropdownEl?.remove();
                        dropdownEl = null;
                    }
                });
                
                // 重命名按钮事件
                renameBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.renameSessionDialog(session.sessionId);
                    refreshSessionList();
                });
                
                // 删除按钮事件
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.deleteSessionWithConfirm(session.sessionId, container, messageHistory);
                    dropdownEl?.remove();
                    dropdownEl = null;
                });
            }
            
            // 分隔线
            dropdownEl.createEl('div', { cls: 'session-divider' });
            
            // 新建会话按钮
            const newSessionBtn = dropdownEl.createEl('button', { cls: 'new-session-btn' });
            setIcon(newSessionBtn, 'plus');
            newSessionBtn.createEl('span', { text: '新建会话' });
            newSessionBtn.addEventListener('click', async () => {
                await this.createNewSession(container, messageHistory);
                dropdownEl?.remove();
                dropdownEl = null;
            });
        };
        
        // 点击会话列表按钮显示下拉菜单
        sessionListBtn.addEventListener('click', () => {
            if (dropdownEl) {
                dropdownEl.remove();
                dropdownEl = null;
                return;
            }
            
            dropdownEl = header.createEl('div', { cls: 'session-dropdown' });
            refreshSessionList();
            
            // 点击外部关闭下拉菜单
            const closeDropdown = (e: MouseEvent) => {
                if (dropdownEl && !dropdownEl.contains(e.target as Node) && e.target !== sessionListBtn) {
                    dropdownEl.remove();
                    dropdownEl = null;
                    document.removeEventListener('click', closeDropdown);
                }
            };
            setTimeout(() => document.addEventListener('click', closeDropdown), 0);
        });
        
        // 新建会话按钮事件
        newBtn.addEventListener('click', async () => {
            await this.createNewSession(container, messageHistory);
        });
        
        // 删除当前会话按钮事件
        deleteBtn.addEventListener('click', async () => {
            const currentSessionId = this.sessionManager.getCurrentSessionId();
            if (currentSessionId) {
                await this.deleteSessionWithConfirm(currentSessionId, container, messageHistory);
            }
        });
        
        // 清空当前会话按钮事件
        clearBtn.addEventListener('click', async () => {
            this.sessionManager.clearMessages();
            messageHistory.empty();
            await this.sessionManager.saveSession(this.sessionManager.getCurrentSession()!);
            new Notice('对话历史已清空');
        });

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

        //  加载历史记录并渲染
        const messages = this.sessionManager.getMessages();
        for (const msg of messages) {
            const displayType: 'user' | 'ai' = msg.role === 'assistant' ? 'ai' : 'user';
            await this.appendMessage(messageHistory, msg.content, displayType);
        }
        messageHistory.scrollTo({ top: messageHistory.scrollHeight });

        // ============================================================
        // 4. 发送逻辑 - 带失败撤回机制
        // ============================================================
        const sendMessage = async () => {
            const content = inputEl.value.trim();
            if (!content) return;

            // 保存用户输入，用于失败撤回
            this.lastUserInput = content;

            inputEl.value = '';
            inputEl.style.height = 'auto';

            // 显示并保存用户问题
            this.lastUserMessageElement = await this.appendMessage(messageHistory, content, 'user');
            this.sessionManager.addMessage({ role: 'user', content: content });
            await this.sessionManager.saveSession(this.sessionManager.getCurrentSession()!);

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
                        history: this.sessionManager.getMessages(),
                        enableDeepThinking: this.plugin.settings.enableDeepThinking
                    })
                });

                loadingMsgWrapper.remove();
                
                const result = await response.json();

                if (response.ok && result.success) {
                    // 解析新的响应数据结构（支持向后兼容）
                    let answer: string;
                    let thinking: string | null = null;
                    
                    if (typeof result.data === 'string') {
                        // 向后兼容：旧格式（纯字符串）
                        answer = result.data;
                    } else if (typeof result.data === 'object' && result.data !== null) {
                        // 新格式：包含 answer 和 thinking 的对象
                        answer = result.data.answer || '';
                        thinking = result.data.thinking || null;
                        console.log('收到AI回复，包含思考过程:', !!thinking);
                    } else {
                        // 数据格式异常
                        throw new Error('数据格式异常');
                    }
                    
                    // 显示 AI 回复（传递 thinking 参数）
                    await this.appendMessage(messageHistory, answer, 'ai', false, false, thinking);
                    
                    // 仅保存 answer 到会话历史（思考过程不保存）
                    this.sessionManager.addMessage({ role: 'assistant', content: answer });
                    await this.sessionManager.saveSession(this.sessionManager.getCurrentSession()!);
                    
                    // 成功后清空撤回状态
                    this.lastUserInput = null;
                    this.lastUserMessageElement = null;

                } else {
                    // 后端错误 - 执行撤回
                    const errorMsg = result.message || `请求失败 (${response.status})`;
                    await this.appendMessage(messageHistory, `❌ ${errorMsg}`, 'ai', false, true);
                    await this.rollbackFailedMessage(inputEl);
                }

            } catch (e) {
                // 连接失败 - 执行撤回
                loadingMsgWrapper.remove();
                await this.appendMessage(messageHistory, `🔌 无法连接后端: ${e.message}`, 'ai', false, true);
                await this.rollbackFailedMessage(inputEl);
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
    // 会话管理辅助方法
    // ============================================================
    
    // 切换到指定会话
    private async switchToSession(sessionId: string, container: Element, messageHistory: HTMLElement) {
        try {
            await this.sessionManager.switchSession(sessionId);
            
            // 清空消息显示区域
            messageHistory.empty();
            
            // 加载新会话的消息
            const messages = this.sessionManager.getMessages();
            for (const msg of messages) {
                const displayType: 'user' | 'ai' = msg.role === 'assistant' ? 'ai' : 'user';
                await this.appendMessage(messageHistory, msg.content, displayType);
            }
            
            // 更新会话名称显示(如果需要可以添加)
            
            messageHistory.scrollTo({ top: messageHistory.scrollHeight });
        } catch (e) {
            console.error('切换会话失败:', e);
            new Notice('切换会话失败');
        }
    }
    
    // 创建新会话
    private async createNewSession(container: Element, messageHistory: HTMLElement) {
        try {
            const newSessionId = await this.sessionManager.createSession();
            
            // 清空消息显示区域
            messageHistory.empty();
            
            // 更新会话名称显示(如果需要可以添加)
            
            new Notice('已创建新会话');
        } catch (e) {
            console.error('创建会话失败:', e);
            new Notice('创建会话失败');
        }
    }
    
    // 删除会话（带确认）
    private async deleteSessionWithConfirm(sessionId: string, container: Element, messageHistory: HTMLElement) {
        const session = this.sessionManager.getAllSessions().find(s => s.sessionId === sessionId);
        if (!session) return;
        
        // 确认对话框
        const confirmed = confirm(`确定删除会话「${session.sessionName}」吗？此操作不可撤销。`);
        if (!confirmed) return;
        
        try {
            const wasCurrentSession = sessionId === this.sessionManager.getCurrentSessionId();
            await this.sessionManager.deleteSession(sessionId);
            
            // 如果删除的是当前会话，需要刷新界面
            if (wasCurrentSession) {
                messageHistory.empty();
                const messages = this.sessionManager.getMessages();
                for (const msg of messages) {
                    const displayType: 'user' | 'ai' = msg.role === 'assistant' ? 'ai' : 'user';
                    await this.appendMessage(messageHistory, msg.content, displayType);
                }
                
                // 更新会话名称显示(如果需要可以添加)
                messageHistory.scrollTo({ top: messageHistory.scrollHeight });
            }
            
            new Notice('会话已删除');
        } catch (e) {
            console.error('删除会话失败:', e);
            new Notice('删除会话失败');
        }
    }
    
    // 重命名会话对话框
    private async renameSessionDialog(sessionId: string) {
        const session = this.sessionManager.getAllSessions().find(s => s.sessionId === sessionId);
        if (!session) {
            console.error('会话不存在:', sessionId);
            return;
        }
        
        // 使用 Obsidian 的 Modal API 代替 prompt
        const modal = new RenameModal(this.app, session.sessionName, async (newName: string) => {
            console.log('尝试重命名会话:', sessionId, '新名称:', newName);
            const success = await this.sessionManager.renameSession(sessionId, newName);
            
            if (success) {
                console.log('会话重命名成功');
                new Notice('会话已重命名');
            } else {
                console.error('会话重命名失败');
                // 注意：验证失败时 sessionManager.renameSession 已经显示了错误提示
            }
        });
        
        modal.open();
    }

    // ============================================================
    // 失败撤回方法
    // ============================================================
    private async rollbackFailedMessage(inputEl: HTMLTextAreaElement) {
        // 1. 从 DOM 移除用户消息气泡
        if (this.lastUserMessageElement) {
            this.lastUserMessageElement.remove();
            this.lastUserMessageElement = null;
        }
        
        // 2. 从内存中移除最后一条用户消息
        this.sessionManager.removeLastMessage();
        
        // 3. 同步保存到文件
        const currentSession = this.sessionManager.getCurrentSession();
        if (currentSession) {
            await this.sessionManager.saveSession(currentSession);
        }
        
        // 4. 将用户输入恢复到输入框
        if (this.lastUserInput) {
            inputEl.value = this.lastUserInput;
            this.lastUserInput = null;
        }
        
        // 已移除弹窗提示，用户可以看到错误消息气泡
    }

    // ============================================================
    // 辅助方法：渲染 Markdown
    // ============================================================
    private async appendMessage(
        container: HTMLElement, 
        text: string, 
        type: 'user' | 'ai', 
        isLoading = false, 
        isError = false,
        thinking: string | null = null  // 新增：思考过程参数
    ) {
        const msgWrapper = container.createEl('div', {
            cls: `chat-message-wrapper ${type === 'user' ? 'user' : 'ai'}`
        });

        const msgBubble = msgWrapper.createEl('div', {
            cls: `chat-message-bubble ${type === 'user' ? 'user' : 'ai'} ${isError ? 'error' : ''}`
        });
        
        // 添加数据属性存储原始消息内容（用于全文复制）
        if (text && !isLoading) {
            msgBubble.setAttribute('data-message-content', text);
        }

        if (isLoading) {
            msgBubble.addClass('loading');
            setIcon(msgBubble, 'loader-2');
        } else {
            // 如果是AI消息且包含思考过程，先渲染思考面板
            if (type === 'ai' && thinking && thinking.trim()) {
                console.debug('渲染思考面板');
                await this.renderThinkingPanel(msgBubble, thinking);
            }
            
            // 渲染回答内容
            await MarkdownRenderer.render(this.app, text, msgBubble, '', this);
            
            // 为代码块添加包裹容器和复制按钮
            this.wrapCodeBlocks(msgBubble);
            
            // 为 AI 消息添加全文复制按钮（非错误消息）
            if (type === 'ai' && !isError) {
                this.addFullCopyButton(msgBubble, text);
            }
        }

        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        return msgWrapper;
    }
    
    // ============================================================
    // 渲染思考过程折叠面板
    // ============================================================
    private async renderThinkingPanel(container: HTMLElement, thinking: string) {
        // 创建思考过程区域外层容器
        const thinkingPanel = container.createEl('div', {
            cls: 'thinking-panel'
        });
        
        // 创建折叠面板头部（可点击）
        const header = thinkingPanel.createEl('div', {
            cls: 'thinking-panel__header'
        });
        
        // 创建图标容器
        const iconContainer = header.createEl('span', {
            cls: 'thinking-panel__icon'
        });
        setIcon(iconContainer, 'chevron-right');  // 默认收起状态
        
        // 创建标题
        header.createEl('span', {
            cls: 'thinking-panel__title',
            text: '思考过程'
        });
        
        // 创建内容区域（默认隐藏）
        const content = thinkingPanel.createEl('div', {
            cls: 'thinking-panel__content thinking-panel__content--collapsed'
        });
        
        // 渲染思考内容的 Markdown
        try {
            await MarkdownRenderer.render(this.app, thinking, content, '', this);
        } catch (e) {
            console.error('思考内容 Markdown 渲染失败:', e);
            // 降级为纯文本显示
            content.setText(thinking);
        }
        
        // 绑定点击事件，切换展开/收起状态
        let isExpanded = false;
        header.addEventListener('click', () => {
            isExpanded = !isExpanded;
            
            if (isExpanded) {
                // 展开状态
                content.removeClass('thinking-panel__content--collapsed');
                content.addClass('thinking-panel__content--expanded');
                iconContainer.empty();
                setIcon(iconContainer, 'chevron-down');
                console.debug('思考面板已展开');
            } else {
                // 收起状态
                content.removeClass('thinking-panel__content--expanded');
                content.addClass('thinking-panel__content--collapsed');
                iconContainer.empty();
                setIcon(iconContainer, 'chevron-right');
                console.debug('思考面板已收起');
            }
        });
    }
    
    // ============================================================
    // 代码块包裹和复制按钮逻辑
    // ============================================================
    
    // 语言映射表
    private languageMap: { [key: string]: string } = {
        'javascript': 'JavaScript',
        'js': 'JavaScript',
        'typescript': 'TypeScript',
        'ts': 'TypeScript',
        'python': 'Python',
        'py': 'Python',
        'java': 'Java',
        'cpp': 'C++',
        'c++': 'C++',
        'csharp': 'C#',
        'cs': 'C#',
        'html': 'HTML',
        'css': 'CSS',
        'json': 'JSON',
        'markdown': 'Markdown',
        'md': 'Markdown',
        'shell': 'Shell',
        'bash': 'Shell',
        'sql': 'SQL',
    };
    
    // 为代码块添加包裹容器、Header Bar和复制按钮
    private wrapCodeBlocks(container: HTMLElement) {
        const codeBlocks = container.querySelectorAll('pre');
        
        codeBlocks.forEach((pre) => {
            // 创建包裹容器
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            
            // 创建Header Bar
            const header = document.createElement('div');
            header.className = 'code-block-header';
            
            // 提取语言标识
            const codeEl = pre.querySelector('code');
            let language = '';
            if (codeEl) {
                const classList = Array.from(codeEl.classList);
                const langClass = classList.find(cls => cls.startsWith('language-'));
                if (langClass) {
                    const rawLang = langClass.replace('language-', '');
                    language = this.languageMap[rawLang.toLowerCase()] || 
                               rawLang.charAt(0).toUpperCase() + rawLang.slice(1);
                }
            }
            
            // 左侧：语言标签
            const langLabel = document.createElement('span');
            langLabel.className = 'code-language-label';
            langLabel.textContent = language || 'CODE';
            header.appendChild(langLabel);
            
            // 右侧：复制按钮
            const copyBtn = this.createCodeCopyButton(pre);
            header.appendChild(copyBtn);
            
            // 组装结构
            pre.parentNode?.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });
    }
    
    // 创建代码块复制按钮
    private createCodeCopyButton(pre: HTMLElement): HTMLElement {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.setAttribute('aria-label', '复制代码');
        
        // 图标容器
        const iconContainer = document.createElement('span');
        iconContainer.className = 'copy-btn-icon';
        setIcon(iconContainer, 'copy');
        copyBtn.appendChild(iconContainer);
        
        // 文字标签
        const textLabel = document.createElement('span');
        textLabel.className = 'copy-btn-text';
        textLabel.textContent = '复制代码';
        copyBtn.appendChild(textLabel);
        
        // 点击事件
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // 提取代码内容
            const codeEl = pre.querySelector('code');
            const codeText = codeEl?.textContent || pre.textContent || '';
            
            if (!codeText.trim()) {
                new Notice('无代码内容');
                return;
            }
            
            // 复制到剪贴板
            const success = await this.copyToClipboard(codeText);
            
            if (success) {
                // 成功反馈
                copyBtn.classList.add('copy-btn--success');
                iconContainer.innerHTML = '';
                setIcon(iconContainer, 'check');
                textLabel.textContent = '已复制';
                
                // 2秒后恢复
                setTimeout(() => {
                    copyBtn.classList.remove('copy-btn--success');
                    iconContainer.innerHTML = '';
                    setIcon(iconContainer, 'copy');
                    textLabel.textContent = '复制代码';
                }, 2000);
            }
        });
        
        return copyBtn;
    }
    
    // 添加全文复制按钮
    private addFullCopyButton(msgBubble: HTMLElement, text: string) {
        const copyBtn = msgBubble.createEl('button', {
            cls: 'message-copy-full-btn',
            attr: { 'aria-label': '复制消息' }
        });
        
        // 图标容器
        const iconContainer = copyBtn.createEl('span', { cls: 'copy-btn-icon' });
        setIcon(iconContainer, 'copy');
        
        // 文字标签
        const textLabel = copyBtn.createEl('span', {
            cls: 'copy-btn-text',
            text: '复制'
        });
        
        // 点击事件
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // 获取要复制的内容（优先使用 data 属性）
            const contentToCopy = msgBubble.getAttribute('data-message-content') || text;
            
            if (!contentToCopy.trim()) {
                new Notice('无可复制内容');
                return;
            }
            
            // 复制到剪贴板
            const success = await this.copyToClipboard(contentToCopy);
            
            if (success) {
                // 成功反馈
                copyBtn.addClass('copy-btn--success');
                iconContainer.empty();
                setIcon(iconContainer, 'check');
                textLabel.setText('已复制');
                
                // 2秒后恢复
                setTimeout(() => {
                    copyBtn.removeClass('copy-btn--success');
                    iconContainer.empty();
                    setIcon(iconContainer, 'copy');
                    textLabel.setText('复制');
                }, 2000);
            }
        });
    }
    
    // 复制内容到剪贴板
    private async copyToClipboard(text: string): Promise<boolean> {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('复制失败:', err);
            new Notice('复制失败，请重试');
            return false;
        }
    }
}