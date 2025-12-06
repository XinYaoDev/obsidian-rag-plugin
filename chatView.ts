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
    
    // 输入历史管理（最近5条）
    private inputHistory: string[] = [];
    private inputHistoryIndex: number = -1; // 当前浏览的历史索引，-1 表示不在浏览历史
    private currentInputBeforeHistory: string = ''; // 浏览历史前的输入内容

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

        // 回收站按钮（替换原来的删除当前会话按钮）
        const trashBtn = sessionActions.createEl('button', {
            cls: 'session-action-btn',
            attr: { 'aria-label': '回收站' }
        });
        setIcon(trashBtn, 'archive'); // 使用 archive 图标，表示归档/存储

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
                    await this.deleteSessionWithConfirm(session.sessionId, container, messageHistory, () => {
                        // 刷新会话列表，保持下拉菜单打开
                        if (dropdownEl) {
                            refreshSessionList();
                        }
                    });
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

        // 回收站按钮事件
        trashBtn.addEventListener('click', async () => {
            await this.showTrashDialog(container, messageHistory, refreshSessionList);
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

            // 2. 处理上下键浏览输入历史
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                // 如果输入框有内容且不在历史浏览模式，保存当前输入
                if (this.inputHistoryIndex === -1 && inputEl.value.trim()) {
                    this.currentInputBeforeHistory = inputEl.value;
                }
                
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateInputHistory(inputEl, 'up');
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateInputHistory(inputEl, 'down');
                }
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
            await this.appendMessage(messageHistory, msg.content, displayType);
        }
        messageHistory.scrollTo({ top: messageHistory.scrollHeight });

        // ============================================================
        // 4. 发送逻辑 - 流式响应版本
        // ============================================================
        const sendMessage = async () => {
            const content = inputEl.value.trim();
            if (!content) return;

            // 保存用户输入，用于失败撤回和终止恢复
            this.lastUserInput = content;
            
            // 添加到输入历史（最多保留5条）
            this.addToInputHistory(content);

            // ⚠️ 切换按钮为终止按钮
            sendBtn.empty();
            setIcon(sendBtn, 'square'); // 使用正方形图标作为终止按钮
            sendBtn.setAttribute('aria-label', '终止');
            sendBtn.removeClass('chat-send-btn');
            sendBtn.addClass('chat-stop-btn');
            sendBtn.style.borderRadius = '8px'; // 正方形样式
            sendBtn.style.backgroundColor = '#dc3545'; // 明确的红色背景
            sendBtn.style.color = '#ffffff'; // 白色文字
            sendBtn.disabled = false; // 终止按钮应该可点击
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';

            inputEl.value = '';
            inputEl.style.height = 'auto';

            // 显示并保存用户问题
            this.lastUserMessageElement = await this.appendMessage(messageHistory, content, 'user');
            this.sessionManager.addMessage({ role: 'user', content: content });
            await this.sessionManager.saveSession(this.sessionManager.getCurrentSession()!);

            // 创建 AI 消息占位符（不使用 loading 状态，直接创建空结构）
            const msgWrapper = messageHistory.createEl('div', {
                cls: 'chat-message-wrapper ai'
            });
            const msgBubble = msgWrapper.createEl('div', {
                cls: 'chat-message-bubble ai'
            });

            // 准备流式更新的状态
            let thinkingBuffer = '';
            let answerBuffer = '';
            let thinkingPanel: HTMLElement | null = null;
            let thinkingContent: HTMLElement | null = null;
            let answerContainer: HTMLElement | null = null;
            let isStreaming = true;

            // 渲染节流控制
            let renderTimer: NodeJS.Timeout | null = null;
            let thinkingRenderTimer: NodeJS.Timeout | null = null;
            const RENDER_THROTTLE_MS = 150;

            // 创建思考面板（如果启用深度思考）
            let isExpanded = true; // 用于跟踪折叠状态
            let iconContainer: HTMLElement | null = null; // 用于自动折叠时更新图标
            if (this.plugin.settings.enableDeepThinking) {
                thinkingPanel = msgBubble.createEl('div', { cls: 'thinking-panel' });
                const header = thinkingPanel.createEl('div', { cls: 'thinking-panel__header' });
                iconContainer = header.createEl('span', { cls: 'thinking-panel__icon' });
                setIcon(iconContainer, 'chevron-down'); // 默认展开状态
                header.createEl('span', { cls: 'thinking-panel__title', text: '思考过程' });
                thinkingContent = thinkingPanel.createEl('div', {
                    cls: 'thinking-panel__content thinking-panel__content--expanded'
                });
                thinkingPanel.addClass('thinking-panel--active');

                // 绑定折叠/展开功能
                header.addEventListener('click', () => {
                    isExpanded = !isExpanded;

                    if (isExpanded) {
                        thinkingContent!.removeClass('thinking-panel__content--collapsed');
                        thinkingContent!.addClass('thinking-panel__content--expanded');
                        iconContainer!.empty();
                        setIcon(iconContainer!, 'chevron-down');
                    } else {
                        thinkingContent!.removeClass('thinking-panel__content--expanded');
                        thinkingContent!.addClass('thinking-panel__content--collapsed');
                        iconContainer!.empty();
                        setIcon(iconContainer!, 'chevron-right');
                    }
                });
            }

            // 创建折叠思考面板的函数（当开始回答时自动调用）
            const collapseThinkingPanel = () => {
                if (thinkingPanel && thinkingContent && iconContainer && isExpanded) {
                    isExpanded = false;
                    thinkingContent.removeClass('thinking-panel__content--expanded');
                    thinkingContent.addClass('thinking-panel__content--collapsed');
                    iconContainer.empty();
                    setIcon(iconContainer, 'chevron-right');
                }
            };

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

                // 节流更新思考内容（纯文本显示，不渲染 Markdown）
                if (thinkingRenderTimer) {
                    clearTimeout(thinkingRenderTimer);
                }

                thinkingRenderTimer = setTimeout(() => {
                    // 保留换行和空格，但不渲染 Markdown 语法
                    this.renderPlainTextWithLineBreaks(thinkingContent!, thinkingBuffer);

                    // 滚动到底部
                    messageHistory.scrollTo({ top: messageHistory.scrollHeight, behavior: 'smooth' });

                    thinkingRenderTimer = null;
                }, 50); // ⚠️ 优化：纯文本更新，节流时间可以更短，提升更新速度
            };

            const backendUrl = this.plugin.settings.javaBackendUrl.replace(/\/$/, '');
            const chatUrl = `${backendUrl}/api/rag/chat/stream`;

            const providerCode = this.plugin.settings.selectedLlmProvider;
            const apiKey = this.plugin.settings.llmApiKey;
            const modelName = this.plugin.settings.llmModelName;

            try {
                // 移除初始 loading 图标
                if (answerContainer) {
                    const loadingIndicator = answerContainer.querySelector('.loading-indicator');
                    if (loadingIndicator) {
                        loadingIndicator.remove();
                    }
                }

                // ⚠️ 使用对象引用，确保 handleStop 可以访问到更新后的 abortController
                const abortControllerRef: { controller: AbortController | null } = { controller: null };

                // ⚠️ 终止功能：中止请求并清理UI
                const handleStop = async () => {
                    console.log('终止按钮被点击', { 
                        controller: abortControllerRef.controller, 
                        isStreaming,
                        aborted: abortControllerRef.controller?.signal.aborted 
                    });
                    
                    // 先设置 isStreaming = false，防止继续处理数据
                    if (!isStreaming) {
                        console.log('流式请求已结束，无需终止');
                        return;
                    }
                    
                    isStreaming = false;
                    
                    // 如果有 controller，中止请求
                    if (abortControllerRef.controller) {
                        console.log('执行终止操作，中止请求');
                        abortControllerRef.controller.abort();
                    } else {
                        console.log('AbortController 尚未创建，但已设置 isStreaming = false');
                    }
                    
                    // 清除所有定时器
                    if (renderTimer) {
                        clearTimeout(renderTimer);
                        renderTimer = null;
                    }
                    if (thinkingRenderTimer) {
                        clearTimeout(thinkingRenderTimer);
                        thinkingRenderTimer = null;
                    }
                    
                    // 删除用户消息和AI消息
                    if (this.lastUserMessageElement) {
                        this.lastUserMessageElement.remove();
                        this.lastUserMessageElement = null;
                    }
                    if (msgWrapper) {
                        msgWrapper.remove();
                    }
                    
                    // 恢复输入框内容
                    if (this.lastUserInput) {
                        inputEl.value = this.lastUserInput;
                        inputEl.style.height = 'auto';
                    }
                    
                    // 恢复发送按钮
                    sendBtn.empty();
                    setIcon(sendBtn, 'send');
                    sendBtn.setAttribute('aria-label', '发送');
                    sendBtn.removeClass('chat-stop-btn');
                    sendBtn.addClass('chat-send-btn');
                    sendBtn.style.borderRadius = '50%'; // 恢复圆形
                    sendBtn.style.backgroundColor = ''; // 清除内联样式
                    sendBtn.style.color = ''; // 清除文字颜色
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = '1';
                    sendBtn.style.cursor = 'pointer';
                    
                    // ⚠️ 重要：重新绑定发送按钮的点击事件
                    sendBtn.onclick = sendMessage;
                };

                // 绑定终止按钮点击事件
                sendBtn.onclick = handleStop;

                // 发起流式请求
                abortControllerRef.controller = await this.streamChat(
                    chatUrl,
                    {
                        question: content,
                        provider: providerCode,
                        model: modelName,
                        history: this.sessionManager.getMessages(),
                        enableDeepThinking: this.plugin.settings.enableDeepThinking
                    },
                    apiKey,
                    // onThinking 回调
                    (thinkingData: string) => {
                        updateThinking(thinkingData);
                    },
                    // onAnswer 回调
                    (answerData: string) => {
                        // ⚠️ 第一次收到回答数据时，自动折叠思考面板
                        if (answerBuffer.length === 0 && answerData) {
                            collapseThinkingPanel();
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
                        if (renderTimer) {
                            clearTimeout(renderTimer);
                            renderTimer = null;
                        }
                        if (thinkingRenderTimer) {
                            clearTimeout(thinkingRenderTimer);
                            thinkingRenderTimer = null;
                        }

                        // 如果是用户主动终止，不显示错误消息
                        if (error.message === '请求已中止') {
                            // 终止逻辑已在 handleStop 中处理，这里只需要恢复按钮
                            sendBtn.empty();
                            setIcon(sendBtn, 'send');
                            sendBtn.setAttribute('aria-label', '发送');
                            sendBtn.removeClass('chat-stop-btn');
                            sendBtn.addClass('chat-send-btn');
                            sendBtn.style.borderRadius = '50%';
                            sendBtn.style.backgroundColor = ''; // 清除内联样式
                            sendBtn.style.color = ''; // 清除文字颜色
                            sendBtn.disabled = false;
                            sendBtn.style.opacity = '1';
                            sendBtn.style.cursor = 'pointer';
                            // ⚠️ 重要：重新绑定发送按钮的点击事件
                            sendBtn.onclick = sendMessage;
                            return;
                        }

                        // 其他错误：移除当前消息气泡并显示错误
                        msgWrapper.remove();
                        await this.appendMessage(messageHistory, `❌ ${error.message}`, 'ai', false, true);

                        // 执行撤回
                        await this.rollbackFailedMessage(inputEl);

                        // 恢复发送按钮
                        sendBtn.empty();
                        setIcon(sendBtn, 'send');
                        sendBtn.setAttribute('aria-label', '发送');
                        sendBtn.removeClass('chat-stop-btn');
                        sendBtn.addClass('chat-send-btn');
                        sendBtn.style.borderRadius = '50%';
                        sendBtn.style.backgroundColor = ''; // 清除内联样式
                        sendBtn.style.color = ''; // 清除文字颜色
                        sendBtn.disabled = false;
                        sendBtn.style.opacity = '1';
                        sendBtn.style.cursor = 'pointer';
                        // ⚠️ 重要：重新绑定发送按钮的点击事件
                        sendBtn.onclick = sendMessage;
                    },
                    // onComplete 回调
                    async () => {
                        isStreaming = false;

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

                        // 最终渲染思考内容（如果有）- 保留换行和空格，但不渲染 Markdown
                        if (thinkingContent && thinkingBuffer) {
                            this.renderPlainTextWithLineBreaks(thinkingContent, thinkingBuffer);
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

                        // 保存到会话历史（仅保存 answer，不保存 thinking）
                        if (answerBuffer) {
                            this.sessionManager.addMessage({ role: 'assistant', content: answerBuffer });
                            await this.sessionManager.saveSession(this.sessionManager.getCurrentSession()!);
                        }

                        // 成功后清空撤回状态
                        this.lastUserInput = null;
                        this.lastUserMessageElement = null;

                        // 恢复发送按钮
                        sendBtn.empty();
                        setIcon(sendBtn, 'send');
                        sendBtn.setAttribute('aria-label', '发送');
                        sendBtn.removeClass('chat-stop-btn');
                        sendBtn.addClass('chat-send-btn');
                        sendBtn.style.borderRadius = '50%';
                        sendBtn.style.backgroundColor = ''; // 清除内联样式
                        sendBtn.style.color = ''; // 清除文字颜色
                        sendBtn.disabled = false;
                        sendBtn.style.opacity = '1';
                        sendBtn.style.cursor = 'pointer';
                        // ⚠️ 重要：重新绑定发送按钮的点击事件
                        sendBtn.onclick = sendMessage;
                    }
                );

            } catch (e: any) {
                // 连接失败 - 执行撤回
                isStreaming = false;
                msgWrapper.remove();
                await this.appendMessage(messageHistory, `🔌 无法连接后端: ${e.message}`, 'ai', false, true);
                await this.rollbackFailedMessage(inputEl);

                // 恢复发送按钮
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
                sendBtn.style.cursor = 'pointer';
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

    // 删除会话（移到回收站，无需确认）
    private async deleteSessionWithConfirm(
        sessionId: string, 
        container: Element, 
        messageHistory: HTMLElement,
        onDeleted?: () => void
    ) {
        const session = this.sessionManager.getAllSessions().find(s => s.sessionId === sessionId);
        if (!session) {
            new Notice('会话不存在');
            return;
        }

        try {
            const wasCurrentSession = sessionId === this.sessionManager.getCurrentSessionId();
            const success = await this.sessionManager.deleteSession(sessionId);
            
            if (!success) {
                new Notice('删除会话失败：操作未完成');
                return;
            }

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

            // 调用回调函数刷新会话列表
            if (onDeleted) {
                onDeleted();
            }
        } catch (e) {
            console.error('删除会话失败:', e);
            const errorMessage = e instanceof Error ? e.message : '未知错误';
            new Notice(`删除会话失败: ${errorMessage}`);
        }
    }

    // 显示回收站对话框
    private async showTrashDialog(
        container: Element, 
        messageHistory: HTMLElement,
        refreshSessionList: () => void
    ) {
        const trashItems = await this.sessionManager.getTrashItems();
        
        if (trashItems.length === 0) {
            new Notice('回收站为空');
            return;
        }

        // 创建模态对话框
        const modal = document.createElement('div');
        modal.className = 'trash-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialog = document.createElement('div');
        dialog.className = 'trash-dialog';
        dialog.style.cssText = `
            background: var(--background-primary);
            border-radius: 8px;
            padding: 20px;
            max-width: 500px;
            width: 90%;
            max-height: 70vh;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        const title = document.createElement('h3');
        title.textContent = `回收站 (${trashItems.length} 个会话)`;
        title.style.cssText = 'margin: 0 0 16px 0; font-size: 1.2em;';
        dialog.appendChild(title);

        const list = document.createElement('div');
        list.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;';

        for (const item of trashItems) {
            const itemEl = document.createElement('div');
            itemEl.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                background: var(--background-secondary);
                border-radius: 6px;
            `;

            const info = document.createElement('div');
            info.style.cssText = 'flex: 1;';
            const name = document.createElement('div');
            name.textContent = item.sessionName;
            name.style.cssText = 'font-weight: 500; margin-bottom: 4px;';
            const time = document.createElement('div');
            const deletedDate = new Date(item.deletedAt);
            const daysAgo = Math.floor((Date.now() - item.deletedAt) / (1000 * 60 * 60 * 24));
            time.textContent = `删除于 ${deletedDate.toLocaleDateString()} ${deletedDate.toLocaleTimeString()} (${daysAgo} 天前)`;
            time.style.cssText = 'font-size: 0.85em; color: var(--text-muted);';
            info.appendChild(name);
            info.appendChild(time);

            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; gap: 8px;';

            const restoreBtn = document.createElement('button');
            restoreBtn.textContent = '恢复';
            restoreBtn.style.cssText = `
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                cursor: pointer;
                font-size: 0.9em;
            `;
            restoreBtn.addEventListener('click', async () => {
                const success = await this.sessionManager.restoreFromTrash(item.sessionId);
                if (success) {
                    new Notice('会话已恢复');
                    modal.remove();
                    refreshSessionList();
                } else {
                    new Notice('恢复失败');
                }
            });

            actions.appendChild(restoreBtn);
            itemEl.appendChild(info);
            itemEl.appendChild(actions);
            list.appendChild(itemEl);
        }

        dialog.appendChild(list);

        // 清空回收站按钮
        const clearBtn = document.createElement('button');
        clearBtn.textContent = '清空回收站';
        clearBtn.style.cssText = `
            width: 100%;
            padding: 10px;
            border: none;
            border-radius: 4px;
            background: var(--background-modifier-error);
            color: var(--text-on-accent);
            cursor: pointer;
            font-weight: 500;
        `;
        clearBtn.addEventListener('click', async () => {
            const confirmed = confirm(`确定要清空回收站吗？这将永久删除 ${trashItems.length} 个会话，此操作不可恢复。`);
            if (confirmed) {
                try {
                    const success = await this.sessionManager.clearAllTrash();
                    if (success) {
                        new Notice('回收站已清空');
                        modal.remove();
                        refreshSessionList();
                    } else {
                        new Notice('清空回收站失败');
                    }
                } catch (e) {
                    console.error('清空回收站失败:', e);
                    new Notice('清空回收站失败');
                }
            }
        });

        dialog.appendChild(clearBtn);
        modal.appendChild(dialog);

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        document.body.appendChild(modal);
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
    // 流式请求核心函数
    // ============================================================

    /**
     * 流式聊天请求函数
     * 使用 fetch + ReadableStream 处理 SSE 流
     * @returns AbortController，用于中止请求
     */
    private async streamChat(
        url: string,
        requestBody: any,
        apiKey: string,
        onThinking: (data: string) => void,
        onAnswer: (data: string) => void,
        onError: (error: Error) => void,
        onComplete: () => void
    ): Promise<AbortController> {
        let buffer = '';
        let abortController: AbortController | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        try {
            abortController = new AbortController();

            // 设置超时（60秒）
            timeoutId = setTimeout(() => {
                abortController?.abort();
                onError(new Error('请求超时，请检查网络连接后重试'));
            }, 60000);

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
                    // ⚠️ 检查是否已中止
                    if (abortController.signal.aborted) {
                        console.log('检测到请求已中止，停止读取');
                        // 取消读取并关闭 reader
                        reader.cancel();
                        break;
                    }

                    const { done, value } = await reader.read();

                    if (done) {
                        // 流结束，处理剩余缓冲区
                        if (buffer.trim()) {
                            this.processSSEBuffer(buffer, onThinking, onAnswer);
                        }
                        break;
                    }

                    // ⚠️ 再次检查是否已中止（在读取数据后）
                    if (abortController.signal.aborted) {
                        console.log('读取数据后检测到请求已中止，停止处理');
                        reader.cancel();
                        break;
                    }

                    // 解码数据块
                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    // 按 \n\n 分割事件块
                    const parts = buffer.split('\n\n');

                    // 保留最后一个可能不完整的部分
                    buffer = parts.pop() || '';

                    // 处理完整的事件块（只有在未中止时才处理）
                    if (!abortController.signal.aborted) {
                        for (const part of parts) {
                            if (part.trim()) {
                                this.processSSEBuffer(part, onThinking, onAnswer);
                            }
                        }
                    }
                }

                // 清除超时定时器
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }

                // ⚠️ 只有在未中止时才调用 onComplete
                if (!abortController.signal.aborted) {
                    onComplete();
                } else {
                    console.log('请求已中止，不调用 onComplete');
                }

                // 返回 abortController
                return abortController!;

            } catch (readError: any) {
                if (readError.name === 'AbortError' || abortController.signal.aborted) {
                    console.log('读取过程中检测到中止，不抛出错误');
                    // 不抛出错误，直接返回
                    return abortController!;
                }
                throw readError;
            } finally {
                // 确保释放 reader
                try {
                    reader.releaseLock();
                } catch (e) {
                    // 忽略释放锁时的错误
                    console.log('释放 reader 锁时出错（可能已释放）', e);
                }
            }

        } catch (error: any) {
            // 清除超时定时器
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (error.name === 'AbortError') {
                onError(new Error('请求已中止'));
            } else if (error.message) {
                onError(error);
            } else {
                onError(new Error(`网络错误: ${error.message || '未知错误'}`));
            }

            // 即使出错也要返回 abortController
            return abortController || new AbortController();
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

        // 渲染思考内容 - 保留换行和空格，但不渲染 Markdown
        this.renderPlainTextWithLineBreaks(content, thinking);

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

    /**
     * 渲染纯文本内容，保留换行和空格，但不渲染 Markdown 语法
     * 用于深度思考面板的显示
     */
    private renderPlainTextWithLineBreaks(container: HTMLElement, text: string): void {
        // 转义 HTML 特殊字符，防止 XSS
        const escapeHtml = (str: string): string => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };

        // 移除 Markdown 语法标记（但保留换行和空格）
        let processed = text
            // 移除代码块标记
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]+`/g, '')
            // 移除加粗标记
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            // 移除斜体标记
            .replace(/_([^_]+)_/g, '$1')
            // 移除链接标记
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
            // 移除标题标记
            .replace(/^#{1,6}\s+/gm, '')
            // 移除列表标记
            .replace(/^[\s]*[-*+]\s+/gm, '')
            .replace(/^[\s]*\d+\.\s+/gm, '');

        // 转义 HTML 并保留换行
        const escaped = escapeHtml(processed);
        
        // 设置样式以保留换行和空格
        container.style.whiteSpace = 'pre-wrap';
        container.style.wordBreak = 'break-word';
        
        // 使用 innerHTML 保留换行（已转义，安全）
        container.innerHTML = escaped;
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

        codeBlocks.forEach((preEl) => {
            const pre = preEl as HTMLElement;
            
            // 检查是否已经被包装过（避免重复包装）
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
                    console.debug('提取到语言标识:', rawLang, '->', language);
                    
                    // 清理代码块第一行可能存在的语言标识文本
                    // 如果第一行只包含语言标识（可能是预处理导致的），移除它
                    const codeText = codeEl.textContent || '';
                    const firstLine = codeText.split('\n')[0].trim();
                    if (firstLine === rawLang || firstLine.toLowerCase() === rawLang.toLowerCase()) {
                        // 移除第一行
                        const lines = codeText.split('\n');
                        if (lines.length > 1) {
                            codeEl.textContent = lines.slice(1).join('\n');
                        } else {
                            codeEl.textContent = '';
                        }
                        console.debug('已清理代码块第一行的语言标识文本');
                    }
                } else {
                    console.debug('未找到语言类名，codeEl.classList:', classList);
                }
            } else {
                console.debug('未找到 code 元素');
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
            if (pre.parentElement) {
                pre.parentElement.insertBefore(wrapper, pre);
            }
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

    /**
     * 预处理不完整的 Markdown 结构（用于流式渲染容错）
     * 主要处理未闭合的代码块，避免 Markdown 解析失败
     * 
     * 注意：这个方法只修改用于渲染的字符串副本，不会修改原始的 answerBuffer
     * 尽量少修改，避免破坏已正确格式化的代码块
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

        // 2. 只在必要时修复代码块标记格式
        // 避免过度修改已正确格式化的代码块
        // 只在代码块标记紧邻非换行字符时才添加换行（避免破坏格式）
        // 注意：这个正则只匹配紧邻非换行字符的情况，不会影响已经正确格式化的代码块
        processed = processed.replace(/([^\n\r])```([a-zA-Z0-9+\-._]*\n)/g, '$1\n```$2');
        processed = processed.replace(/([^\n\r])```([a-zA-Z0-9+\-._]*$)/gm, '$1\n```$2');

        return processed;
    }

    /**
     * 添加到输入历史（最多保留5条）
     */
    private addToInputHistory(content: string): void {
        // 如果与最后一条历史相同，不重复添加
        if (this.inputHistory.length > 0 && this.inputHistory[0] === content) {
            return;
        }
        
        // 添加到数组开头
        this.inputHistory.unshift(content);
        
        // 只保留最近5条
        if (this.inputHistory.length > 5) {
            this.inputHistory = this.inputHistory.slice(0, 5);
        }
        
        // 重置历史索引
        this.inputHistoryIndex = -1;
        this.currentInputBeforeHistory = '';
    }

    /**
     * 浏览输入历史
     */
    private navigateInputHistory(inputEl: HTMLTextAreaElement, direction: 'up' | 'down'): void {
        if (this.inputHistory.length === 0) {
            return;
        }

        if (direction === 'up') {
            // 向上浏览（更早的历史）
            if (this.inputHistoryIndex < this.inputHistory.length - 1) {
                this.inputHistoryIndex++;
                inputEl.value = this.inputHistory[this.inputHistoryIndex];
                // 将光标移到末尾
                setTimeout(() => {
                    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                }, 0);
            }
        } else {
            // 向下浏览（更新的历史）
            if (this.inputHistoryIndex > 0) {
                this.inputHistoryIndex--;
                inputEl.value = this.inputHistory[this.inputHistoryIndex];
                // 将光标移到末尾
                setTimeout(() => {
                    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                }, 0);
            } else if (this.inputHistoryIndex === 0) {
                // 回到浏览历史前的输入内容
                this.inputHistoryIndex = -1;
                inputEl.value = this.currentInputBeforeHistory;
                // 将光标移到末尾
                setTimeout(() => {
                    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                }, 0);
            }
        }
    }
}