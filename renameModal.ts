// renameModal.ts - 会话重命名对话框
import { App, Modal, Setting } from 'obsidian';

export class RenameModal extends Modal {
    private oldName: string;
    private onSubmit: (newName: string) => void;
    private inputEl: HTMLInputElement | null = null;

    constructor(app: App, oldName: string, onSubmit: (newName: string) => void) {
        super(app);
        this.oldName = oldName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('h3', { text: '重命名会话' });

        // 创建输入框设置项
        new Setting(contentEl)
            .setName('会话名称')
            .setDesc('请输入新的会话名称（1-50个字符）')
            .addText(text => {
                this.inputEl = text.inputEl;
                text
                    .setPlaceholder('输入会话名称')
                    .setValue(this.oldName)
                    .onChange(value => {
                        // 实时验证（可选）
                    });
                
                // 自动选中文本
                setTimeout(() => {
                    text.inputEl.select();
                }, 10);
                
                // 回车提交
                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.submit();
                    }
                });
            });

        // 按钮区域
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';

        // 取消按钮
        const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
        cancelBtn.addEventListener('click', () => {
            this.close();
        });

        // 确定按钮
        const submitBtn = buttonContainer.createEl('button', { 
            text: '确定',
            cls: 'mod-cta'  // Obsidian 的主要按钮样式
        });
        submitBtn.addEventListener('click', () => {
            this.submit();
        });
    }

    private submit() {
        if (!this.inputEl) return;
        
        const newName = this.inputEl.value.trim();
        
        // 基本验证
        if (newName.length === 0) {
            // 可以添加错误提示
            return;
        }
        
        if (newName === this.oldName) {
            this.close();
            return;
        }
        
        this.onSubmit(newName);
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
