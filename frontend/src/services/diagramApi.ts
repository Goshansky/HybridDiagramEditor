import { api } from './api';

export interface DiagramDto {
  id: number;
  user_id: number;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
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
  content: string;
}): Promise<DiagramDto> {
  const response = await api.post<DiagramDto>('/diagrams', payload);
  return response.data;
}

export async function updateDiagram(
  diagramId: number,
  payload: { name?: string; content?: string },
): Promise<DiagramDto> {
  const response = await api.put<DiagramDto>(`/diagrams/${diagramId}`, payload);
  return response.data;
}
