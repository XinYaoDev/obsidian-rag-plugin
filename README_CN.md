# Obsidian RAG Assistant (Frontend)

<div align="center">

### 🚀 为你的 Obsidian 第二大脑装上 AI 引擎

[![English](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README_en.md)
[![Chinese](https://img.shields.io/badge/Language-中文-red?style=for-the-badge)](./README.md)

[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/XinYaoDev/obsidian-rag-plugin?style=for-the-badge&color=orange)](https://github.com/XinYaoDev/obsidian-rag-plugin/releases)

</div>

---

这是一个基于 **RAG (检索增强生成)** 架构的 Obsidian 个人知识库助手插件。
它不仅仅是一个简单的 AI 聊天窗口，而是通过连接本地运行的 **Java 后端**，将你的 Obsidian 笔记转化为向量知识库，实现基于你个人知识储备的精准问答。

> [!IMPORTANT] > **⚠️ 这是一个前后端分离的项目**
>
> 本仓库仅包含 **前端 (Obsidian 插件)** 代码。你必须同时运行配套的后端服务才能正常工作。
>
> 👉 **后端仓库地址:** [**obsidian-rag-backend**](https://github.com/XinYaoDev/obsidian-rag-backend)

---

## ✨ 主要特性 (Features)

### 🧠 核心能力

-   **知识库对话 (Chat with Notes):** 基于 RAG 技术，AI 会先检索你的笔记，再回答问题。让 AI 真正“读过”你的书，拒绝胡说八道。
-   **🚀 深度思考模式 (Deep Thinking):**
    -   集成 **DeepSeek R1** / **Qwen QwQ** 等推理模型。
    -   提供**独立开关**，一键开启“深度思考”。
    -   支持展示 AI 的 **思维链 (Chain of Thought)**，让答案不仅有结果，更有逻辑推导过程。
    -   _UI 支持折叠/展开思考过程，保持界面整洁。_

### 💾 会话管理

-   **对话持久化:** 聊天记录自动保存在 Vault 的 `Assets/History/chat_history.json` 文件中，数据完全掌握在你手中。
-   **上下文记忆:** 重启 Obsidian 后自动加载上次的对话上下文，支持多轮连续问答。
-   **一键重置:** 提供垃圾桶图标，随时清空历史，开启新的话题。

### ⚙️ 灵活与智能

-   **多模型支持:** 兼容 DeepSeek, Aliyun Qwen, OpenAI, Ollama 等主流服务商。
-   **智能同步:** 监听文件修改 (`modify`/`create`)，自动将笔记变更同步至后端进行向量化。内置 **防抖 (Debounce)** 机制，完美兼容 Remote Save 等同步插件。

---

## 📸 界面预览 (Screenshots)

_(此处建议放一张截图，展示侧边栏聊天窗口、深度思考的开关以及展开的思考过程)_

---

## 🛠️ 安装与使用 (Installation)

由于本项目处于开发阶段，建议通过源码安装调试。

### 1. 前置条件

-   确保你已安装 **Node.js (v16+)**。
-   确保你已启动 **RAG Backend 服务** (默认端口 `8081`)。

### 2. 开发模式安装

1.  进入你的 Obsidian 插件目录：
    ```bash
    cd <你的Obsidian仓库路径>/.obsidian/plugins/
    ```
2.  克隆仓库：
    ```bash
    git clone [https://github.com/XinYaoDev/obsidian-rag-plugin.git](https://github.com/XinYaoDev/obsidian-rag-plugin.git) my-rag-plugin
    cd my-rag-plugin
    ```
3.  安装依赖并启动监听：
    ```bash
    npm install
    npm run dev
    ```
4.  打开 Obsidian，在 **设置 -> 第三方插件** 中启用 **RAG Assistant**。

---

## ⚙️ 配置说明 (Configuration)

启用插件后，请进入 **设置 (Settings) -> RAG 助手配置**：

### 基础设置

-   **Java 后端地址:** 默认为 `http://localhost:8081`。

### LLM 模型设置

-   **服务商:** 选择 `Aliyun` (通义千问) 或 `DeepSeek` 等。
-   **API Key:** 填入云厂商提供的 API Key。
-   **模型名称:**
    -   _常规模式:_ 推荐 `qwen-plus` 或 `deepseek-chat`。
    -   _深度思考:_ 推荐 `qwq-32b-preview` 或 `deepseek-reasoner` (需后端支持)。

### 向量模型 (Embedding)

-   **模型名称:** 例如 `text-embedding-v3` 或 `text-embedding-v1`。

---

## 🖥️ 使用指南 (Usage)

1.  **打开助手:** 点击左侧侧边栏的 **🤖 机器人图标**。
2.  **开启深度思考:** (可选) 点击输入框上方的 **🧠 Deep Thinking** 开关。
3.  **提问:** 输入问题按 **Enter** 发送。
4.  **管理历史:** 点击顶部工具栏的 **🗑️ 垃圾桶** 可清空当前上下文。

---

## 📅 开发计划 (Roadmap)

我们正在持续改进体验，以下是即将到来的功能：

-   [x] 基础 RAG 对话功能 & 笔记自动同步
-   [x] **深度思考 (CoT) 展示与开关**
-   [x] **历史会话持久化**
-   [ ] **📋 内容一键复制:** 支持一键复制 AI 回复的代码块或全文。
-   [ ] **🛑 停止生成:** 添加“停止”按钮，随时中断 AI 的长文本输出。
-   [ ] **📝 历史会话自动总结:** 根据聊天内容自动生成会话标题，并在侧边栏展示历史列表。
-   [ ] **🌊 流式响应 (Streaming):** 优化打字机效果，降低等待感。
-   [ ] **🔗 引用来源跳转:** 点击回答中的引用角标，自动跳转到对应的笔记段落。

---

## 🤝 贡献 (Contributing)

欢迎提交 Issue 或 Pull Request！

-   **前端问题:** 请提交至本仓库。
-   **后端/算法问题:** 请提交至 [后端仓库](https://github.com/XinYaoDev/obsidian-rag-backend)。

## 📄 License

[MIT License](./LICENSE)
