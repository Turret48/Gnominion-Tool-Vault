# Tool Vault - Application Context

## 1. Product Vision
**Tool Vault** is a private, "desktop-first" yet fully mobile-optimized personal knowledge base designed for developers and tech enthusiasts. It serves as a smart, automated alternative to browser bookmarks for tracking software tools, libraries, and SaaS products.

## 2. Core Goals
*   **Eliminate Manual Data Entry**: Remove the friction of saving a tool. Users simply input a name or URL, and the app does the rest using AI.
*   **Personal Knowledge Management (PKM)**: Provide a dedicated space for private, structured notes (e.g., "How I use this," "Gotchas") rather than just storing a link.
*   **Privacy & Ownership**: Data ownership is paramount. Users can choose between local storage (default) or their own private cloud via Firebase, with a seamless sync path.
*   **Aesthetics**: A high-contrast, "True Black & Neon Pink" UI that feels like a premium developer tool.

## 3. Key Features
### A. AI-Powered Auto-Enrichment
When a user adds a tool (e.g., "Zapier" or "https://figma.com"):
*   The app uses **Google Gemini 2.5 Flash** to analyze the tool.
*   It automatically populates: Name, Summary, Category, Pricing Model, Best Use Cases, Tags, and Integrations.
*   It attempts to find a logo and the official website URL.

### B. Organization
*   **Categories**: Dynamic categories (managed by the user).
*   **Search**: Real-time filtering by name, tag, description, and notes.
*   **Views**: Toggle between a visual Grid view (cards) and a compact List view.

### C. Knowledge Base
*   A document-style detail view for every tool.
*   Structured fields for personal notes: "What it does," "When to use," "How to use," and "Links."
*   Markdown support for all note fields.

### D. Data Management
*   **Hybrid Storage**:
    *   **Local Mode**: Uses `localStorage` for guests.
    *   **Cloud Mode**: Syncs with user's private Firebase Firestore instance upon login.
*   **Sync Workflow**: When a guest logs in, they are prompted to upload their local tools to the cloud, merging their data.
*   **Portability**: JSON Import/Export with smart duplicate detection.
*   **Safety**: Explicit delete confirmation modals to prevent accidental data loss.

## 4. User Experience
*   **Desktop (LG+)**: Fixed sidebar navigation, large grid layout, optimized for mouse/keyboard.
*   **Mobile/Tablet (<LG)**: 
    *   Slide-out drawer navigation (Hamburger menu).
    *   **Native-App Feel**: Pinch-to-zoom is disabled, rubber-banding (overscroll) is disabled, and text selection is blocked on UI elements to prevent "web-like" clumsiness.
    *   **Touch Optimization**: 16px minimum font size on inputs to prevent iOS auto-zoom, larger touch targets (44px+) for buttons.
*   **Interaction**: Fast, client-side interactions with glassmorphism effects and smooth transitions.
