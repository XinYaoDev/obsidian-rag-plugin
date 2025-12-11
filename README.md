# Aki · Obsidian RAG Assistant (Frontend)

<div align="center">

### 🚀 Supercharge Your Obsidian Second Brain with AI (RAG)

[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

</div>

---

**Aki** is an Obsidian plugin that turns your vault into a retrieval-augmented (RAG) knowledge base. It talks to a separate **Java backend** that handles embedding and chat. Run the backend to make the plugin work.

---

## ✨ Features

### 🧠 Chat + RAG
- Chats against your vault; user messages and history expand `[[note]]` links into note content before sending.
- Supports DeepSeek, Qwen (Aliyun), OpenAI, Moonshot, Ollama via configurable provider/model/API key.
- Separate embedding provider/model/key for syncing to the backend.
- Optional **Deep Thinking** toggle: streams a “thinking” pane then collapses when answers start.

### 💬 Chat experience
- Contenteditable input with:
  - `[[` to open recent-note picker (mtime-desc, top 5) and insert internal links.
  - Space + `@` to open prompt picker from `prompts/*.md` (inserts as `[[Prompt]]`).
  - Input history (↑/↓), Ctrl/Cmd+Enter to send, Shift+Enter for newline.
- Streaming answers with Abort (send button becomes stop). Errors auto-rollback last message.
- Code blocks get language header + copy button; whole AI message copy + “export to active note” button.
- Ctrl/Cmd+click internal links to open notes.

### 💾 Sessions
- Multi-session list with create, switch, rename, delete, trash, restore, permanent delete; trash auto-cleans items older than 7 days.
- Data stored in-vault: `Assets/History/sessions_index.json`, `Assets/History/sessions/*.json`, `Assets/History/trash/*.json`.
- Auto title generation after first Q&A using a configurable provider/model/key (fallback to LLM config).
- Export latest AI answer to the active note, or auto-create `Aki 会话导出 <timestamp>.md`.

### 🔄 Smart sync to backend
- Watches markdown `modify/create` events; only syncs the *active file* when sync is enabled.
- Ignores background sync (e.g., Remote Save) by requiring recent user typing (<3s).
- Debounced (2s) upload to `POST /api/rag/sync` with title/path/content and embedding config.

---

## 🛠️ Installation

Dev-mode install is recommended.

### 1. Prerequisites
- Node.js 18+
- The companion Java backend running (default `http://localhost:8081`)

### 2. Development Mode Installation

1.  Navigate to your Obsidian plugin directory:
    ```bash
    cd <Your_Vault_Path>/.obsidian/plugins/
    ```
2.  Clone the repository:
    ```bash
    git clone https://github.com/XinYaoDev/obsidian-rag-plugin.git my-rag-plugin
    cd my-rag-plugin
    ```
3.  Install dependencies and start watching:
    ```bash
    npm install
    npm run dev
    ```
4.  In Obsidian enable **Aki** under **Settings → Community plugins**.

---

## ⚙️ Configuration

Open **Settings → Aki 配置**.

### Backend
- **Java Backend URL** (no trailing slash), default `http://localhost:8081`.

### LLM (chat)
- **Provider / Model / API Key** (DeepSeek, Qwen, OpenAI, Moonshot, Ollama).
- Deep Thinking uses these unless title-generation is separately configured.

### Embedding (sync)
- **Provider / Model / API Key** used by `/api/rag/sync`. Embedding key can differ from LLM key (fallback to LLM key if empty).

### Advanced
- **Deep Thinking toggle** (per-chat UI switch).
- **Auto-generate session title**: optional provider/model/API key; falls back to LLM config if empty.
- **Sync enable**: master switch for file uploads (debounce 2s).

---

## 🖥️ Usage Guide

1) Click the left-ribbon bot icon to open Aki (opens in the right pane).  
2) Type and **Enter** / **Ctrl/Cmd+Enter** to send; **Shift+Enter** for newline.  
3) `[[` picks a recent note; space + `@` picks a prompt from `prompts/*.md`.  
4) Toggle **Deep Thinking** above the input when needed.  
5) Copy code via block header; copy whole answer or export to the active note via bubble buttons.  
6) Manage sessions via the toolbar: list/switch, new, rename, delete to trash, restore, clear messages, empty trash.

---

## 📅 Roadmap

- [x] Streaming chat with abort
- [x] Deep Thinking toggle + thinking panel
- [x] Multi-session with trash and auto title generation
- [x] Prompt/note pickers, input history, export to note, code/full copy
- [x] Smart sync with active-file + debounce filter
- [ ] Source citation badges back to notes
- [ ] UI polish & mobile testing

---

## 🤝 Contributing

Issues and PRs are welcome. Backend issues should go to the Java backend repo you use.

## 📄 License

[MIT License](./LICENSE)
