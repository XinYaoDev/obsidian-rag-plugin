// sessionManager.ts - 会话管理器
import { App, TFile, Notice } from 'obsidian';

// 会话消息接口
export interface SessionMessage {
    role: 'user' | 'assistant';
    content: string;
}

// 会话元数据接口
export interface SessionMetadata {
    sessionId: string;
    sessionName: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
}

// 完整会话接口
export interface Session {
    sessionId: string;
    sessionName: string;
    createdAt: number;
    updatedAt: number;
    messages: SessionMessage[];
}

// 会话索引接口
export interface SessionsIndex {
    version: string;
    currentSessionId: string;
    sessions: SessionMetadata[];
}

// 名称验证结果接口
export interface ValidationResult {
    valid: boolean;
    error?: string;
}

// 回收站条目接口
export interface TrashItem {
    sessionId: string;
    sessionName: string;
    deletedAt: number; // 删除时间戳
}

// 回收站索引接口
export interface TrashIndex {
    items: TrashItem[];
}

export class SessionManager {
    private app: App;
    private readonly indexPath = 'Assets/History/sessions_index.json';
    private readonly sessionsDir = 'Assets/History/sessions';
    private readonly oldHistoryPath = 'Assets/History/chat_history.json';
    private readonly trashDir = 'Assets/History/trash';
    private readonly trashIndexPath = 'Assets/History/trash_index.json';
    private readonly TRASH_RETENTION_DAYS = 7; // 回收站保留7天
    
    private sessionsIndex: SessionsIndex | null = null;
    private currentSession: Session | null = null;

    constructor(app: App) {
        this.app = app;
    }

    // ==================== 初始化 ====================
    
    async initialize(): Promise<void> {
        try {
            // 检查是否需要迁移旧数据
            const needMigration = await this.checkNeedMigration();
            if (needMigration) {
                await this.migrateOldHistory();
            }

            // 加载或创建索引
            await this.loadOrCreateIndex();
            
            // 加载当前会话
            if (this.sessionsIndex && this.sessionsIndex.currentSessionId) {
                this.currentSession = await this.loadSession(this.sessionsIndex.currentSessionId);
            }
            
            // ⚠️ 异步清理回收站（不阻塞初始化）
            this.cleanupTrash().catch(e => {
                console.error('清理回收站失败:', e);
            });
        } catch (e) {
            console.error('SessionManager 初始化失败:', e);
            // 创建默认会话作为降级方案
            await this.createDefaultSession();
        }
    }

    // ==================== 索引文件操作 ====================
    
    private async loadOrCreateIndex(): Promise<void> {
        const indexFile = this.app.vault.getAbstractFileByPath(this.indexPath);
        
        if (indexFile instanceof TFile) {
            try {
                const content = await this.app.vault.read(indexFile);
                this.sessionsIndex = JSON.parse(content);
                return;
            } catch (e) {
                console.warn('索引文件损坏，重新创建:', e);
            }
        }
        
        // 创建默认索引
        await this.createDefaultSession();
    }

    async loadSessionsIndex(): Promise<SessionsIndex> {
        if (this.sessionsIndex !== null) {
            const index: SessionsIndex = this.sessionsIndex;
            return index;
        }
        
        const indexFile = this.app.vault.getAbstractFileByPath(this.indexPath);
        if (indexFile instanceof TFile) {
            const content = await this.app.vault.read(indexFile);
            const index: SessionsIndex = JSON.parse(content);
            this.sessionsIndex = index;
            return index;
        }
        
        throw new Error('索引文件不存在');
    }

    async saveSessionsIndex(index: SessionsIndex): Promise<void> {
        this.sessionsIndex = index;
        await this.ensureDirectory(this.indexPath);
        
        const indexFile = this.app.vault.getAbstractFileByPath(this.indexPath);
        const content = JSON.stringify(index, null, 2);
        
        if (indexFile instanceof TFile) {
            await this.app.vault.modify(indexFile, content);
        } else {
            await this.app.vault.create(this.indexPath, content);
        }
    }

    // ==================== 会话文件操作 ====================
    
    async loadSession(sessionId: string): Promise<Session> {
        const sessionPath = `${this.sessionsDir}/${sessionId}.json`;
        const sessionFile = this.app.vault.getAbstractFileByPath(sessionPath);
        
        if (sessionFile instanceof TFile) {
            const content = await this.app.vault.read(sessionFile);
            return JSON.parse(content);
        }
        
        throw new Error(`会话文件不存在: ${sessionId}`);
    }

