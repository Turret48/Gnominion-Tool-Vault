# Tool Vault - Technical Steering & Architecture

## 1. Technology Stack
*   **Framework**: Next.js 14 (App Router) + React 18.
*   **Language**: TypeScript.
*   **Styling**: Tailwind CSS 3.4.x.
*   **Icons**: Lucide React.
*   **AI SDK**: `@google/genai` (Google Gemini API).
*   **Backend/Auth**: Firebase (Auth + Firestore).
*   **Build/Runtime**: ES Modules via `esm.sh` (in `index.html`) or Standard Next.js build.

## 2. Architecture Patterns
*   **Hybrid Rendering**: 
    *   `app/page.tsx`: Client-Side (`'use client'`) SPA handling UI state, filtering, and storage logic.
    *   `app/api/enrich/route.ts`: Server-Side API Route acting as a secure proxy for Gemini API calls to protect keys in production.
*   **Services Layer**:
    *   `services/geminiService.ts`: Handles AI interactions, falling back to Server API if client key is missing.
    *   `services/storageService.ts`: Abstraction layer for `localStorage` + Firestore, including global tool cache reads.
*   **Sync Logic**: 
    *   Upon authentication (`AuthContext`), the app checks for local tools.
    *   Users can explicitly trigger a "Sync Local to Cloud" action which pushes local data to Firestore and clears local storage.

## 3. AI Implementation Details (Gemini)
*   **Model**: `gemini-2.5-flash`.
*   **Method**: `ai.models.generateContent`.
*   **JSON Enforcement**:
    *   We use `responseSchema` and `responseMimeType: "application/json"` to force strict, type-safe JSON output.
*   **Prompting Strategy**:
    *   The system instruction forces the AI to act as a "Software Directory Curator."
    *   Strict Enum enforcement for `Category` and `PricingBucket`.
*   **Rate Limiting**:
    *   Per-user limits enforced server-side in `app/api/enrich/route.ts` (daily + per-minute).

## 4. Mobile & Responsive Strategy
*   **Breakpoints**:
    *   `lg` (1024px) is the boundary between Desktop (Sidebar) and Mobile (Drawer). `md` was too cramped for the sidebar.
*   **Native-Like Behaviors (Critical)**:
    *   **Disable Zoom**: `user-scalable=no` in meta tag AND `gesturestart` event listeners in JS to defeat iOS Safari override.
    *   **Disable Overscroll**: `overscroll-behavior-y: none` to prevent "bounce" effects.
    *   **Touch Action**: `touch-action: manipulation` globally to prevent double-tap zooms.
    *   **Input Zoom**: All inputs must use `text-base` (16px) on mobile viewports to prevent browser auto-zoom on focus.
    *   **Touch Targets**: Minimum padding of `py-3` / `p-3` for interactive elements on touch devices.

## 5. Design System
*   **Theme**: Dark Mode only (`class="dark"`).
*   **Palette**:
    *   Background: `#000000` (True Black).
    *   Surface: `#121212` / SurfaceHover: `#1E1E1E`.
    *   Border: `#27272A` (Zinc 800).
    *   Primary: `#EC4899` (Neon Pink).
*   **Typography**: Inter (System UI).

## 6. Coding Standards
*   **Components**: Single-file component structure in `page.tsx` is acceptable for this scale, but abstract if complexity grows.
*   **State**: Lifted state in `Page` component.
*   **Security**: Never expose API keys in client-side code unless explicitly intended for local dev (use `process.env` checks).
*   **Global Tool Cache**:
    *   Global metadata lives in `tools_global/{toolId}`.
    *   User-specific data lives in `users/{uid}/saved_tools/{toolId}` with optional `overrides`.
*   **Admin Edits**:
    *   Global edits are admin-only (email allowlist) and gated by admin toggle + confirm.
