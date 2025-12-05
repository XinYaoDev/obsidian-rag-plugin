# Obsidian RAG Assistant (Frontend)

<div align="center">

[![Language](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README.md)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

</div>

这是一个基于 **RAG (检索增强生成)** 架构的 Obsidian 个人知识库助手插件。
它不仅仅是一个简单的 AI 聊天窗口，而是通过连接本地运行的 **Java 后端**，将你的 Obsidian 笔记转化为向量知识库，实现基于你个人知识储备的精准问答。

> [!IMPORTANT] > **这是一个前后端分离的项目**
> 本仓库仅包含 **前端 (Obsidian 插件)** 代码。
> 你必须同时运行配套的后端服务才能正常工作：
> 👉 **后端仓库地址:** [https://github.com/XinYaoDev/obsidian-rag-backend](https://github.com/XinYaoDev/obsidian-rag-backend)

## ✨ 主要特性 (Features)

-   **🧠 知识库对话:** 基于你的笔记内容进行 RAG 问答，让 AI 真正“读过”你的书。
-   **💾 对话历史持久化:**
    -   聊天记录自动保存在 Vault 的 `Assets/History/chat_history.json` 中。
    -   重启 Obsidian 后自动加载上下文，支持多轮对话。
    -   提供一键清空历史功能。
-   **⚙️ 灵活的配置:**
    -   支持多种大模型服务商 (DeepSeek, Aliyun Qwen, OpenAI, Ollama 等)。
    -   支持自定义 API Key 和后端地址。
-   **🔄 智能同步:**
    -   监听文件修改 (`modify`/`create`)，自动将笔记变更同步至后端进行向量化。
    -   内置**防抖 (Debounce)** 和用户行为检测，避免插件冲突（如 Remote Save）导致的不必要同步。

## 🛠️ 安装与使用 (Installation)

由于本项目处于开发阶段，建议通过源码安装。

### 前置条件

-   确保你已安装 **Node.js (v16+)**。
-   确保你已启动 **RAG Backend 服务** (默认端口 `8081`)。

### 开发模式安装 (推荐)

1.  克隆本仓库到你的 Obsidian 插件目录：

    ```bash
    cd <你的Obsidian仓库路径>/.obsidian/plugins/
    git clone [https://github.com/XinYaoDev/obsidian-rag-plugin.git](https://github.com/XinYaoDev/obsidian-rag-plugin.git) my-rag-plugin
    cd my-rag-plugin
    ```

2.  安装依赖：

    ```bash
    npm install
    ```

3.  启动编译监听 (Watch Mode)：

    ```bash
    npm run dev
    ```

    _此时代码修改会自动编译并同步到 Obsidian。_

4.  打开 Obsidian，在 **设置 -> 第三方插件** 中启用 **RAG Assistant**。

## ⚙️ 配置说明 (Configuration)

启用插件后，请进入 **设置 (Settings) -> RAG 助手配置** 进行设置：

1.  **Java 后端地址:** 默认为 `http://localhost:8081` (请确保后端已启动)。
2.  **大模型设置:**
    -   **选择服务商:** 例如 `Aliyun` (通义千问) 或 `DeepSeek`。
    -   **LLM API Key:** 填入你在对应云厂商申请的 API Key。
    -   **LLM 模型名称:** 例如 `qwen-turbo` 或 `deepseek-chat`。
3.  **向量模型 (Embedding) 设置:**
    -   **选择服务商:** 例如 `Aliyun` (通义千问)。
    -   **LLM API Key:** 填入你在对应云厂商申请的 API Key。
    -   **LLM 模型名称:** 例如 `text-embedding-v1`。

## 🖥️ 界面展示

1.  点击左侧侧边栏的 **🤖 机器人图标** 打开助手面板。
2.  在底部输入框输入问题，按 **Enter** 发送 (按 **Shift+Enter** 换行)。
3.  点击顶部的 **垃圾桶图标** 可清空当前历史记录。

## 📅 待开发 (Roadmap)

-   [ ] 流式响应 (Streaming)
-   [ ] 前端界面美化

## 🤝 贡献 (Contributing)

欢迎提交 Issue 或 Pull Request！

-   **前端问题:** 请提交至本仓库。
-   **后端/算法问题:** 请提交至 [后端仓库](https://github.com/XinYaoDev/obsidian-rag-backend)。

## 📄 License

[MIT License](./LICENSE)
