import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface DiagramItem {
  id: number;
  name: string;
  updatedAt: string;
}

interface DiagramState {
  selectedDiagramId: number | null;
  items: DiagramItem[];
}

const initialState: DiagramState = {
  selectedDiagramId: null,
  items: [],
};

const diagramSlice = createSlice({
  name: 'diagram',
  initialState,
  reducers: {
    setDiagrams(state, action: PayloadAction<DiagramItem[]>) {
      state.items = action.payload;
      if (
        state.selectedDiagramId !== null &&
        !action.payload.some((item) => item.id === state.selectedDiagramId)
      ) {
        state.selectedDiagramId = null;
      }
    },
    upsertDiagram(state, action: PayloadAction<DiagramItem>) {
      const idx = state.items.findIndex((item) => item.id === action.payload.id);
      if (idx >= 0) {
        state.items[idx] = action.payload;
      } else {
        state.items.unshift(action.payload);
      }
    },
    setSelectedDiagramId(state, action: PayloadAction<number | null>) {
      state.selectedDiagramId = action.payload;
    },
  },
});

export const { setDiagrams, upsertDiagram, setSelectedDiagramId } =
  diagramSlice.actions;
export const diagramReducer = diagramSlice.reducer;
