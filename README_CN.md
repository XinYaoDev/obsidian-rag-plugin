# Aki · Obsidian RAG Assistant (Frontend)

<div align="center">

### 🚀 为你的 Obsidian 第二大脑装上 RAG 引擎

[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

</div>

---

**Aki** 是一个基于检索增强 (RAG) 的 Obsidian 插件。它需要配套的 **Java 后端** 负责向量化与对话，请先启动后端服务。

---

## ✨ 主要特性

### 🧠 对话 + RAG
- 对话前会把用户消息/历史里的 `[[笔记]]` 展开为笔记内容再发送给后端。
- 支持 DeepSeek、通义千问 (Aliyun)、OpenAI、Moonshot、Ollama 等服务商（可配置模型与 API Key）。
- 向量同步可使用独立的 Embedding 服务商/模型/API Key。
- **深度思考开关**：开启后先流式展示“思考过程”，开始回答时自动收起。

### 💬 聊天体验
- Contenteditable 输入框：
  - 输入 `[[` 弹出最近笔记选择器（按修改时间倒序，最多 5 条），插入内部链接。
  - 输入“空格 + @”弹出 `prompts/*.md` 提示词选择器（以 `[[Prompt]]` 插入）。
  - 输入历史 ↑/↓，Ctrl/Cmd+Enter 发送，Shift+Enter 换行。
- 流式回答，发送键可一键终止；失败会自动撤回消息。
- 代码块带语言标签与复制按钮；AI 气泡支持全文复制并可导出到当前笔记。
- Ctrl/Cmd+点击内部链接即可打开笔记。

### 💾 会话管理
- 会话列表支持创建、切换、重命名、删除、回收站、恢复、彻底删除；回收站超过 7 天自动清理。
- 数据存储在本地 vault：`Assets/History/sessions_index.json`、`Assets/History/sessions/*.json`、`Assets/History/trash/*.json`。
- 首轮问答后自动生成会话标题（可独立配置服务商/模型/API Key，留空则回退到 LLM 配置）。
- 将最新一条 AI 回复覆盖导出到当前笔记，若无打开笔记则自动创建 `Aki 会话导出 <timestamp>.md`。

### 🔄 智能同步
- 监听 Markdown `modify/create` 事件，仅同步当前激活编辑的文件。
- 需要最近 3 秒内有用户输入以过滤 Remote Save 等后台改动。
- 2 秒防抖后上传到 `POST /api/rag/sync`，携带标题/路径/内容及 Embedding 配置。

---

## 🛠️ 安装 (开发模式)

### 前置
- Node.js 18+
- 运行中的 Java 后端（默认 `http://localhost:8081`）

### 步骤
1. 进入 Obsidian 插件目录：
    ```bash
    cd <你的Vault路径>/.obsidian/plugins/
    ```
2. 克隆仓库：
    ```bash
    git clone https://github.com/XinYaoDev/obsidian-rag-plugin.git my-rag-plugin
    cd my-rag-plugin
    ```
3. 安装依赖并启动监听：
    ```bash
    npm install
    npm run dev
    ```
4. 在 Obsidian 的 **设置 → 第三方插件** 中启用 **Aki**。

---

## ⚙️ 配置

入口：**设置 → Aki 配置**。

### 后端
- **Java 后端地址**（去掉末尾 `/`），默认 `http://localhost:8081`。

### 对话 (LLM)
- **服务商 / 模型 / API Key**（DeepSeek、Qwen、OpenAI、Moonshot、Ollama）。
- 深度思考复用此配置，除非单独配置了标题生成。

### 向量 (Embedding)
- **服务商 / 模型 / API Key** 用于 `/api/rag/sync`，若空则回退到 LLM Key。

### 高级
- **深度思考开关**（聊天面板按钮）。
- **自动生成会话标题**：可独立配置服务商/模型/API Key，留空则用 LLM 配置。
- **启用自动同步**：总开关，当前为 2 秒防抖。

---

## 🖥️ 使用

1) 点击左侧栏机器人图标打开 Aki（右侧面板）。  
2) 输入并回车/ Ctrl(Cmd)+Enter 发送；Shift+Enter 换行。  
3) `[[` 选择最近笔记，空格 + `@` 选择 `prompts/*.md` 提示词。  
4) 需要时开启 **深度思考**。  
5) 代码块或全文一键复制，或导出到当前笔记。  
6) 通过工具栏管理会话：列表/切换、新建、重命名、删除到回收站、恢复、清空消息、清空回收站。

---

## 📅 开发计划

- [x] 流式聊天与终止
- [x] 深度思考开关 + 思考面板
- [x] 多会话 + 回收站 + 自动标题
- [x] 提示词/笔记选择器、输入历史、导出笔记、复制增强
- [x] 智能同步（仅活跃文件 + 防抖 + 用户输入过滤）
- [ ] 回答引用角标跳转原笔记
- [ ] UI 打磨与移动端测试

---

## 🤝 贡献

欢迎提 Issue / PR。后端相关问题请提到对应 Java 后端仓库。

## 📄 License

[MIT License](./LICENSE)
