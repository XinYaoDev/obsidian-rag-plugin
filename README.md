# Obsidian RAG Assistant (Frontend)

<div align="center">

### 🚀 Supercharge Your Obsidian Second Brain with AI

[![English](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README_en.md)
[![Chinese](https://img.shields.io/badge/Language-中文-red?style=for-the-badge)](./README.md)

[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/XinYaoDev/obsidian-rag-plugin?style=for-the-badge&color=orange)](https://github.com/XinYaoDev/obsidian-rag-plugin/releases)

</div>

---

This is an **RAG (Retrieval-Augmented Generation)** based personal knowledge assistant plugin for Obsidian.
It is not just a simple AI chat interface. By connecting to a local **Java Backend**, it transforms your Obsidian notes into a vector knowledge base, enabling precise Q&A based on your personal knowledge reserve.

> [!IMPORTANT] > **⚠️ Frontend-Backend Separation**
>
> This repository contains **Frontend (Obsidian Plugin)** code only.
> You must run the companion Backend service for it to work.
>
> 👉 **Backend Repository:** [**obsidian-rag-backend**](https://github.com/XinYaoDev/obsidian-rag-backend)

---

## ✨ Features

### 🧠 Core Capabilities

-   **Chat with Notes:** Utilizing RAG technology, the AI retrieves relevant information from your notes before answering. Let the AI truly "read" your books to avoid hallucinations.
-   **🚀 Deep Thinking Mode (CoT):**
    -   Integrated with **DeepSeek R1** / **Qwen QwQ** reasoning models.
    -   Provides an **independent toggle** to enable "Deep Thinking" with one click.
    -   Displays the AI's **Chain of Thought (CoT)**, showing not just the result, but the logical deduction process.
    -   _Collapsible UI for the thinking process to keep the interface clean._

### 💾 Session Management

-   **Conversation Persistence:** Chat history is automatically saved in `Assets/History/chat_history.json` within your Vault. Your data stays in your hands.
-   **Context Memory:** Automatically loads the last conversation context upon restarting Obsidian, supporting multi-turn dialogue.
-   **One-Click Reset:** A trash can icon allows you to clear history instantly and start a new topic.

### ⚙️ Flexibility & Intelligence

-   **Multi-Model Support:** Compatible with DeepSeek, Aliyun Qwen, OpenAI, Ollama, and other major providers.
-   **Smart Sync:** Listens for file changes (`modify`/`create`) and automatically syncs updates to the backend for vectorization. Built-in **Debounce** mechanism ensures compatibility with sync plugins like Remote Save.

---

## 📸 Screenshots

_(Placeholder for screenshot showing the sidebar chat, Deep Thinking toggle, and expanded reasoning block)_

---

## 🛠️ Installation

This project is currently in the development phase. It is recommended to install via source code.

### 1. Prerequisites

-   Ensure **Node.js (v16+)** is installed.
-   Ensure the **RAG Backend Service** is running (default port `8081`).

### 2. Development Mode Installation

1.  Navigate to your Obsidian plugin directory:
    ```bash
    cd <Your_Vault_Path>/.obsidian/plugins/
    ```
2.  Clone the repository:
    ```bash
    git clone [https://github.com/XinYaoDev/obsidian-rag-plugin.git](https://github.com/XinYaoDev/obsidian-rag-plugin.git) my-rag-plugin
    cd my-rag-plugin
    ```
3.  Install dependencies and start watching:
    ```bash
    npm install
    npm run dev
    ```
4.  Open Obsidian, go to **Settings -> Community Plugins**, and enable **RAG Assistant**.

---

## ⚙️ Configuration

After enabling the plugin, go to **Settings -> RAG Assistant**:

### Basic Settings

-   **Java Backend URL:** Default is `http://localhost:8081`.

### LLM Settings

-   **Provider:** Select `Aliyun` (Qwen), `DeepSeek`, etc.
-   **API Key:** Enter the API Key provided by your cloud vendor.
-   **Model Name:**
    -   _Standard Mode:_ Recommended `qwen-plus` or `deepseek-chat`.
    -   _Deep Thinking:_ Recommended `qwq-32b-preview` or `deepseek-reasoner` (requires backend support).

### Embedding Settings

-   **Model Name:** e.g., `text-embedding-v3` or `text-embedding-v1`.

---

## 🖥️ Usage Guide

1.  **Open Assistant:** Click the **🤖 Robot Icon** in the left ribbon.
2.  **Enable Deep Thinking:** (Optional) Toggle the **🧠 Deep Thinking** switch above the input box.
3.  **Ask Questions:** Type your question and press **Enter** to send.
4.  **Manage History:** Click the **🗑️ Trash Can** icon in the top toolbar to clear the current context.

---

## 📅 Roadmap

We are continuously improving the experience. Here is what's coming next:

-   [x] Basic RAG Conversation & Auto-Sync
-   [x] **Deep Thinking (CoT) Display & Toggle**
-   [x] **Conversation History Persistence**
-   [ ] **📋 One-Click Copy:** Support copying code blocks or full AI responses with one click.
-   [ ] **🛑 Stop Generation:** Button to interrupt AI output at any time.
-   [ ] **📝 Auto-Summary:** Automatically generate conversation titles based on chat content and display a history list in the sidebar.
-   [ ] **🌊 Streaming Response:** Optimize typewriter effect to reduce perceived latency.
-   [ ] **🔗 Source Citation:** Clickable citation badges in answers that jump to the corresponding note paragraph.

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

-   **Frontend Issues:** Please submit to this repository.
-   **Backend/Algo Issues:** Please submit to the [Backend Repository](https://github.com/XinYaoDev/obsidian-rag-backend).

## 📄 License

[MIT License](./LICENSE)