    async saveSession(session: Session): Promise<void> {
        const sessionPath = `${this.sessionsDir}/${session.sessionId}.json`;
        await this.ensureDirectory(sessionPath);
        
        // 更新时间戳
        session.updatedAt = Date.now();
        
        const sessionFile = this.app.vault.getAbstractFileByPath(sessionPath);
        const content = JSON.stringify(session, null, 2);
        
        if (sessionFile instanceof TFile) {
            await this.app.vault.modify(sessionFile, content);
        } else {
            await this.app.vault.create(sessionPath, content);
        }
        
        // 更新索引中的元数据
        if (this.sessionsIndex) {
            const metadata = this.sessionsIndex.sessions.find(s => s.sessionId === session.sessionId);
            if (metadata) {
                metadata.updatedAt = session.updatedAt;
                metadata.messageCount = session.messages.length;
                await this.saveSessionsIndex(this.sessionsIndex);
            }
        }
    }

    // ==================== 会话管理核心方法 ====================
    
    async createSession(customName?: string): Promise<string> {
        const sessionId = `session_${Date.now()}`;
        const now = Date.now();
        
        // 生成默认名称
        const defaultName = this.generateDefaultSessionName();
        const sessionName = customName || defaultName;
        
        // 创建新会话对象
        const newSession: Session = {
            sessionId,
            sessionName,
            createdAt: now,
            updatedAt: now,
            messages: []
        };
        
        // 保存会话文件
        await this.saveSession(newSession);
        
        // 更新索引
        if (!this.sessionsIndex) {
            this.sessionsIndex = {
                version: '1.0',
                currentSessionId: sessionId,
                sessions: []
            };
        }
        
        this.sessionsIndex.sessions.push({
            sessionId,
            sessionName,
            createdAt: now,
            updatedAt: now,
            messageCount: 0
        });
        
        this.sessionsIndex.currentSessionId = sessionId;
        await this.saveSessionsIndex(this.sessionsIndex);
        
        // 设置为当前会话
        this.currentSession = newSession;
        
        return sessionId;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        try {
            if (!this.sessionsIndex) {
                return false;
            }
            
            // 获取会话信息
            const sessionMetadata = this.sessionsIndex.sessions.find(s => s.sessionId === sessionId);
            if (!sessionMetadata) {
                return false;
            }
            
            // 检查是否是最后一个会话
            if (this.sessionsIndex.sessions.length === 1) {
                // 创建新会话代替被删除的会话
                await this.createSession();
            } else if (this.sessionsIndex.currentSessionId === sessionId) {
                // 如果删除的是当前会话，切换到第一个其他会话
                const otherSession = this.sessionsIndex.sessions.find(s => s.sessionId !== sessionId);
                if (otherSession) {
                    await this.switchSession(otherSession.sessionId);
                }
            }
            
            // ⚠️ 将会话移到回收站而不是直接删除
            const sessionPath = `${this.sessionsDir}/${sessionId}.json`;
            const sessionFile = this.app.vault.getAbstractFileByPath(sessionPath);
            if (sessionFile instanceof TFile) {
                // 确保回收站目录存在
                const trashFolder = this.app.vault.getAbstractFileByPath(this.trashDir);
                if (!trashFolder) {
                    console.log('创建回收站目录:', this.trashDir);
                    await this.app.vault.createFolder(this.trashDir);
                    // 再次检查确保目录已创建
                    const verifyFolder = this.app.vault.getAbstractFileByPath(this.trashDir);
                    if (!verifyFolder) {
                        throw new Error(`无法创建回收站目录: ${this.trashDir}`);
                    }
                    console.log('回收站目录创建成功');
                } else {
                    console.log('回收站目录已存在');
                }
                
                // 移动到回收站
                const trashPath = `${this.trashDir}/${sessionId}.json`;
                try {
                    console.log('开始复制文件:', sessionPath, '->', trashPath);
                    await this.app.vault.copy(sessionFile, trashPath);
                    console.log('会话文件已复制到回收站:', trashPath);
                    
                    // 删除原文件
                    await this.app.vault.delete(sessionFile);
                    console.log('原会话文件已删除');
                    
                    // 添加到回收站索引（在文件操作成功后）
                    await this.addToTrash(sessionId, sessionMetadata.sessionName);
                    console.log('会话已添加到回收站索引:', sessionId, sessionMetadata.sessionName);
                } catch (e) {
                    console.error('移动会话到回收站失败:', e);
                    throw e;
                }
            } else {
                console.warn('会话文件不存在，无法移到回收站:', sessionPath);
                // 即使文件不存在，也从索引中移除（可能是索引不一致）
            }
            
            // 从索引中移除
            this.sessionsIndex.sessions = this.sessionsIndex.sessions.filter(
                s => s.sessionId !== sessionId
            );
            await this.saveSessionsIndex(this.sessionsIndex);
            
            return true;
        } catch (e) {
            console.error('删除会话失败:', e);
            return false;
        }
    }

