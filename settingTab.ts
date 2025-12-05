// SettingTab.ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import type RagPlugin from './main';
import { LLM_PROVIDERS, EMBEDDING_PROVIDERS } from './settings';

export class RagSettingTab extends PluginSettingTab {
    plugin: RagPlugin;

    constructor(app: App, plugin: RagPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'RAG 助手配置 (完整版)' });

        // 1. Java 后端
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

        // ================= LLM 设置 =================
        containerEl.createEl('h3', { text: '🤖 对话模型 (LLM) 设置' });

        new Setting(containerEl)
            .setName('选择服务商')
            .addDropdown(dropdown => {
                LLM_PROVIDERS.forEach(p => dropdown.addOption(p.value, p.text));
                dropdown.setValue(this.plugin.settings.selectedLlmProvider)
                    .onChange(async (value) => {
                        this.plugin.settings.selectedLlmProvider = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('LLM API Key')
            .setDesc('对话模型的 API Key')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.llmApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.llmApiKey = value;
                    await this.plugin.saveSettings();
                }));

        // ✅ 新增：LLM 模型名称
        new Setting(containerEl)
            .setName('LLM 模型名称')
            .setDesc('填入具体模型 ID (如 deepseek-coder, qwen-turbo, gpt-4)')
            .addText(text => text
                .setPlaceholder('deepseek-chat')
                .setValue(this.plugin.settings.llmModelName)
                .onChange(async (value) => {
                    this.plugin.settings.llmModelName = value;
                    await this.plugin.saveSettings();
                }));

        // ================= Embedding 设置 =================
        containerEl.createEl('h3', { text: '🧠 向量模型 (Embedding) 设置' });

        new Setting(containerEl)
            .setName('选择服务商')
            .addDropdown(dropdown => {
                EMBEDDING_PROVIDERS.forEach(p => dropdown.addOption(p.value, p.text));
                dropdown.setValue(this.plugin.settings.selectedEmbeddingProvider)
                    .onChange(async (value) => {
                        this.plugin.settings.selectedEmbeddingProvider = value;
                        await this.plugin.saveSettings();
                    });
            });

        // ✅ 新增：Embedding API Key
        new Setting(containerEl)
            .setName('Embedding API Key')
            .setDesc('向量服务的 API Key (如果与 LLM 相同也请在此重复填写)')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.embeddingApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.embeddingApiKey = value;
                    await this.plugin.saveSettings();
                }));

        // ✅ 新增：Embedding 模型名称
        new Setting(containerEl)
            .setName('Embedding 模型名称')
            .setDesc('填入具体模型 ID (如 text-embedding-v1, text-embedding-3-small)')
            .addText(text => text
                .setPlaceholder('text-embedding-v1')
                .setValue(this.plugin.settings.embeddingModelName)
                .onChange(async (value) => {
                    this.plugin.settings.embeddingModelName = value;
                    await this.plugin.saveSettings();
                }));
        
        // ================= 其他设置 =================
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
    }
}