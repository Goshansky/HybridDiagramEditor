import { api } from './api';
import type { DiagramType } from './diagramApi';

export interface ProjectDto {
  id: number;
  name: string;
  diagram_type: DiagramType;
  updated_at: string;
  versions_count: number;
}

export async function listProjects(): Promise<ProjectDto[]> {
  const response = await api.get<ProjectDto[]>('/projects');
  return response.data;
}
