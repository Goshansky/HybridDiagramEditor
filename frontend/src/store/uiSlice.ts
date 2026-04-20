import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type SelectedElementType = 'node' | 'edge';
export type UiTheme = 'light' | 'dark';

export interface UiState {
  selectedElementId: string | null;
  selectedElementType: SelectedElementType | null;
  gridSnap: boolean;
  theme: UiTheme;
}

const initialState: UiState = {
  selectedElementId: null,
  selectedElementType: null,
  gridSnap: true,
  theme:
    (typeof window !== 'undefined'
      ? (window.localStorage.getItem('ui_theme') as UiTheme | null)
      : null) ?? 'light',
};

function parseEdgeIndex(id: string): number | null {
  if (!id.startsWith('edge:')) return null;
  const n = Number.parseInt(id.slice('edge:'.length), 10);
  return Number.isFinite(n) ? n : null;
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSelectedNode(state, action: PayloadAction<string>) {
      state.selectedElementId = `node:${action.payload}`;
      state.selectedElementType = 'node';
    },
    setSelectedEdge(state, action: PayloadAction<number>) {
      state.selectedElementId = `edge:${action.payload}`;
      state.selectedElementType = 'edge';
    },
    setSelectedElement(
      state,
      action: PayloadAction<{ id: string; type: SelectedElementType }>,
    ) {
      state.selectedElementId = action.payload.id;
      state.selectedElementType = action.payload.type;
    },
    clearSelectedElement(state) {
      state.selectedElementId = null;
      state.selectedElementType = null;
    },
    setGridSnap(state, action: PayloadAction<boolean>) {
      state.gridSnap = action.payload;
    },
    toggleGridSnap(state) {
      state.gridSnap = !state.gridSnap;
    },
    setTheme(state, action: PayloadAction<UiTheme>) {
      state.theme = action.payload;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ui_theme', action.payload);
      }
    },
    toggleTheme(state) {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ui_theme', state.theme);
      }
    },
  },
});

export const {
  setSelectedNode,
  setSelectedEdge,
  setSelectedElement,
  clearSelectedElement,
  setGridSnap,
  toggleGridSnap,
  setTheme,
  toggleTheme,
} = uiSlice.actions;
export const uiReducer = uiSlice.reducer;

export function getSelectedNodeIdFromState(ui: UiState): string | null {
  if (ui.selectedElementType !== 'node' || !ui.selectedElementId?.startsWith('node:')) {
    return null;
  }
  return ui.selectedElementId.slice('node:'.length);
}

export function getSelectedEdgeIndexFromState(ui: UiState): number | null {
  if (ui.selectedElementType !== 'edge' || !ui.selectedElementId?.startsWith('edge:')) {
    return null;
  }
  return parseEdgeIndex(ui.selectedElementId);
}
