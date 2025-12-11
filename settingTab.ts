// SettingTab.ts
import { App, PluginSettingTab, Setting, Modal } from 'obsidian';
import type RagPlugin from './main';

export class RagSettingTab extends PluginSettingTab {
    plugin: RagPlugin;

    constructor(app: App, plugin: RagPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        const render = (tab: 'general' | 'model') => {
            containerEl.empty();
            containerEl.createEl('h2', { text: 'Aki 配置' });

            const tabs = containerEl.createDiv({ cls: 'settings-tabs' });
            const generalBtn = tabs.createEl('button', { cls: `tab-btn ${tab === 'general' ? 'active' : ''}`, text: 'General' });
            const modelBtn = tabs.createEl('button', { cls: `tab-btn ${tab === 'model' ? 'active' : ''}`, text: 'Model' });

            generalBtn.onclick = () => render('general');
            modelBtn.onclick = () => render('model');

            if (tab === 'general') {
                this.renderGeneral(containerEl);
            } else {
                this.renderModelTab(containerEl);
            }
        };

        render('model');
    }

    private renderGeneral(containerEl: HTMLElement) {
        // Java 后端
        new Setting(containerEl)
            .setName('Java 后端地址')
            .setDesc('Spring Boot 服务地址')
            .addText(text => text
                .setPlaceholder('http://localhost:8081')
                .setValue(this.plugin.settings.javaBackendUrl)
                .onChange(async (value) => {
                    this.plugin.settings.javaBackendUrl = value.replace(/\/$/, '');
                    await this.plugin.saveSettings();
                }));
        
        // 其他设置
        containerEl.createEl('h3', { text: '⚙️ 其他设置' });
         new Setting(containerEl)
            .setName('启用自动同步')
            .setDesc('文件修改时自动上传到知识库')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableSync)
                .onChange(async (value) => {
                    this.plugin.settings.enableSync = value;
                    await this.plugin.saveSettings();
                }));

        // 高级设置 - 标题生成
        containerEl.createEl('h3', { text: '🔧 高级设置' });
        containerEl.createEl('h4', { text: '自动生成会话标题' });
        containerEl.createEl('p', { 
            text: '配置用于自动生成会话标题的模型。如果不配置，将使用当前聊天模型。',
            cls: 'setting-item-description'
        });

        const providerOptions = Array.from(new Set(this.plugin.settings.chatModels.map(m => m.provider)));
        new Setting(containerEl)
            .setName('标题生成服务商')
            .addDropdown(dropdown => {
                providerOptions.forEach(p => dropdown.addOption(p, p));
                const fallback = this.plugin.settings.chatModels[0]?.provider || '';
                dropdown.setValue(this.plugin.settings.titleGenerationProvider || fallback)
                    .onChange(async (value) => {
                        this.plugin.settings.titleGenerationProvider = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('标题生成模型名称')
            .addText(text => text
                .setPlaceholder('deepseek-chat')
                .setValue(this.plugin.settings.titleGenerationModelName || (this.plugin.settings.chatModels.find(m => m.id === this.plugin.settings.selectedChatModelId)?.model || ''))
                .onChange(async (value) => {
                    this.plugin.settings.titleGenerationModelName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('标题生成 API Key')
            .setDesc('标题生成模型的 API Key')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.titleGenerationApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.titleGenerationApiKey = value;
                    await this.plugin.saveSettings();
                }));
    }

    private renderModelTab(containerEl: HTMLElement) {
        const header = containerEl.createDiv({ cls: 'model-tab-header' });
        header.createEl('h3', { text: '🤖 Chat Models' });
        const addBtn = header.createEl('button', { text: '+ Add Model', cls: 'model-add-btn' });

        const table = containerEl.createDiv({ cls: 'model-table' });
        const head = table.createDiv({ cls: 'model-table__head' });
        head.createDiv({ text: 'Model', cls: 'model-col model-col--name' });
        head.createDiv({ text: 'Provider', cls: 'model-col model-col--provider' });
        head.createDiv({ text: 'Enable', cls: 'model-col model-col--enable' });
        head.createDiv({ text: 'Actions', cls: 'model-col model-col--actions' });

        const body = table.createDiv({ cls: 'model-table__body' });

        const renderRows = () => {
            body.empty();
            this.plugin.settings.chatModels.forEach(model => {
                const row = body.createDiv({ cls: 'model-row' });
                row.createDiv({ text: model.name || model.model || '未命名', cls: 'model-col model-col--name' });
                row.createDiv({ text: model.provider || '-', cls: 'model-col model-col--provider' });

                const enableCol = row.createDiv({ cls: 'model-col model-col--enable' });
                const enableToggle = enableCol.createEl('input', { type: 'checkbox' });
                enableToggle.checked = model.enabled;
                enableToggle.onchange = async () => {
                    model.enabled = enableToggle.checked;
                    await this.plugin.saveSettings();
                    this.ensureSelectedChatModel();
                    renderRows();
                };

                const actions = row.createDiv({ cls: 'model-col model-col--actions' });
                const editBtn = actions.createEl('button', { cls: 'icon-btn', attr: { 'aria-label': '编辑' } });
                editBtn.innerHTML = '✏️';
                editBtn.onclick = () => {
                    new ModelEditModal(this.app, model, async (updated) => {
                        Object.assign(model, updated);
                        await this.plugin.saveSettings();
                        this.ensureSelectedChatModel();
                        renderRows();
                    }).open();
                };
                const deleteBtn = actions.createEl('button', { cls: 'icon-btn', attr: { 'aria-label': '删除' } });
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.onclick = async () => {
                    const idx = this.plugin.settings.chatModels.findIndex(m => m.id === model.id);
                    if (idx >= 0) {
                        this.plugin.settings.chatModels.splice(idx, 1);
                        this.ensureSelectedChatModel();
                        await this.plugin.saveSettings();
                        renderRows();
                    }
                };
            });
        };

        addBtn.onclick = async () => {
            const newModel = {
                id: `model-${Date.now()}`,
                name: 'New Model',
                provider: '',
                model: '',
                baseUrl: '',
                apiKey: '',
                enabled: true,
            };
            this.plugin.settings.chatModels.push(newModel);
            this.ensureSelectedChatModel();
            await this.plugin.saveSettings();
            renderRows();
        };

        renderRows();

        // Embedding Models
        const embedHeader = containerEl.createDiv({ cls: 'model-tab-header' });
        embedHeader.createEl('h3', { text: '🧠 Embedding Models' });
        const addEmbedBtn = embedHeader.createEl('button', { text: '+ Add Model', cls: 'model-add-btn' });

        const embedTable = containerEl.createDiv({ cls: 'model-table' });
        const embedHead = embedTable.createDiv({ cls: 'model-table__head' });
        embedHead.createDiv({ text: 'Model', cls: 'model-col model-col--name' });
        embedHead.createDiv({ text: 'Provider', cls: 'model-col model-col--provider' });
        embedHead.createDiv({ text: 'Enable', cls: 'model-col model-col--enable' });
        embedHead.createDiv({ text: 'Actions', cls: 'model-col model-col--actions' });

        const embedBody = embedTable.createDiv({ cls: 'model-table__body' });

        const renderEmbedRows = () => {
            embedBody.empty();
            this.plugin.settings.embeddingModels.forEach(model => {
                const row = embedBody.createDiv({ cls: 'model-row' });
                row.createDiv({ text: model.name || model.model || '未命名', cls: 'model-col model-col--name' });
                row.createDiv({ text: model.provider || '-', cls: 'model-col model-col--provider' });

                const enableCol = row.createDiv({ cls: 'model-col model-col--enable' });
                const enableToggle = enableCol.createEl('input', { type: 'checkbox' });
                enableToggle.checked = model.enabled;
                enableToggle.onchange = async () => {
                    model.enabled = enableToggle.checked;
                    await this.plugin.saveSettings();
                    this.ensureSelectedEmbeddingModel();
                    renderEmbedRows();
                };

                const actions = row.createDiv({ cls: 'model-col model-col--actions' });
                const editBtn = actions.createEl('button', { cls: 'icon-btn', attr: { 'aria-label': '编辑' } });
                editBtn.innerHTML = '✏️';
                editBtn.onclick = () => {
                    new ModelEditModal(this.app, model, async (updated) => {
                        Object.assign(model, updated);
                        await this.plugin.saveSettings();
                        this.ensureSelectedEmbeddingModel();
                        renderEmbedRows();
                    }).open();
                };
                const deleteBtn = actions.createEl('button', { cls: 'icon-btn', attr: { 'aria-label': '删除' } });
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.onclick = async () => {
                    const idx = this.plugin.settings.embeddingModels.findIndex(m => m.id === model.id);
                    if (idx >= 0) {
                        this.plugin.settings.embeddingModels.splice(idx, 1);
                        this.ensureSelectedEmbeddingModel();
                        await this.plugin.saveSettings();
                        renderEmbedRows();
                    }
                };
            });
        };

        addEmbedBtn.onclick = async () => {
            const newModel = {
                id: `embed-${Date.now()}`,
                name: 'New Embedding',
                provider: '',
                model: '',
                baseUrl: '',
                apiKey: '',
                enabled: true,
            };
            this.plugin.settings.embeddingModels.push(newModel);
            this.ensureSelectedEmbeddingModel();
            await this.plugin.saveSettings();
            renderEmbedRows();
        };

        renderEmbedRows();
    }

    private ensureSelectedChatModel() {
        const enabled = this.plugin.settings.chatModels.filter(m => m.enabled);
        if (!this.plugin.settings.selectedChatModelId || !enabled.some(m => m.id === this.plugin.settings.selectedChatModelId)) {
            const fallback = enabled[0] || this.plugin.settings.chatModels[0];
            this.plugin.settings.selectedChatModelId = fallback?.id || '';
        }
    }

    private ensureSelectedEmbeddingModel() {
        const enabled = this.plugin.settings.embeddingModels.filter(m => m.enabled);
        if (!this.plugin.settings.selectedEmbeddingModelId || !enabled.some(m => m.id === this.plugin.settings.selectedEmbeddingModelId)) {
            const fallback = enabled[0] || this.plugin.settings.embeddingModels[0];
            this.plugin.settings.selectedEmbeddingModelId = fallback?.id || '';
        }
    }
}

class ModelEditModal extends Modal {
    private model: any;
    private onSave: (model: any) => void;

    constructor(app: App, model: any, onSave: (model: any) => void) {
        super(app);
        this.model = { ...model };
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: '编辑模型' });

        const buildInput = (label: string, value: string, placeholder: string, onChange: (v: string) => void) => {
            new Setting(contentEl)
                .setName(label)
                .addText(text => text
                    .setPlaceholder(placeholder)
                    .setValue(value || '')
                    .onChange((val) => onChange(val.trim())));
        };

        buildInput('Model（展示名称）', this.model.name, '如 DeepSeek Chat', (v) => this.model.name = v);
        buildInput('Provider', this.model.provider, '如 deepseek、aliyun', (v) => this.model.provider = v);
        buildInput('Model Name', this.model.model, '如 deepseek-chat、qwen-plus', (v) => this.model.model = v);
        buildInput('Base URL', this.model.baseUrl, 'https://...', (v) => this.model.baseUrl = v.replace(/\/$/, ''));
        buildInput('API Key', this.model.apiKey, 'sk-...', (v) => this.model.apiKey = v);

        const footer = contentEl.createDiv({ cls: 'modal-footer' });
        const saveBtn = footer.createEl('button', { text: '保存' });
        const cancelBtn = footer.createEl('button', { text: '取消' });
        saveBtn.onclick = () => {
            this.onSave(this.model);
            this.close();
        };
        cancelBtn.onclick = () => this.close();
    }
}