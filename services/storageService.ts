import { Tool } from "../types";

const STORAGE_KEY = 'tool_vault_v1';

export const saveTools = (tools: Tool[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
  } catch (e) {
    console.error("Failed to save to localStorage", e);
  }
};

export const loadTools = (): Tool[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load from localStorage", e);
    return [];
  }
};

export const exportData = (tools: Tool[]) => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tools, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "tool_vault_backup.json");
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};
