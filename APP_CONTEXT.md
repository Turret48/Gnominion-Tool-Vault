# Tool Vault - Application Context

## 1. Product Vision
**Tool Vault** is a private, "desktop-first" (but mobile-optimized) personal knowledge base designed for developers and tech enthusiasts. It serves as a smart, automated alternative to browser bookmarks for tracking software tools, libraries, and SaaS products.

## 2. Core Goals
*   **Eliminate Manual Data Entry**: Remove the friction of saving a tool. Users simply input a name or URL, and the app does the rest.
*   **Personal Knowledge Management (PKM)**: Provide a dedicated space for private, structured notes (e.g., "How I use this," "Gotchas") rather than just storing a link.
*   **Privacy & Ownership**: All data lives locally in the user's browser. There is no login, no tracking, and no remote database. Users own their data via JSON export.
*   **Aesthetics**: A high-contrast, "True Black & Neon Pink" UI that feels like a premium developer tool.

## 3. Key Features
### A. AI-Powered Auto-Enrichment
When a user adds a tool (e.g., "Zapier" or "https://figma.com"):
*   The app uses **Google Gemini 2.5 Flash** to analyze the tool.
*   It automatically populates: Name, Summary, Category, Pricing Model, Best Use Cases, Tags, and Integrations.
*   It attempts to find a logo and the official website URL.

### B. Organization
*   **Categories**: Tools are strictly categorized (Automation, AI, Dev, Design, etc.).
*   **Search**: Real-time filtering by name, tag, description, and notes.
*   **Views**: Toggle between a visual Grid view (cards) and a compact List view.

### C. Knowledge Base
*   A document-style detail view for every tool.
*   Structured fields for personal notes: "What it does," "When to use," "How to use," and "Links."

### D. Data Management
*   **Persistence**: `localStorage` handles saving state.
*   **Portability**: JSON Import/Export with smart duplicate detection.

## 4. User Experience
*   **Desktop**: Fixed sidebar navigation, large grid layout.
*   **Mobile**: Slide-out drawer navigation, compact lists, touch-friendly inputs.
*   **Interaction**: Fast, client-side interactions with glassmorphism effects and smooth transitions.
