import { api } from './api';

export type DiagramType = 'flowchart' | 'class' | 'sequence' | 'er';

export interface DiagramDto {
  id: number;
  user_id: number;
  name: string;
  content: string;
  diagram_type: DiagramType;
  created_at: string;
  updated_at: string;
}

export interface VersionDto {
  id: number;
  diagram_id: number;
  content: string;
  version_number: number;
  created_at: string;
}

export async function listDiagrams(): Promise<DiagramDto[]> {
  const response = await api.get<DiagramDto[]>('/diagrams');
  return response.data;
}

export async function getDiagram(diagramId: number): Promise<DiagramDto> {
  const response = await api.get<DiagramDto>(`/diagrams/${diagramId}`);
  return response.data;
}

export async function createDiagram(payload: {
  name: string;
  type: DiagramType;
  content?: string;
}): Promise<DiagramDto> {
  const response = await api.post<DiagramDto>('/diagrams', payload);
  return response.data;
}

export async function updateDiagram(
  diagramId: number,
  payload: { name?: string; content?: string; diagram_type?: DiagramType },
): Promise<DiagramDto> {
  const response = await api.put<DiagramDto>(`/diagrams/${diagramId}`, payload);
  return response.data;
}

export async function renameDiagram(
  diagramId: number,
  payload: { name: string },
): Promise<DiagramDto> {
  const response = await api.put<DiagramDto>(`/diagrams/${diagramId}/rename`, payload);
  return response.data;
}

export async function deleteDiagram(diagramId: number): Promise<void> {
  await api.delete(`/diagrams/${diagramId}`);
}

export async function listVersions(diagramId: number): Promise<VersionDto[]> {
  const response = await api.get<VersionDto[]>(`/diagrams/${diagramId}/versions`);
  return response.data;
}