    async switchSession(sessionId: string): Promise<void> {
        // 保存当前会话
        if (this.currentSession) {
            await this.saveSession(this.currentSession);
        }
        
        // 加载新会话
        this.currentSession = await this.loadSession(sessionId);
        
        // 更新索引
        if (this.sessionsIndex) {
            this.sessionsIndex.currentSessionId = sessionId;
            await this.saveSessionsIndex(this.sessionsIndex);
        }
    }

    async renameSession(sessionId: string, newName: string): Promise<boolean> {
        // 验证名称
        const validation = this.validateSessionName(newName);
        if (!validation.valid) {
            new Notice(validation.error || '会话名称无效');
            return false;
        }
        
        try {
            // 更新会话文件
            const session = await this.loadSession(sessionId);
            session.sessionName = newName;
            await this.saveSession(session);
            
            // 更新索引
            if (this.sessionsIndex) {
                const metadata = this.sessionsIndex.sessions.find(s => s.sessionId === sessionId);
                if (metadata) {
                    metadata.sessionName = newName;
                    await this.saveSessionsIndex(this.sessionsIndex);
                }
            }
            
            // 如果是当前会话，更新缓存
            if (this.currentSession && this.currentSession.sessionId === sessionId) {
                this.currentSession.sessionName = newName;
            }
            
            return true;
        } catch (e) {
            console.error('重命名会话失败:', e);
            return false;
        }
    }

