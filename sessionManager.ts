// sessionManager.ts - 会话管理器
import { App, TFile, Notice } from 'obsidian';

// 会话消息接口
export interface SessionMessage {
    role: 'user' | 'assistant';
    content: string;
    thinking?: string | null; // 思考过程（仅 assistant 消息可能有）
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

export class SessionManager {
    private app: App;
    private readonly indexPath = 'Assets/History/sessions_index.json';
    private readonly sessionsDir = 'Assets/History/sessions';
    private readonly trashDir = 'Assets/History/trash';
    private readonly oldHistoryPath = 'Assets/History/chat_history.json';
    
    private sessionsIndex: SessionsIndex | null = null;
    private currentSession: Session | null = null;

    constructor(app: App) {
        this.app = app;
    }

    // ==================== 初始化 ====================
    
    async initialize(): Promise<void> {
        try {
            // 确保回收站目录存在
            await this.ensureTrashDirExists();
            
            // 清理超过7天的回收站记录
            await this.cleanExpiredTrash();
            
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
            
            // 将会话文件移动到回收站
            await this.moveSessionToTrash(sessionId);
            
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
        const sessions = this.sessionsIndex?.sessions || [];
        // 显示时按更新时间倒序排列，最新的会话在最上方
        return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
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
        
        for (let i = 0; i < pathParts.length - 1; i++) {
            currentPath += (i === 0 ? '' : '/') + pathParts[i];
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            if (!folder) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    private async ensureTrashDirExists(): Promise<void> {
        const trashFolder = this.app.vault.getAbstractFileByPath(this.trashDir);
        if (!trashFolder) {
            await this.app.vault.createFolder(this.trashDir);
        }
    }

    private async moveSessionToTrash(sessionId: string): Promise<boolean> {
        try {
            const sessionPath = `${this.sessionsDir}/${sessionId}.json`;
            const sessionFile = this.app.vault.getAbstractFileByPath(sessionPath);
            
            if (sessionFile instanceof TFile) {
                const trashPath = `${this.trashDir}/${sessionId}.json`;
                // 如果回收站中已存在同名文件，添加时间戳避免冲突
                const existingTrashFile = this.app.vault.getAbstractFileByPath(trashPath);
                const finalTrashPath = existingTrashFile 
                    ? `${this.trashDir}/${sessionId}_${Date.now()}.json`
                    : trashPath;
                
                // 读取原文件内容
                const content = await this.app.vault.read(sessionFile);
                // 在回收站创建文件
                await this.ensureDirectory(finalTrashPath);
                await this.app.vault.create(finalTrashPath, content);
                // 删除原文件
                await this.app.vault.delete(sessionFile);
                return true;
            }
            return false;
        } catch (e) {
            console.error('移动会话到回收站失败:', e);
            return false;
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

    // ==================== 回收站操作 ====================
    
    async getTrashSessions(): Promise<SessionMetadata[]> {
        try {
            await this.ensureTrashDirExists();
            const trashFolder = this.app.vault.getAbstractFileByPath(this.trashDir);
            if (!trashFolder) {
                return [];
            }

            const trashSessions: SessionMetadata[] = [];
            const files = this.app.vault.getFiles().filter(file => 
                file.path.startsWith(this.trashDir + '/') && file.extension === 'json'
            );

            for (const file of files) {
                try {
                    const content = await this.app.vault.read(file);
                    const session: Session = JSON.parse(content);
                    trashSessions.push({
                        sessionId: session.sessionId,
                        sessionName: session.sessionName,
                        createdAt: session.createdAt,
                        updatedAt: session.updatedAt,
                        messageCount: session.messages.length
                    });
                } catch (e) {
                    console.error(`读取回收站会话文件失败: ${file.path}`, e);
                }
            }

            // 按更新时间倒序排列
            return trashSessions.sort((a, b) => b.updatedAt - a.updatedAt);
        } catch (e) {
            console.error('获取回收站会话失败:', e);
            return [];
        }
    }

    async restoreSessionFromTrash(sessionId: string): Promise<boolean> {
        try {
            // 查找回收站中的文件（可能带时间戳后缀）
            const trashFiles = this.app.vault.getFiles().filter(file => 
                file.path.startsWith(this.trashDir + '/') && 
                file.name.startsWith(sessionId) && 
                file.extension === 'json'
            );

            if (trashFiles.length === 0) {
                return false;
            }

            const trashFile = trashFiles[0]; // 取第一个匹配的文件
            const content = await this.app.vault.read(trashFile);
            const session: Session = JSON.parse(content);

            // 恢复到会话目录
            const sessionPath = `${this.sessionsDir}/${sessionId}.json`;
            await this.ensureDirectory(sessionPath);
            await this.app.vault.create(sessionPath, content);

            // 添加到索引，确保非空
            if (!this.sessionsIndex) {
                await this.loadOrCreateIndex();
            }
            if (!this.sessionsIndex) {
                this.sessionsIndex = {
                    version: '1.0',
                    currentSessionId: session.sessionId,
                    sessions: []
                };
            }

            this.sessionsIndex.sessions.push({
                sessionId: session.sessionId,
                sessionName: session.sessionName,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                messageCount: session.messages.length
            });
            await this.saveSessionsIndex(this.sessionsIndex);

            // 从回收站删除
            await this.app.vault.delete(trashFile);

            return true;
        } catch (e) {
            console.error('恢复会话失败:', e);
            return false;
        }
    }

    async permanentlyDeleteFromTrash(sessionId: string): Promise<boolean> {
        try {
            // 查找回收站中的文件（可能带时间戳后缀）
            const trashFiles = this.app.vault.getFiles().filter(file => 
                file.path.startsWith(this.trashDir + '/') && 
                file.name.startsWith(sessionId) && 
                file.extension === 'json'
            );

            if (trashFiles.length === 0) {
                return false;
            }

            // 永久删除
            for (const file of trashFiles) {
                await this.app.vault.delete(file);
            }

            return true;
        } catch (e) {
            console.error('永久删除会话失败:', e);
            return false;
        }
    }

    // ==================== 回收站清理 ====================
    
    // 清理超过7天的回收站记录
    private async cleanExpiredTrash(): Promise<void> {
        try {
            await this.ensureTrashDirExists();
            const trashFolder = this.app.vault.getAbstractFileByPath(this.trashDir);
            if (!trashFolder) {
                return;
            }

            // 获取回收站中的所有文件
            const trashFiles = this.app.vault.getFiles().filter(file => 
                file.path.startsWith(this.trashDir + '/') && file.extension === 'json'
            );

            if (trashFiles.length === 0) {
                return;
            }

            // 计算7天前的时间戳
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            let deletedCount = 0;

            for (const file of trashFiles) {
                try {
                    // 读取会话文件内容，获取 updatedAt 字段
                    const content = await this.app.vault.read(file);
                    const session: Session = JSON.parse(content);
                    
                    // 使用会话的 updatedAt 时间戳判断（这是会话最后更新的时间，即删除前的时间）
                    // 如果会话最后更新时间早于7天前，删除它
                    if (session.updatedAt < sevenDaysAgo) {
                        await this.app.vault.delete(file);
                        deletedCount++;
                    }
                } catch (e) {
                    // 如果文件损坏或格式错误，也尝试删除（使用文件修改时间作为备选）
                    try {
                        const fileMtime = file.stat.mtime;
                        if (fileMtime < sevenDaysAgo) {
                            await this.app.vault.delete(file);
                            deletedCount++;
                        }
                    } catch (deleteError) {
                        console.error(`删除过期回收站文件失败: ${file.path}`, deleteError);
                    }
                }
            }

            if (deletedCount > 0) {
                console.log(`已清理 ${deletedCount} 个超过7天的回收站记录`);
            }
        } catch (e) {
            console.error('清理过期回收站记录失败:', e);
        }
    }
}
