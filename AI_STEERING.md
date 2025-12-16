# Tool Vault - Technical Steering & Architecture

## 1. Technology Stack
*   **Framework**: React 19 (Client-Side SPA) + TypeScript.
*   **Styling**: Tailwind CSS.
*   **Icons**: Lucide React.
*   **AI SDK**: `@google/genai` (Google Gemini API).
*   **Build/Runtime**: standard HTML/ES Modules (no complex bundler required for this setup, uses `esm.sh` for imports in `index.html`).

## 2. Architecture Patterns
*   **Client-Side Only**: The app is serverless. All logic executes in the browser.
*   **Services Layer**:
    *   `services/geminiService.ts`: Handles all AI interactions.
    *   `services/storageService.ts`: Wraps `localStorage` and file I/O.
*   **State Management**: React `useState` / `useEffect` lifted to `App.tsx` (acting as the controller).

## 3. AI Implementation Details (Gemini)
*   **Model**: `gemini-2.5-flash`.
*   **Method**: `ai.models.generateContent`.
*   **JSON Enforcement**:
    *   We do **not** scrape websites. We rely on the model's internal knowledge base.
    *   We use `responseSchema` and `responseMimeType: "application/json"` to force strict, type-safe JSON output.
*   **Prompting Strategy**:
    *   The system instruction forces the AI to act as a "Software Directory Curator."
    *   Strict Enum enforcement for `Category` and `PricingBucket` to ensure filters work.

## 4. Image Handling Strategy
Since AI cannot reliably generate valid image URLs 100% of the time, we use a 3-layer fallback in the `ToolIcon` component:
1.  **AI Guess**: Try the URL returned by Gemini.
2.  **Favicon API**: If (1) fails, extract hostname and use `https://www.google.com/s2/favicons`.
3.  **Fallback**: If (1) and (2) fail, render a text-based placeholder.

## 5. Design System & CSS
*   **Theme**: Dark Mode only (`class="dark"` on html).
*   **Palette**:
    *   Background: `#000000` (True Black)
    *   Surface: `#121212`
    *   Border: `#27272A` (Zinc 800)
    *   Primary: `#EC4899` (Pink 500)
*   **Responsiveness**:
    *   Use `md:` prefix for desktop styles.
    *   Mobile layout uses a Drawer (Hamburger menu) instead of Sidebar.
    *   Inputs must be `16px` text size on mobile to prevent iOS zoom.

## 6. Coding Standards
*   **Types**: All data structures must be defined in `types.ts`.
*   **Components**: Keep components within `App.tsx` unless they grow too large.
*   **Icons**: Use `lucide-react`. consistently.
*   **Error Handling**: AI calls must be wrapped in `try/catch`. If AI fails, return a "skeleton" object so the user can still manually edit the tool.
