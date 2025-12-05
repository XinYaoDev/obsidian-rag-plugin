# Obsidian RAG Assistant (Frontend)

<div align="center">

[![Language](https://img.shields.io/badge/Language-中文-blue?style=for-the-badge)](./README_CN.md)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

</div>

**Obsidian RAG Assistant** is a plugin based on RAG (Retrieval-Augmented Generation) architecture. It connects your Obsidian vault to a local Java backend, transforming your notes into a vector knowledge base to enable precise Q&A based on your personal knowledge reserve.

> [!IMPORTANT] > **Separation of Frontend and Backend:**
> This repository contains **only the Frontend (Obsidian Plugin) code**.
> You must run the accompanying backend service for it to work:
> 👉 **Backend Repository:** [https://github.com/XinYaoDev/obsidian-rag-backend](https://github.com/XinYaoDev/obsidian-rag-backend)

## ✨ Features

-   **🧠 Knowledge Base Chat:** Perform RAG-based Q&A with your notes. Let AI truly "read" your books.
-   **💾 Conversation Persistence:**
    -   Chat history is automatically saved in `Vault/Assets/History/chat_history.json`.
    -   Context is automatically loaded upon restarting Obsidian, supporting multi-turn conversations.
    -   Supports one-click history clearing.
-   **⚙️ Flexible Configuration:**
    -   Supports multiple LLM providers (DeepSeek, Aliyun Qwen, OpenAI, Ollama, etc.).
    -   Customizable API Keys and Backend URLs.
-   **🔄 Smart Sync:**
    -   Listens for file changes (`modify`/`create`) and automatically syncs note updates to the backend for vectorization.
    -   Built-in **debounce** and user behavior detection to avoid unnecessary syncs caused by plugin conflicts (e.g., Remote Save).

## 🛠️ Installation

Since this project is currently in the development phase, installation via source code is recommended.

### Prerequisites

-   **Node.js (v16+)** installed.
-   **RAG Backend Service** started (Default port: `8081`).

### Development Mode Installation (Recommended)

1.  Clone this repository into your Obsidian plugins directory:

    ```bash
    cd <Your_Obsidian_Vault_Path>/.obsidian/plugins/
    git clone [https://github.com/XinYaoDev/obsidian-rag-plugin.git](https://github.com/XinYaoDev/obsidian-rag-plugin.git) my-rag-plugin
    cd my-rag-plugin
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Start Watch Mode:

    ```bash
    npm run dev
    ```

    _Code changes will now automatically compile and sync to Obsidian._

4.  Open Obsidian and enable **RAG Assistant** in **Settings -> Community Plugins**.

## ⚙️ Configuration

Once enabled, go to **Settings -> RAG Assistant Configuration**:

1.  **Java Backend URL:** Default is `http://localhost:8081` (Ensure backend is running).
2.  **LLM Settings:**
    -   **Provider:** e.g., `Aliyun` (Qwen) or `DeepSeek`.
    -   **API Key:** Enter the API Key from your provider.
    -   **Model Name:** e.g., `qwen-turbo` or `deepseek-chat`.
3.  **Embedding Settings:**
    -   **Provider:** e.g., `Aliyun`.
    -   **API Key:** Enter your API Key.
    -   **Model Name:** e.g., `text-embedding-v1`.

## 🖥️ Usage

1.  Click the **🤖 Robot Icon** in the left sidebar (Ribbon) to open the Assistant panel.
2.  Type your question in the input box at the bottom and press **Enter** to send (Press **Shift+Enter** for a new line).
3.  Click the **Trash Can Icon** at the top to clear the current history.

## 📅 Roadmap

-   [ ] Streaming Response (SSE)
-   [ ] UI Polish & Theming

## 🤝 Contributing

Issues and Pull Requests are welcome!

-   **Frontend Issues:** Please submit to this repository.
-   **Backend/Algorithm Issues:** Please submit to the [Backend Repository](https://github.com/XinYaoDev/obsidian-rag-backend).

## 📄 License

[MIT License](./LICENSE)
