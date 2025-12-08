import { App, ItemView, WorkspaceLeaf, setIcon, Notice, MarkdownRenderer, TFile, normalizePath, SuggestModal } from 'obsidian';
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

    // 输入历史记录
    private inputHistory: string[] = [];
    private inputHistoryIndex: number = -1; // -1 表示在最新位置
    private readonly MAX_HISTORY_SIZE = 50; // 最多保存50条历史记录

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

        // 加载输入历史记录
        await this.loadInputHistory();

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

        // 回收站按钮
        const deleteBtn = sessionActions.createEl('button', {
            cls: 'session-action-btn delete',
            attr: { 'aria-label': '回收站' }
        });
        setIcon(deleteBtn, 'archive');

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
                setIcon(delBtn, 'trash-2');

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
                    await this.deleteSessionDirectly(session.sessionId, container, messageHistory);
                    // 刷新会话列表，保持下拉菜单打开
                    refreshSessionList();
                });
            }

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

        // 回收站按钮事件（显示回收站会话列表）
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.showTrashDropdown(deleteBtn, container, messageHistory);
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

            // 1.5 监听“空格 + @”触发提示词选择
            if (e.key === '@') {
                const cursorPos = inputEl.selectionStart ?? 0;
                const prevChar = cursorPos > 0 ? inputEl.value.charAt(cursorPos - 1) : '';
                if (prevChar === ' ') {
                    e.preventDefault();
                    this.openPromptPicker(inputEl);
                    return;
                }
            }

            // 2. 处理上键/下键浏览历史记录
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(inputEl, -1);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(inputEl, 1);
                return;
            }

            // 3. 如果只按了 Enter (没有按 Shift)
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
            // 传递思考过程（如果有）
            const thinking = msg.role === 'assistant' ? (msg.thinking || null) : null;
            await this.appendMessage(messageHistory, msg.content, displayType, false, false, thinking);
        }
        messageHistory.scrollTo({ top: messageHistory.scrollHeight });

        // ============================================================
        // 4. 发送逻辑 - 流式响应版本
        // ============================================================
        // 当前请求的 AbortController（用于终止请求）
        let currentAbortController: AbortController | null = null;
        let currentUserMessageElement: HTMLElement | null = null;
        let currentAIMessageWrapper: HTMLElement | null = null;
        let currentUserInput: string = '';

        const sendMessage = async () => {
            const content = inputEl.value.trim();
            if (!content) return;

            // 保存用户输入
            currentUserInput = content;

            // 将发送按钮改为终止按钮
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
            sendBtn.setAttribute('aria-label', '终止');
            sendBtn.addClass('stop-btn'); // 添加终止按钮样式类
            sendBtn.empty();
            setIcon(sendBtn, 'square'); // 方形终止按钮

            // 保存用户输入，用于失败撤回
            this.lastUserInput = content;

            // 保存到输入历史记录
            this.addToInputHistory(content);

            inputEl.value = '';
            inputEl.style.height = 'auto';

            // 显示并保存用户问题
            this.lastUserMessageElement = await this.appendMessage(messageHistory, content, 'user');
            currentUserMessageElement = this.lastUserMessageElement;
            this.sessionManager.addMessage({ role: 'user', content: content });
            await this.sessionManager.saveSession(this.sessionManager.getCurrentSession()!);

            // 创建 AI 消息占位符（不使用 loading 状态，直接创建空结构）
            const msgWrapper = messageHistory.createEl('div', {
                cls: 'chat-message-wrapper ai'
            });
            currentAIMessageWrapper = msgWrapper;
            const msgBubble = msgWrapper.createEl('div', {
                cls: 'chat-message-bubble ai'
            });

            // 准备流式更新的状态
            let thinkingBuffer = '';
            let answerBuffer = '';
            let thinkingPanel: HTMLElement | null = null;
            let thinkingContent: HTMLElement | null = null;
            let thinkingHeader: HTMLElement | null = null;
            let thinkingIconContainer: HTMLElement | null = null;
            let answerContainer: HTMLElement | null = null;
            let isStreaming = true;
            let hasStartedAnswering = false; // 标记是否已开始回答

            // 渲染节流控制
            let renderTimer: NodeJS.Timeout | null = null;
            let thinkingRenderTimer: NodeJS.Timeout | null = null;
            const RENDER_THROTTLE_MS = 150;

            // 创建思考面板（如果启用深度思考）
            if (this.plugin.settings.enableDeepThinking) {
                thinkingPanel = msgBubble.createEl('div', { cls: 'thinking-panel' });
                thinkingHeader = thinkingPanel.createEl('div', { cls: 'thinking-panel__header' });
                thinkingIconContainer = thinkingHeader.createEl('span', { cls: 'thinking-panel__icon' });
                setIcon(thinkingIconContainer, 'chevron-down'); // 默认展开状态
                thinkingHeader.createEl('span', { cls: 'thinking-panel__title', text: '思考过程' });
                thinkingContent = thinkingPanel.createEl('div', {
                    cls: 'thinking-panel__content thinking-panel__content--expanded'
                });
                thinkingPanel.addClass('thinking-panel--active');

                // 绑定折叠/展开功能
                let isExpanded = true;
                thinkingHeader.addEventListener('click', () => {
                    isExpanded = !isExpanded;

                    if (isExpanded) {
                        thinkingContent!.removeClass('thinking-panel__content--collapsed');
                        thinkingContent!.addClass('thinking-panel__content--expanded');
                        thinkingIconContainer!.empty();
                        setIcon(thinkingIconContainer!, 'chevron-down');
                    } else {
                        thinkingContent!.removeClass('thinking-panel__content--expanded');
                        thinkingContent!.addClass('thinking-panel__content--collapsed');
                        thinkingIconContainer!.empty();
                        setIcon(thinkingIconContainer!, 'chevron-right');
                    }
                });
            }

            // 创建回答内容容器
            answerContainer = msgBubble.createEl('div', { cls: 'answer-content' });

            // 显示初始 loading 状态
            const loadingIcon = answerContainer.createEl('div', { cls: 'loading-indicator' });
            setIcon(loadingIcon, 'loader-2');

            // 渲染函数（带节流）
            const renderAnswer = () => {
                if (!answerContainer || !isStreaming) return;

                // 清空容器
                answerContainer.empty();

                // ⚠️ 预处理不完整的 Markdown 结构（用于流式渲染容错）
                const processedBuffer = this.preprocessIncompleteMarkdown(answerBuffer);

                // 渲染 Markdown
                try {
                    MarkdownRenderer.render(this.app, processedBuffer, answerContainer, '', this).then(() => {
                        // 为代码块添加包裹容器和复制按钮
                        this.wrapCodeBlocks(answerContainer!);
                    }).catch((e) => {
                        console.error('Markdown 渲染失败:', e);
                        // 降级为纯文本
                        answerContainer!.setText(answerBuffer);
                    });
                } catch (e) {
                    console.error('Markdown 渲染异常:', e);
                    answerContainer.setText(answerBuffer);
                }

                // 更新数据属性（用于全文复制）
                if (answerBuffer) {
                    msgBubble.setAttribute('data-message-content', answerBuffer);
                }

                // 滚动到底部
                messageHistory.scrollTo({ top: messageHistory.scrollHeight, behavior: 'smooth' });
            };

            // 节流渲染函数
            const throttledRenderAnswer = () => {
                if (renderTimer) return;
                renderTimer = setTimeout(() => {
                    renderAnswer();
                    renderTimer = null;
                }, RENDER_THROTTLE_MS);
            };

            // 更新思考内容的函数（使用节流优化）
            const updateThinking = (newData: string) => {
                if (!thinkingContent || !isStreaming) return;
                thinkingBuffer += newData;

                // 节流渲染思考内容（减少节流时间以提升更新速度）
                if (thinkingRenderTimer) {
                    clearTimeout(thinkingRenderTimer);
                }

                thinkingRenderTimer = setTimeout(() => {
                    try {
                        // 清空并重新渲染
                        thinkingContent!.empty();
                        // 转义代码块标记后再渲染（保留内容但不渲染为代码块）
                        const processedThinking = this.escapeCodeBlocksInMarkdown(thinkingBuffer);
                        MarkdownRenderer.render(this.app, processedThinking, thinkingContent!, '', this).then(() => {
                            // 渲染后移除所有代码块元素
                            this.removeCodeBlocksFromThinkingPanel(thinkingContent!);
                        }).catch((e) => {
                            console.error('思考内容渲染失败:', e);
                            thinkingContent!.setText(processedThinking);
                        });
                    } catch (e) {
                        const processedThinking = this.escapeCodeBlocksInMarkdown(thinkingBuffer);
                        thinkingContent!.setText(processedThinking);
                    }

                    // 只滚动外部的消息历史容器到底部，不操作思考面板内部的滚动
                    // 思考面板在活跃状态下会自然扩展，不会有内部滚动条
                    messageHistory.scrollTo({ top: messageHistory.scrollHeight, behavior: 'smooth' });

                    thinkingRenderTimer = null;
                }, 100); // ⚠️ 优化：思考内容渲染节流从 200ms 减少到 100ms，提升更新速度
            };

            const backendUrl = this.plugin.settings.javaBackendUrl.replace(/\/$/, '');
            const chatUrl = `${backendUrl}/api/rag/chat/stream`;

            const providerCode = this.plugin.settings.selectedLlmProvider;
            const apiKey = this.plugin.settings.llmApiKey;
            const modelName = this.plugin.settings.llmModelName;

            // 创建 AbortController 用于终止请求
            currentAbortController = new AbortController();

            // 终止按钮点击事件
            const handleStop = async () => {
                if (currentAbortController) {
                    // 中止请求
                    currentAbortController.abort();
                    currentAbortController = null;
                }

                // 停止流式更新
                isStreaming = false;
                if (renderTimer) {
                    clearTimeout(renderTimer);
                    renderTimer = null;
                }
                if (thinkingRenderTimer) {
                    clearTimeout(thinkingRenderTimer);
                    thinkingRenderTimer = null;
                }

                // 删除用户消息和AI消息
                if (currentUserMessageElement) {
                    currentUserMessageElement.remove();
                    currentUserMessageElement = null;
                }
                if (currentAIMessageWrapper) {
                    currentAIMessageWrapper.remove();
                    currentAIMessageWrapper = null;
                }

                // 从会话历史中移除最后两条消息（用户消息和AI消息）
                this.sessionManager.removeLastMessage(); // 移除AI消息（如果已添加）
                this.sessionManager.removeLastMessage(); // 移除用户消息
                await this.sessionManager.saveSession(this.sessionManager.getCurrentSession()!);

                // 恢复用户输入到输入框
                inputEl.value = currentUserInput;
                inputEl.focus();

                // 恢复发送按钮
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
                sendBtn.style.cursor = 'pointer';
                sendBtn.setAttribute('aria-label', '发送');
                sendBtn.removeClass('stop-btn'); // 移除终止按钮样式类
                sendBtn.empty();
                setIcon(sendBtn, 'send');

                // 移除终止按钮的点击事件（避免重复绑定）
                sendBtn.onclick = sendMessage;
            };

            // 绑定终止按钮点击事件
            sendBtn.onclick = handleStop;

            try {
                // 移除初始 loading 图标
                if (answerContainer) {
                    const loadingIndicator = answerContainer.querySelector('.loading-indicator');
                    if (loadingIndicator) {
                        loadingIndicator.remove();
                    }
                }

            // 构造历史记录（去掉刚刚添加的当前用户提问，避免 question 与 history 重复）
            const fullHistory = this.sessionManager.getMessages();
            const payloadHistory = (() => {
                if (fullHistory.length === 0) return [];
                const last = fullHistory[fullHistory.length - 1];
                // 仅当最后一条是当前用户的提问时才剔除，避免误删历史消息
                if (last.role === 'user' && last.content === content) {
                    return fullHistory.slice(0, fullHistory.length - 1);
                }
                return fullHistory;
            })();

            // 发起流式请求
                await this.streamChat(
                    chatUrl,
                    {
                        question: content,
                        provider: providerCode,
                        model: modelName,
                    history: payloadHistory,
                        enableDeepThinking: this.plugin.settings.enableDeepThinking
                    },
                    apiKey,
                    currentAbortController, // 传递 AbortController
                    // onThinking 回调
                    (thinkingData: string) => {
                        if (!isStreaming) return; // 如果已终止，不再处理
                        updateThinking(thinkingData);
                    },
                    // onAnswer 回调
                    (answerData: string) => {
                        if (!isStreaming) return; // 如果已终止，不再处理
                        // 第一次收到回答数据时，自动折叠思考面板
                        if (!hasStartedAnswering && thinkingPanel && thinkingContent && thinkingIconContainer) {
                            hasStartedAnswering = true;
                            // 折叠思考面板
                            thinkingContent.removeClass('thinking-panel__content--expanded');
                            thinkingContent.addClass('thinking-panel__content--collapsed');
                            thinkingIconContainer.empty();
                            setIcon(thinkingIconContainer, 'chevron-right');
                        }

                        answerBuffer += answerData;
                        // 添加流式样式类（用于显示打字机光标效果）
                        if (answerContainer && !answerContainer.hasClass('streaming')) {
                            answerContainer.addClass('streaming');
                        }
                        throttledRenderAnswer();
                    },
                    // onError 回调
                    async (error: Error) => {
                        isStreaming = false;
                        currentAbortController = null; // 清空 AbortController
                        
                        if (renderTimer) {
                            clearTimeout(renderTimer);
                            renderTimer = null;
                        }
                        if (thinkingRenderTimer) {
                            clearTimeout(thinkingRenderTimer);
                            thinkingRenderTimer = null;
                        }

                        // 如果是用户主动终止，不显示错误消息，终止逻辑已在 handleStop 中处理
                        if (error.message === '请求已中止' || error.name === 'AbortError') {
                            return;
                        }

                        // 移除当前消息气泡
                        msgWrapper.remove();
                        currentAIMessageWrapper = null;

                        // 显示错误消息
                        await this.appendMessage(messageHistory, `❌ ${error.message}`, 'ai', false, true);

                        // 执行撤回
                        await this.rollbackFailedMessage(inputEl);

                        // 恢复发送按钮
                        sendBtn.disabled = false;
                        sendBtn.style.opacity = '1';
                        sendBtn.style.cursor = 'pointer';
                        sendBtn.setAttribute('aria-label', '发送');
                        sendBtn.removeClass('stop-btn'); // 移除终止按钮样式类
                        sendBtn.empty();
                        setIcon(sendBtn, 'send');
                        sendBtn.onclick = sendMessage;
                    },
                    // onComplete 回调
                    async () => {
                        isStreaming = false;
                        currentAbortController = null; // 清空 AbortController

                        // 清除所有节流定时器
                        if (renderTimer) {
                            clearTimeout(renderTimer);
                            renderTimer = null;
                        }
                        if (thinkingRenderTimer) {
                            clearTimeout(thinkingRenderTimer);
                            thinkingRenderTimer = null;
                        }

                        // 最终渲染回答内容
                        renderAnswer();

                        // 最终渲染思考内容（如果有）
                        if (thinkingContent && thinkingBuffer) {
                            try {
                                thinkingContent.empty();
                                // 转义代码块标记后再渲染（保留内容但不渲染为代码块）
                                const processedThinking = this.escapeCodeBlocksInMarkdown(thinkingBuffer);
                                await MarkdownRenderer.render(this.app, processedThinking, thinkingContent, '', this);
                                // 渲染后移除所有代码块元素
                                this.removeCodeBlocksFromThinkingPanel(thinkingContent);
                            } catch (e) {
                                const processedThinking = this.escapeCodeBlocksInMarkdown(thinkingBuffer);
                                thinkingContent.setText(processedThinking);
                            }
                        }

                        // 移除思考面板的活跃状态
                        if (thinkingPanel) {
                            thinkingPanel.removeClass('thinking-panel--active');
                        }

                        // 移除流式样式类（如果有）
                        if (answerContainer) {
                            answerContainer.removeClass('streaming');
                        }

                        // 添加全文复制按钮（流结束后）
                        if (answerBuffer && !msgBubble.querySelector('.message-copy-full-btn')) {
                            this.addFullCopyButton(msgBubble, answerBuffer);
                        }

                        // 保存到会话历史（同时保存 answer 和 thinking）
                        if (answerBuffer) {
                            this.sessionManager.addMessage({ 
                                role: 'assistant', 
                                content: answerBuffer,
                                thinking: thinkingBuffer || null // 保存思考过程
                            });
                            await this.sessionManager.saveSession(this.sessionManager.getCurrentSession()!);
                            
                            // ✅ 自动生成会话主题名称（仅在第一次提问且为默认名称时）
                            await this.autoGenerateSessionTitle(content, answerBuffer);
                        }

                        // 成功后清空撤回状态
                        this.lastUserInput = null;
                        this.lastUserMessageElement = null;
                        currentUserMessageElement = null;
                        currentAIMessageWrapper = null;

                        // 恢复发送按钮
                        sendBtn.disabled = false;
                        sendBtn.style.opacity = '1';
                        sendBtn.style.cursor = 'pointer';
                        sendBtn.setAttribute('aria-label', '发送');
                        sendBtn.removeClass('stop-btn'); // 移除终止按钮样式类
                        sendBtn.empty();
                        setIcon(sendBtn, 'send');
                        sendBtn.onclick = sendMessage;
                    }
                );

            } catch (e: any) {
                // 连接失败 - 执行撤回
                isStreaming = false;
                currentAbortController = null; // 清空 AbortController
                
                // 如果是用户主动终止，不显示错误消息
                if (e.message === '请求已中止' || e.name === 'AbortError') {
                    // 终止逻辑已在 handleStop 中处理，这里不需要额外操作
                    return;
                }

                msgWrapper.remove();
                currentAIMessageWrapper = null;
                await this.appendMessage(messageHistory, `🔌 无法连接后端: ${e.message}`, 'ai', false, true);
                await this.rollbackFailedMessage(inputEl);

                // 恢复发送按钮
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
                sendBtn.style.cursor = 'pointer';
                sendBtn.setAttribute('aria-label', '发送');
                sendBtn.removeClass('stop-btn'); // 移除终止按钮样式类
                sendBtn.empty();
                setIcon(sendBtn, 'send');
                sendBtn.onclick = sendMessage;
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
                // 传递思考过程（如果有）
                const thinking = msg.role === 'assistant' ? (msg.thinking || null) : null;
                await this.appendMessage(messageHistory, msg.content, displayType, false, false, thinking);
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

    // 打开提示词选择器（prompts 文件夹中的 md）
    private openPromptPicker(inputEl: HTMLTextAreaElement) {
        const promptFiles = this.getPromptFiles();
        if (promptFiles.length === 0) {
            new Notice('prompts 文件夹中没有可用的提示词文件');
            return;
        }

        const modal = new PromptSuggestionModal(this.app, promptFiles, async (file) => {
            await this.insertPromptContent(inputEl, file);
        });
        modal.open();
    }

    // 获取 prompts 文件夹下的所有 md 文件
    private getPromptFiles(): TFile[] {
        const files = this.app.vault.getFiles();
        return files.filter(file => 
            file.extension.toLowerCase() === 'md' &&
            file.path.toLowerCase().startsWith('prompts/')
        );
    }

    // 将提示词内容插入输入框当前位置
    private async insertPromptContent(inputEl: HTMLTextAreaElement, file: TFile) {
        try {
            const raw = await this.app.vault.read(file);
            const content = this.cleanPromptContent(raw);

            if (!content) {
                new Notice('提示词内容为空');
                return;
            }

            const start = inputEl.selectionStart ?? inputEl.value.length;
            const end = inputEl.selectionEnd ?? inputEl.value.length;

            // 不插入额外的 @ 字符，直接把内容放在光标处
            const newValue = inputEl.value.slice(0, start) + content + inputEl.value.slice(end);
            const newCursor = start + content.length;
            inputEl.value = newValue;
            inputEl.setSelectionRange(newCursor, newCursor);
        } catch (e) {
            console.error('读取提示词文件失败:', e);
            new Notice('读取提示词失败');
        }
    }

    // 清洗提示词内容：移除最前面的 frontmatter（--- 包裹）并去除首尾空白
    private cleanPromptContent(raw: string): string {
        // 去掉开头的空白后，检查 frontmatter
        const cleanedFrontmatter = raw.replace(/^\s*---[\s\S]*?---\s*/m, '');
        return cleanedFrontmatter.trim();
    }

    // 删除会话（直接删除，不确认）
    private async deleteSessionDirectly(sessionId: string, container: Element, messageHistory: HTMLElement) {
        try {
            const wasCurrentSession = sessionId === this.sessionManager.getCurrentSessionId();
            await this.sessionManager.deleteSession(sessionId);

            // 如果删除的是当前会话，需要刷新界面
            if (wasCurrentSession) {
                messageHistory.empty();
                const messages = this.sessionManager.getMessages();
                for (const msg of messages) {
                    const displayType: 'user' | 'ai' = msg.role === 'assistant' ? 'ai' : 'user';
                    // 传递思考过程（如果有）
                    const thinking = msg.role === 'assistant' ? (msg.thinking || null) : null;
                    await this.appendMessage(messageHistory, msg.content, displayType, false, false, thinking);
                }

                // 更新会话名称显示(如果需要可以添加)
                messageHistory.scrollTo({ top: messageHistory.scrollHeight });
            }
        } catch (e) {
            console.error('删除会话失败:', e);
            new Notice('删除会话失败');
        }
    }

    // 删除会话（带确认）
    private async deleteSessionWithConfirm(sessionId: string, container: Element, messageHistory: HTMLElement) {
        const session = this.sessionManager.getAllSessions().find(s => s.sessionId === sessionId);
        if (!session) return;

        // 确认对话框
        const confirmed = confirm(`确定将会话「${session.sessionName}」移到回收站吗？`);
        if (!confirmed) return;

        await this.deleteSessionDirectly(sessionId, container, messageHistory);
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

    // 显示回收站下拉菜单
    private async showTrashDropdown(button: HTMLElement, container: Element, messageHistory: HTMLElement) {
        // 如果已经打开，则关闭
        const existingDropdown = container.querySelector('.trash-dropdown');
        if (existingDropdown) {
            existingDropdown.remove();
            return;
        }

        // 创建下拉菜单
        const header = container.querySelector('.chat-header') as HTMLElement;
        if (!header) return;

        const dropdownEl = header.createEl('div', { cls: 'trash-dropdown session-dropdown' });
        
        // 获取回收站会话
        const trashSessions = await this.sessionManager.getTrashSessions();

        if (trashSessions.length === 0) {
            dropdownEl.createEl('div', { 
                cls: 'trash-empty',
                text: '回收站为空'
            });
        } else {
            // 一键清空按钮
            const clearAllBtn = dropdownEl.createEl('button', { cls: 'clear-all-trash-btn' });
            setIcon(clearAllBtn, 'trash-2');
            clearAllBtn.createEl('span', { text: '一键清空' });
            clearAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmed = confirm(`确定要清空回收站吗？将永久删除 ${trashSessions.length} 个会话，此操作不可撤销。`);
                if (confirmed) {
                    let successCount = 0;
                    for (const session of trashSessions) {
                        const success = await this.sessionManager.permanentlyDeleteFromTrash(session.sessionId);
                        if (success) successCount++;
                    }
                    if (successCount > 0) {
                        new Notice(`已清空 ${successCount} 个会话`);
                        dropdownEl.remove();
                        // 重新显示回收站列表（应该是空的）
                        await this.showTrashDropdown(button, container, messageHistory);
                    } else {
                        new Notice('清空回收站失败');
                    }
                }
            });

            // 分隔线
            dropdownEl.createEl('div', { cls: 'session-divider' });
            // 显示回收站会话列表
            for (const session of trashSessions) {
                const itemEl = dropdownEl.createEl('div', { cls: 'session-item trash-item' });

                // 会话信息
                const infoEl = itemEl.createEl('div', { cls: 'session-info' });
                infoEl.createEl('div', { cls: 'session-name', text: session.sessionName });
                infoEl.createEl('div', {
                    cls: 'session-meta',
                    text: `${session.messageCount} 条消息 · ${new Date(session.updatedAt).toLocaleString('zh-CN')}`
                });

                // 操作按钮
                const actionsEl = itemEl.createEl('div', { cls: 'session-item-actions' });

                // 恢复按钮
                const restoreBtn = actionsEl.createEl('button', {
                    cls: 'session-item-action restore',
                    attr: { 'aria-label': '恢复' }
                });
                setIcon(restoreBtn, 'rotate-ccw');
                restoreBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const success = await this.sessionManager.restoreSessionFromTrash(session.sessionId);
                    if (success) {
                        new Notice('会话已恢复');
                        dropdownEl.remove();
                        // 刷新会话列表
                        const sessionListBtn = container.querySelector('.session-action-btn[aria-label="会话列表"]') as HTMLElement;
                        if (sessionListBtn) {
                            sessionListBtn.click();
                        }
                    } else {
                        new Notice('恢复会话失败');
                    }
                });

                // 永久删除按钮
                const deleteBtn = actionsEl.createEl('button', {
                    cls: 'session-item-action delete',
                    attr: { 'aria-label': '永久删除' }
                });
                setIcon(deleteBtn, 'trash-2');
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const confirmed = confirm(`确定永久删除会话「${session.sessionName}」吗？此操作不可撤销。`);
                    if (confirmed) {
                        const success = await this.sessionManager.permanentlyDeleteFromTrash(session.sessionId);
                        if (success) {
                            new Notice('会话已永久删除');
                            dropdownEl.remove();
                            // 重新显示回收站列表
                            await this.showTrashDropdown(button, container, messageHistory);
                        } else {
                            new Notice('删除会话失败');
                        }
                    }
                });
            }
        }

        // 点击外部关闭下拉菜单
        const closeDropdown = (e: MouseEvent) => {
            if (dropdownEl && !dropdownEl.contains(e.target as Node) && e.target !== button) {
                dropdownEl.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 0);
    }

    // ============================================================
    // 输入历史记录管理
    // ============================================================

    // 加载输入历史记录
    private async loadInputHistory(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            if (data && data.inputHistory && Array.isArray(data.inputHistory)) {
                this.inputHistory = data.inputHistory;
                // 限制历史记录数量
                if (this.inputHistory.length > this.MAX_HISTORY_SIZE) {
                    this.inputHistory = this.inputHistory.slice(-this.MAX_HISTORY_SIZE);
                }
            }
        } catch (e) {
            console.error('加载输入历史记录失败:', e);
            this.inputHistory = [];
        }
    }

    // 保存输入历史记录
    private async saveInputHistory(): Promise<void> {
        try {
            const data = await this.plugin.loadData() || {};
            data.inputHistory = this.inputHistory;
            await this.plugin.saveData(data);
        } catch (e) {
            console.error('保存输入历史记录失败:', e);
        }
    }

    // 添加到输入历史记录
    private addToInputHistory(content: string): void {
        // 如果与最后一条相同，不重复添加
        if (this.inputHistory.length > 0 && this.inputHistory[this.inputHistory.length - 1] === content) {
            return;
        }

        // 添加到末尾
        this.inputHistory.push(content);

        // 限制历史记录数量
        if (this.inputHistory.length > this.MAX_HISTORY_SIZE) {
            this.inputHistory = this.inputHistory.slice(-this.MAX_HISTORY_SIZE);
        }

        // 重置索引
        this.inputHistoryIndex = -1;

        // 异步保存（不阻塞发送）
        this.saveInputHistory();
    }

    // 浏览历史记录
    private navigateHistory(inputEl: HTMLTextAreaElement, direction: number): void {
        if (this.inputHistory.length === 0) {
            return;
        }

        // 如果当前在最新位置（-1），且用户正在输入内容，先保存当前输入
        if (this.inputHistoryIndex === -1 && inputEl.value.trim()) {
            // 不保存，只是浏览历史
        }

        // 计算新索引
        if (direction === -1) {
            // 向上：查看更早的历史
            if (this.inputHistoryIndex === -1) {
                // 从最新开始
                this.inputHistoryIndex = this.inputHistory.length - 1;
            } else if (this.inputHistoryIndex > 0) {
                this.inputHistoryIndex--;
            }
        } else {
            // 向下：查看更新的历史
            if (this.inputHistoryIndex === -1) {
                // 已经在最新位置
                return;
            } else if (this.inputHistoryIndex < this.inputHistory.length - 1) {
                this.inputHistoryIndex++;
            } else {
                // 到达最新位置，清空输入框
                this.inputHistoryIndex = -1;
                inputEl.value = '';
                return;
            }
        }

        // 设置输入框内容
        if (this.inputHistoryIndex >= 0 && this.inputHistoryIndex < this.inputHistory.length) {
            inputEl.value = this.inputHistory[this.inputHistoryIndex];
            // 将光标移到末尾
            setTimeout(() => {
                inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
            }, 0);
        }
    }

    // ============================================================
    // 流式请求核心函数
    // ============================================================

    /**
     * 流式聊天请求函数
     * 使用 fetch + ReadableStream 处理 SSE 流
     */
    private async streamChat(
        url: string,
        requestBody: any,
        apiKey: string,
        abortController: AbortController, // 接收外部传入的 AbortController
        onThinking: (data: string) => void,
        onAnswer: (data: string) => void,
        onError: (error: Error) => void,
        onComplete: () => void
    ): Promise<void> {
        let buffer = '';

        try {

            // 不设置超时限制，允许长时间流式响应
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKey
                },
                body: JSON.stringify(requestBody),
                signal: abortController.signal
            });

            if (!response.ok) {
                // HTTP 错误
                let errorMessage = `请求失败 (${response.status})`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                } catch (e) {
                    // 忽略 JSON 解析错误
                }
                throw new Error(errorMessage);
            }

            if (!response.body) {
                throw new Error('响应体为空');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        // 流结束，处理剩余缓冲区
                        if (buffer.trim()) {
                            this.processSSEBuffer(buffer, onThinking, onAnswer);
                        }
                        break;
                    }

                    // 解码数据块
                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    // 按 \n\n 分割事件块
                    const parts = buffer.split('\n\n');

                    // 保留最后一个可能不完整的部分
                    buffer = parts.pop() || '';

                    // 处理完整的事件块
                    for (const part of parts) {
                        if (part.trim()) {
                            this.processSSEBuffer(part, onThinking, onAnswer);
                        }
                    }
                }

                onComplete();

            } catch (readError: any) {
                if (readError.name === 'AbortError') {
                    throw new Error('请求已中止');
                }
                throw readError;
            } finally {
                reader.releaseLock();
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                onError(new Error('请求已中止'));
            } else if (error.message) {
                onError(error);
            } else {
                onError(new Error(`网络错误: ${error.message || '未知错误'}`));
            }
        }
    }

    /**
     * 解析 SSE 事件块
     * 支持新的 JSON 格式：data: {"content": "文本内容"}
     * 也兼容旧格式（如果后端发送原始文本）
     */
    private processSSEBuffer(
        buffer: string,
        onThinking: (data: string) => void,
        onAnswer: (data: string) => void
    ): void {
        const lines = buffer.split('\n');
        let eventType: string | null = null;
        const dataLines: string[] = [];

        for (const line of lines) {
            if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
                const lineData = line.substring(5);
                // 处理 [DONE] 标识
                if (lineData.trim() === '[DONE]') {
                    return; // 流结束标识，不处理
                }
                dataLines.push(lineData);
            }
        }

        // 合并所有 data 行（SSE 规范允许多行 data）
        const rawData = dataLines.join('\n');

        if (!rawData) {
            return; // 没有数据，直接返回
        }

        // ⚠️ 新逻辑：尝试解析 JSON 格式，提取 content 字段
        let content: string | null = null;
        try {
            // 尝试解析为 JSON 对象
            const payload = JSON.parse(rawData);
            // 如果解析成功，提取 content 字段
            if (payload && typeof payload === 'object' && 'content' in payload) {
                content = payload.content || '';
            } else {
                // JSON 解析成功但不是预期格式，使用原始数据
                content = rawData;
            }
        } catch (e) {
            // JSON 解析失败，可能是旧格式（原始文本）或错误信息
            // 降级为直接使用原始数据
            content = rawData;
        }

        // 根据事件类型调用对应回调
        if (content) {
            if (eventType === 'thinking') {
                onThinking(content);
            } else if (eventType === 'answer') {
                onAnswer(content);
            } else if (!eventType) {
                // 如果没有 event 字段，默认作为 answer 处理
                onAnswer(content);
            }
        }
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
    // 预处理思考内容：转义代码块标记
    // ============================================================
    
    /**
     * 从思考面板中移除所有代码块元素，将其转换为纯文本
     * 处理 Obsidian 可能渲染的各种代码块格式（三个反引号、缩进代码块等）
     */
    private removeCodeBlocksFromThinkingPanel(container: HTMLElement): void {
        // 1. 移除代码块包装器（code-block-wrapper）及其内容
        // 注意：使用 Array.from 创建数组副本，避免在遍历时修改 DOM 导致的问题
        const codeBlockWrappers = Array.from(container.querySelectorAll('.code-block-wrapper'));
        codeBlockWrappers.forEach((wrapper) => {
            const codeEl = wrapper.querySelector('code');
            if (codeEl) {
                // 提取代码内容（保留换行和空格）
                const codeText = codeEl.textContent || '';
                // 创建纯文本节点替换，前后添加换行以保持格式
                const textNode = document.createTextNode('\n' + codeText + '\n');
                wrapper.parentNode?.replaceChild(textNode, wrapper);
            } else {
                wrapper.remove();
            }
        });

        // 2. 移除所有 <pre><code> 代码块（包括 Obsidian 渲染的缩进代码块）
        // 注意：先查找所有 pre 元素，因为替换会改变 DOM 结构
        const preElements = Array.from(container.querySelectorAll('pre'));
        preElements.forEach((pre) => {
            // 跳过已经被包装器包裹的 pre（应该已经被步骤1处理）
            if (pre.closest('.code-block-wrapper')) {
                return;
            }

            const codeEl = pre.querySelector('code');
            if (codeEl) {
                // 提取代码内容（保留换行和空格）
                const codeText = codeEl.textContent || '';
                // 创建纯文本节点替换，前后添加换行以保持格式
                const textNode = document.createTextNode('\n' + codeText + '\n');
                pre.parentNode?.replaceChild(textNode, pre);
            } else {
                // 如果没有 code 元素，直接提取 pre 的文本
                const preText = pre.textContent || '';
                const textNode = document.createTextNode('\n' + preText + '\n');
                pre.parentNode?.replaceChild(textNode, pre);
            }
        });

        // 3. 移除行内代码标记（<code> 元素，但不是代码块中的）
        // 注意：此时 pre 中的 code 应该已经被移除，所以这里只处理行内代码
        const inlineCodeElements = Array.from(container.querySelectorAll('code'));
        inlineCodeElements.forEach((codeEl) => {
            // 跳过已经被移除的代码块中的 code
            if (codeEl.closest('pre') || codeEl.closest('.code-block-wrapper')) {
                return;
            }
            const codeText = codeEl.textContent || '';
            const textNode = document.createTextNode(codeText);
            codeEl.parentNode?.replaceChild(textNode, codeEl);
        });
    }
    /**
     * 转义 Markdown 中的代码块标记，使其不被渲染为代码块
     * 保留代码块的原始文本内容，但以纯文本形式显示
     * 用于思考内容的渲染，避免显示代码相关部分
     */
    private escapeCodeBlocksInMarkdown(markdown: string): string {
        if (!markdown) return markdown;

        let result = '';
        let i = 0;

        // 手动遍历字符串，转义代码块标记
        while (i < markdown.length) {
            // 检查是否是三个反引号（代码块标记）
            if (i + 2 < markdown.length && 
                markdown[i] === '`' && 
                markdown[i + 1] === '`' && 
                markdown[i + 2] === '`' &&
                (i === 0 || markdown[i - 1] !== '\\')) {
                // 转义三个反引号
                result += '\\`\\`\\`';
                i += 3;
            }
            // 检查是否是单个反引号（行内代码标记）
            else if (markdown[i] === '`' && (i === 0 || markdown[i - 1] !== '\\')) {
                // 转义单个反引号
                result += '\\`';
                i += 1;
            }
            else {
                // 普通字符，直接添加
                result += markdown[i];
                i += 1;
            }
        }

        return result;
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

        // 渲染思考内容的 Markdown（转义代码块标记，保留内容但不渲染为代码块）
        try {
            // 转义代码块标记后再渲染
            const processedThinking = this.escapeCodeBlocksInMarkdown(thinking);
            await MarkdownRenderer.render(this.app, processedThinking, content, '', this);
            // 渲染后移除所有代码块元素（包括 Obsidian 可能渲染的缩进代码块）
            this.removeCodeBlocksFromThinkingPanel(content);
        } catch (e) {
            console.error('思考内容 Markdown 渲染失败:', e);
            // 降级为纯文本显示
            const processedThinking = this.escapeCodeBlocksInMarkdown(thinking);
            content.setText(processedThinking);
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
        const codeBlocks = container.querySelectorAll('pre:not(.code-block-wrapper pre)');

        codeBlocks.forEach((pre) => {
            // 跳过已经被包裹的代码块
            if (pre.parentElement?.classList.contains('code-block-wrapper')) {
                return;
            }

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
            const copyBtn = this.createCodeCopyButton(pre as HTMLElement);
            header.appendChild(copyBtn);

            // 组装结构：先插入 wrapper，然后移动 pre 到 wrapper 内部
            const parent = pre.parentElement;
            if (parent) {
                parent.insertBefore(wrapper, pre);
                wrapper.appendChild(header);
                wrapper.appendChild(pre as HTMLElement);
            }
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
        textLabel.textContent = '';
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
                    textLabel.textContent = '';
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
            text: ''
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
                    textLabel.setText('');
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

    /**
     * 预处理不完整的 Markdown 结构（用于流式渲染容错）
     * 主要处理未闭合的代码块，避免 Markdown 解析失败
     * 
     * 注意：这个方法只修改用于渲染的字符串副本，不会修改原始的 answerBuffer
     */
    private preprocessIncompleteMarkdown(markdown: string): string {
        if (!markdown) return markdown;

        let processed = markdown;

        // 1. 检查是否有未闭合的代码块
        // 统计代码块标记（三个反引号）的数量
        const backtickMatches = markdown.match(/```/g);
        const backtickCount = backtickMatches ? backtickMatches.length : 0;

        // 如果代码块标记数量是奇数，说明有未闭合的代码块
        if (backtickCount % 2 === 1) {
            // 找到最后一个代码块开始标记的位置
            const lastBacktickIndex = markdown.lastIndexOf('```');

            if (lastBacktickIndex !== -1) {
                // 检查后面是否有闭合标记
                const afterLastBacktick = markdown.substring(lastBacktickIndex + 3);

                // 如果后面没有闭合标记，临时添加一个（仅用于渲染）
                if (!afterLastBacktick.includes('```')) {
                    // 确保代码块内容后面有换行，然后添加闭合标记
                    const needsNewline = !processed.endsWith('\n') && !processed.endsWith('\r\n');
                    processed = markdown + (needsNewline ? '\n' : '') + '```';
                }
            }
        }

        // 2. 修复代码块标记格式：确保代码块标记前后有适当的换行
        // 这有助于 Markdown 解析器正确识别代码块
        // 代码块开始标记：确保前面有换行（除非在行首或已经是换行符）
        // 只匹配代码块前不是换行符的情况，避免破坏代码块结构
        processed = processed.replace(/([^\n\r])```/g, '$1\n```');

        // 3. 清理多余的空行（避免影响渲染，但保留必要的空行）
        processed = processed.replace(/\n{4,}/g, '\n\n\n');

        return processed;
    }

    // ============================================================
    // 自动生成会话主题名称
    // ============================================================
    
    /**
     * 自动生成会话主题名称
     * 仅在第一次提问且会话名称为默认格式时触发
     * @param userQuestion 用户第一次提问的内容
     * @param aiAnswer AI回答的内容（用于更好地理解主题）
     */
    private async autoGenerateSessionTitle(userQuestion: string, aiAnswer: string): Promise<void> {
        try {
            const currentSession = this.sessionManager.getCurrentSession();
            if (!currentSession) return;

            // 检查会话名称是否为默认格式（"新会话 + 时间"）
            const isDefaultName = /^新会话 \d{2}-\d{2} \d{2}:\d{2}$/.test(currentSession.sessionName);
            
            // 检查是否是第一次提问（只有2条消息：1条用户消息 + 1条AI消息）
            const isFirstQuestion = currentSession.messages.length === 2;

            if (!isDefaultName || !isFirstQuestion) {
                return; // 不是默认名称或不是第一次提问，不处理
            }

            // 调用后端API生成主题名称
            const generatedTitle = await this.generateSessionTitleFromBackend(userQuestion, aiAnswer);
            
            if (generatedTitle && generatedTitle.trim()) {
                // 验证并更新会话名称
                const validation = this.sessionManager.validateSessionName(generatedTitle);
                if (validation.valid) {
                    await this.sessionManager.renameSession(currentSession.sessionId, generatedTitle.trim());
                    console.log('会话主题已自动生成:', generatedTitle);
                } else {
                    console.warn('生成的主题名称无效，使用默认名称');
                }
            }
        } catch (e) {
            console.error('自动生成会话主题失败:', e);
            // 静默失败，不影响正常使用
        }
    }

    /**
     * 调用后端API生成会话主题名称
     * 使用 chat 接口，传入构建好的 prompt
     * @param userQuestion 用户问题
     * @param aiAnswer AI回答
     * @returns 生成的主题名称
     */
    private async generateSessionTitleFromBackend(userQuestion: string, aiAnswer: string): Promise<string | null> {
        try {
            const backendUrl = this.plugin.settings.javaBackendUrl.replace(/\/$/, '');
            const chatUrl = `${backendUrl}/api/rag/chat`;

            // 使用高级设置中的标题生成配置，如果没有配置则使用 LLM 配置
            const providerCode = this.plugin.settings.titleGenerationProvider || this.plugin.settings.selectedLlmProvider;
            const apiKey = this.plugin.settings.titleGenerationApiKey || this.plugin.settings.llmApiKey;
            const modelName = this.plugin.settings.titleGenerationModelName || this.plugin.settings.llmModelName;

            // 如果 API Key 为空，无法生成标题
            if (!apiKey || !apiKey.trim()) {
                console.debug('标题生成 API Key 未配置，跳过自动生成');
                return null;
            }

            // 构建提示词：要求生成简洁的主题名称
            const prompt = `请根据以下对话内容，生成一个简洁的会话主题名称（不超过20个字符，不要包含"新会话"、"关于"等前缀词，直接给出核心主题）：

用户问题：${userQuestion}

AI回答：${aiAnswer.substring(0, 200)}${aiAnswer.length > 200 ? '...' : ''}

请只返回主题名称，不要包含任何其他说明文字。`;

            // 调用 chat 接口（非流式）
            const response = await fetch(chatUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKey
                },
                body: JSON.stringify({
                    question: prompt,
                    provider: providerCode,
                    model: modelName,
                    history: [] // 空历史，只生成标题
                })
            });

            if (!response.ok) {
                console.warn('生成主题名称API调用失败:', response.status);
                return null;
            }

            const data = await response.json();
            const title = this.extractTitleFromResponse(data);

            return title;
        } catch (e) {
            console.error('调用后端API生成主题名称失败:', e);
            return null;
        }
    }

    /**
     * 从后端响应中提取标题
     * @param data 后端响应数据（RagResponse 结构）
     * @returns 提取的标题，如果提取失败返回null
     */
    private extractTitleFromResponse(data: any): string | null {
        try {
            let title: string | null = null;
            
            // 调试：打印完整响应结构
            console.debug('标题生成响应数据:', JSON.stringify(data, null, 2));
            
            if (typeof data === 'string') {
                title = data.trim();
            } else if (data && typeof data === 'object') {
                // RagResponse 结构：优先从 data 字段提取
                if (data.data !== undefined) {
                    // 如果 data 是字符串，直接使用
                    if (typeof data.data === 'string') {
                        title = data.data.trim();
                    }
                    // 如果 data 是对象，尝试提取 answer 或 content
                    else if (typeof data.data === 'object' && data.data !== null) {
                        title = data.data.answer || data.data.content || data.data.text || null;
                        if (title) {
                            title = String(title).trim();
                        }
                    }
                }
                
                // 如果 data 字段没有内容，尝试从其他常见字段提取（但排除 message，因为它可能是状态消息）
                if (!title) {
                    title = data.title || data.content || data.text || data.answer || null;
                    if (title) {
                        title = String(title).trim();
                    }
                }
            }

            // 清理标题：移除可能的引号、多余空格、换行等
            if (title) {
                // 过滤掉常见的状态消息（如 "Success", "OK" 等）
                const statusMessages = ['success', 'ok', 'successful', '完成', '成功'];
                if (statusMessages.some(msg => title!.toLowerCase() === msg.toLowerCase())) {
                    console.warn('提取到状态消息而非标题，跳过:', title);
                    return null;
                }
                
                title = title
                    .replace(/^["']|["']$/g, '') // 移除首尾引号
                    .replace(/\n+/g, ' ') // 将换行符替换为空格
                    .replace(/\s+/g, ' ') // 合并多个空格
                    .trim();
                
                // 限制长度（会话名称最大50字符，但主题名称建议不超过20字符）
                if (title.length > 50) {
                    title = title.substring(0, 47) + '...';
                }
            }

            return title || null;
        } catch (e) {
            console.error('提取标题失败:', e);
            return null;
        }
    }
}

// 提示词选择弹窗：列出 prompts 目录下的 md 文件
class PromptSuggestionModal extends SuggestModal<TFile> {
    private promptFiles: TFile[];
    private onChooseCallback: (file: TFile) => void;

    constructor(app: App, promptFiles: TFile[], onChoose: (file: TFile) => void) {
        super(app);
        this.promptFiles = promptFiles;
        this.onChooseCallback = onChoose;
        this.setPlaceholder('选择提示词文件');
    }

    getSuggestions(query: string): TFile[] {
        const lowerQuery = query.toLowerCase();
        return this.promptFiles
            .filter(file => file.basename.toLowerCase().includes(lowerQuery))
            .sort((a, b) => a.basename.localeCompare(b.basename));
    }

    renderSuggestion(file: TFile, el: HTMLElement) {
        el.createEl('div', { cls: 'prompt-suggest-title', text: file.basename });
        el.createEl('div', { cls: 'prompt-suggest-path', text: file.path });
    }

    onChooseSuggestion(file: TFile) {
        this.onChooseCallback(file);
    }
}