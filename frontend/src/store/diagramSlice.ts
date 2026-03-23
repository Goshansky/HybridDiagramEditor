import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface DiagramState {
  selectedDiagramId: number | null;
}

const initialState: DiagramState = {
  selectedDiagramId: null,
};

const diagramSlice = createSlice({
  name: 'diagram',
  initialState,
  reducers: {
    setSelectedDiagramId(state, action: PayloadAction<number | null>) {
      state.selectedDiagramId = action.payload;
    },
  },
});

export const { setSelectedDiagramId } = diagramSlice.actions;
export const diagramReducer = diagramSlice.reducer;
