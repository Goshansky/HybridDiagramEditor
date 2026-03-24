import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DiagramType } from '../services/diagramApi';

export interface DiagramItem {
  id: number;
  name: string;
  updatedAt: string;
  diagramType?: DiagramType;
}

export interface ProjectItem {
  id: number;
  name: string;
  updatedAt: string;
  diagramType: DiagramType;
  versionsCount: number;
}

export interface DiagramVersionItem {
  id: number;
  diagramId: number;
  versionNumber: number;
  createdAt: string;
  content: string;
}

interface DiagramState {
  selectedDiagramId: number | null;
  items: DiagramItem[];
  currentDiagramType: DiagramType;
  projects: ProjectItem[];
  versions: DiagramVersionItem[];
}

const initialState: DiagramState = {
  selectedDiagramId: null,
  items: [],
  currentDiagramType: 'flowchart',
  projects: [],
  versions: [],
};

const diagramSlice = createSlice({
  name: 'diagram',
  initialState,
  reducers: {
    setDiagrams(state, action: PayloadAction<DiagramItem[]>) {
      state.items = action.payload;
      state.projects = action.payload.map((item) => ({
        id: item.id,
        name: item.name,
        updatedAt: item.updatedAt,
        diagramType: item.diagramType ?? 'flowchart',
        versionsCount: 0,
      }));
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

      const project: ProjectItem = {
        id: action.payload.id,
        name: action.payload.name,
        updatedAt: action.payload.updatedAt,
        diagramType: action.payload.diagramType ?? 'flowchart',
        versionsCount:
          state.projects.find((item) => item.id === action.payload.id)?.versionsCount ?? 0,
      };
      const projectIdx = state.projects.findIndex((item) => item.id === action.payload.id);
      if (projectIdx >= 0) {
        state.projects[projectIdx] = project;
      } else {
        state.projects.unshift(project);
      }
    },
    setSelectedDiagramId(state, action: PayloadAction<number | null>) {
      state.selectedDiagramId = action.payload;
    },
    setCurrentDiagramType(state, action: PayloadAction<DiagramType>) {
      state.currentDiagramType = action.payload;
    },
    setProjects(state, action: PayloadAction<ProjectItem[]>) {
      state.projects = action.payload;
    },
    upsertProject(state, action: PayloadAction<ProjectItem>) {
      const idx = state.projects.findIndex((item) => item.id === action.payload.id);
      if (idx >= 0) {
        state.projects[idx] = action.payload;
      } else {
        state.projects.unshift(action.payload);
      }
    },
    removeProject(state, action: PayloadAction<number>) {
      state.projects = state.projects.filter((item) => item.id !== action.payload);
      state.items = state.items.filter((item) => item.id !== action.payload);
      if (state.selectedDiagramId === action.payload) {
        state.selectedDiagramId = null;
      }
    },
    setVersions(state, action: PayloadAction<DiagramVersionItem[]>) {
      state.versions = action.payload;
    },
    clearVersions(state) {
      state.versions = [];
    },
  },
});

export const {
  setDiagrams,
  upsertDiagram,
  setSelectedDiagramId,
  setCurrentDiagramType,
  setProjects,
  upsertProject,
  removeProject,
  setVersions,
  clearVersions,
} = diagramSlice.actions;
export const diagramReducer = diagramSlice.reducer;