    validateSessionName(name: string): ValidationResult {
        // 去除首尾空格
        const trimmed = name.trim();
        
        // 检查是否为空
        if (trimmed.length === 0) {
            return { valid: false, error: '会话名称不能为空' };
        }
        
        // 检查长度
        if (trimmed.length > 50) {
            return { valid: false, error: '会话名称长度应在 1-50 个字符之间' };
        }
        
        // 检查特殊字符
        const invalidChars = /[\/\\:*?"<>|]/;
        if (invalidChars.test(trimmed)) {
            return { valid: false, error: '会话名称不能包含特殊字符 / \\ : * ? " < > |' };
        }
        
        return { valid: true };
    }

    getCurrentSession(): Session | null {
        return this.currentSession;
    }

    getCurrentSessionId(): string | null {
        return this.sessionsIndex?.currentSessionId || null;
    }

    getAllSessions(): SessionMetadata[] {
        return this.sessionsIndex?.sessions || [];
    }

    // ==================== 数据迁移 ====================
    
    private async checkNeedMigration(): Promise<boolean> {
        // 检查是否存在旧历史文件
        const oldFile = this.app.vault.getAbstractFileByPath(this.oldHistoryPath);
        if (!(oldFile instanceof TFile)) {
            return false;
        }
        
        // 检查是否已存在新索引文件
        const indexFile = this.app.vault.getAbstractFileByPath(this.indexPath);
        return !(indexFile instanceof TFile);
    }

    async migrateOldHistory(): Promise<boolean> {
        try {
            const oldFile = this.app.vault.getAbstractFileByPath(this.oldHistoryPath);
            if (!(oldFile instanceof TFile)) {
                return false;
            }
            
            // 读取旧历史
            const content = await this.app.vault.read(oldFile);
            const oldMessages: SessionMessage[] = JSON.parse(content);
            
            if (!Array.isArray(oldMessages) || oldMessages.length === 0) {
                return false;
            }
            
            // 创建迁移会话
            const now = Date.now();
            const sessionId = `migrated_${now}`;
            const date = new Date(now);
            const dateStr = `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
            
            const migratedSession: Session = {
                sessionId,
                sessionName: `历史会话 ${dateStr}`,
                createdAt: now,
                updatedAt: now,
                messages: oldMessages
            };
            
            // 保存迁移的会话
            await this.saveSession(migratedSession);
            
            // 创建新索引
            this.sessionsIndex = {
                version: '1.0',
                currentSessionId: sessionId,
                sessions: [{
                    sessionId,
                    sessionName: migratedSession.sessionName,
                    createdAt: now,
                    updatedAt: now,
                    messageCount: oldMessages.length
                }]
            };
            
            await this.saveSessionsIndex(this.sessionsIndex);
            
            // 备份旧文件
            const backupPath = this.oldHistoryPath + '.backup';
            const backupFile = this.app.vault.getAbstractFileByPath(backupPath);
            if (!(backupFile instanceof TFile)) {
                await this.app.vault.copy(oldFile, backupPath);
            }
            
            this.currentSession = migratedSession;
            
            new Notice('历史记录已迁移到新格式');
            console.log('数据迁移成功');
            
            return true;
        } catch (e) {
            console.error('数据迁移失败:', e);
            return false;
        }
    }

    // ==================== 辅助方法 ====================
    
    private async createDefaultSession(): Promise<void> {
        const sessionId = await this.createSession();
        console.log('创建默认会话:', sessionId);
    }

    private generateDefaultSessionName(): string {
        const now = new Date();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hour = now.getHours().toString().padStart(2, '0');
        const minute = now.getMinutes().toString().padStart(2, '0');
        return `新会话 ${month}-${day} ${hour}:${minute}`;
    }

    private async ensureDirectory(filePath: string): Promise<void> {
        const pathParts = filePath.split('/');
        let currentPath = '';
        
        // 判断是文件路径还是目录路径
        // 如果最后一部分包含 '.' 且不是以 '.' 开头，可能是文件
        const lastPart = pathParts[pathParts.length - 1];
        const isFilePath = lastPart.includes('.') && !lastPart.startsWith('.');
        
        // 如果是文件路径，只创建到父目录；如果是目录路径，创建整个路径
        const endIndex = isFilePath ? pathParts.length - 1 : pathParts.length;
        
        for (let i = 0; i < endIndex; i++) {
            currentPath += (i === 0 ? '' : '/') + pathParts[i];
            if (currentPath) { // 确保路径不为空
                const folder = this.app.vault.getAbstractFileByPath(currentPath);
                if (!folder) {
                    await this.app.vault.createFolder(currentPath);
                }
            }
        }
    }

    // ==================== 消息操作 ====================
    
    addMessage(message: SessionMessage): void {
        if (this.currentSession) {
            this.currentSession.messages.push(message);
        }
    }

    removeLastMessage(): SessionMessage | undefined {
        if (this.currentSession && this.currentSession.messages.length > 0) {
            return this.currentSession.messages.pop();
        }
        return undefined;
    }

    clearMessages(): void {
        if (this.currentSession) {
            this.currentSession.messages = [];
        }
    }

    getMessages(): SessionMessage[] {
        return this.currentSession?.messages || [];
    }

    // ==================== 回收站管理 ====================
    
    /**
     * 添加到回收站索引
     */
    private async addToTrash(sessionId: string, sessionName: string): Promise<void> {
        const trashIndex = await this.loadTrashIndex();
        const newItem: TrashItem = {
            sessionId,
            sessionName,
            deletedAt: Date.now()
        };
        trashIndex.items.push(newItem);
        console.log('添加到回收站索引:', newItem);
        await this.saveTrashIndex(trashIndex);
        console.log('回收站索引已保存，当前项目数:', trashIndex.items.length);
    }

    /**
     * 加载回收站索引
     */
    private async loadTrashIndex(): Promise<TrashIndex> {
        const trashIndexFile = this.app.vault.getAbstractFileByPath(this.trashIndexPath);
        
        if (trashIndexFile instanceof TFile) {
            try {
                const content = await this.app.vault.read(trashIndexFile);
                return JSON.parse(content);
            } catch (e) {
                console.warn('回收站索引文件损坏，重新创建:', e);
            }
        }
        
        // 返回空索引
        return { items: [] };
    }

    /**
     * 保存回收站索引
     */
    private async saveTrashIndex(trashIndex: TrashIndex): Promise<void> {
        await this.ensureDirectory(this.trashIndexPath);
        
        const trashIndexFile = this.app.vault.getAbstractFileByPath(this.trashIndexPath);
        const content = JSON.stringify(trashIndex, null, 2);
        
        if (trashIndexFile instanceof TFile) {
            await this.app.vault.modify(trashIndexFile, content);
        } else {
            await this.app.vault.create(this.trashIndexPath, content);
        }
    }

    /**
     * 获取回收站中的所有会话
     */
    async getTrashItems(): Promise<TrashItem[]> {
        const trashIndex = await this.loadTrashIndex();
        console.log('回收站索引内容:', JSON.stringify(trashIndex, null, 2));
        console.log('回收站项目数量:', trashIndex.items.length);
        return trashIndex.items;
    }

    /**
     * 从回收站恢复会话
     */
    async restoreFromTrash(sessionId: string): Promise<boolean> {
        try {
            const trashIndex = await this.loadTrashIndex();
            const trashItem = trashIndex.items.find(item => item.sessionId === sessionId);
            if (!trashItem) {
                return false;
            }

            // 从回收站恢复文件
            const trashPath = `${this.trashDir}/${sessionId}.json`;
            const trashFile = this.app.vault.getAbstractFileByPath(trashPath);
            if (!(trashFile instanceof TFile)) {
                return false;
            }

            // 恢复到会话目录
            const sessionPath = `${this.sessionsDir}/${sessionId}.json`;
            await this.app.vault.copy(trashFile, sessionPath);
            
            // 删除回收站文件
            await this.app.vault.delete(trashFile);

            // 从回收站索引中移除
            trashIndex.items = trashIndex.items.filter(item => item.sessionId !== sessionId);
            await this.saveTrashIndex(trashIndex);

            // 加载恢复的会话
            const restoredSession = await this.loadSession(sessionId);
            
            // 添加到会话索引
            if (!this.sessionsIndex) {
                this.sessionsIndex = {
                    version: '1.0',
                    currentSessionId: sessionId,
                    sessions: []
                };
            }

            this.sessionsIndex.sessions.push({
                sessionId: restoredSession.sessionId,
                sessionName: restoredSession.sessionName,
                createdAt: restoredSession.createdAt,
                updatedAt: restoredSession.updatedAt,
                messageCount: restoredSession.messages.length
            });
            await this.saveSessionsIndex(this.sessionsIndex);

            return true;
        } catch (e) {
            console.error('从回收站恢复会话失败:', e);
            return false;
        }
    }

    /**
     * 清理回收站：删除超过7天的会话
     */
    private async cleanupTrash(): Promise<void> {
        try {
            const trashIndex = await this.loadTrashIndex();
            const now = Date.now();
            const retentionMs = this.TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000; // 7天的毫秒数
            
            const itemsToKeep: TrashItem[] = [];
            const itemsToDelete: TrashItem[] = [];
            
            // 分类：保留和删除
            for (const item of trashIndex.items) {
                const age = now - item.deletedAt;
                if (age > retentionMs) {
                    itemsToDelete.push(item);
                } else {
                    itemsToKeep.push(item);
                }
            }
            
            // 删除过期的会话文件
            for (const item of itemsToDelete) {
                const trashPath = `${this.trashDir}/${item.sessionId}.json`;
                const trashFile = this.app.vault.getAbstractFileByPath(trashPath);
                if (trashFile instanceof TFile) {
                    await this.app.vault.delete(trashFile);
                }
            }
            
            // 更新回收站索引
            if (itemsToDelete.length > 0) {
                trashIndex.items = itemsToKeep;
                await this.saveTrashIndex(trashIndex);
                console.log(`清理回收站: 删除了 ${itemsToDelete.length} 个过期会话`);
            }
        } catch (e) {
            console.error('清理回收站失败:', e);
        }
    }

    /**
     * 清空回收站：删除所有回收站中的会话
     */
    async clearAllTrash(): Promise<boolean> {
        try {
            const trashIndex = await this.loadTrashIndex();
            
            // 删除所有回收站中的会话文件
            for (const item of trashIndex.items) {
                const trashPath = `${this.trashDir}/${item.sessionId}.json`;
                const trashFile = this.app.vault.getAbstractFileByPath(trashPath);
                if (trashFile instanceof TFile) {
                    await this.app.vault.delete(trashFile);
                }
            }
            
            // 清空回收站索引
            trashIndex.items = [];
            await this.saveTrashIndex(trashIndex);
            
            console.log('回收站已清空');
            return true;
        } catch (e) {
            console.error('清空回收站失败:', e);
            return false;
        }
    }
}
