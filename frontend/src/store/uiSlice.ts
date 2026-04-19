import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type SelectedElementType = 'node' | 'edge';

export interface UiState {
  selectedElementId: string | null;
  selectedElementType: SelectedElementType | null;
}

const initialState: UiState = {
  selectedElementId: null,
  selectedElementType: null,
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
    clearSelectedElement(state) {
      state.selectedElementId = null;
      state.selectedElementType = null;
    },
  },
});

export const { setSelectedNode, setSelectedEdge, clearSelectedElement } = uiSlice.actions;
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
