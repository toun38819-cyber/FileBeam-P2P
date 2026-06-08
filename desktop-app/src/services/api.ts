import axios from 'axios';
const getBaseURL = async (): Promise<string> => `http://127.0.0.1:${(await window.filebeam.server.getPort()) ?? 8765}`;
export const api = {
  async get<T>(path: string): Promise<T> { const response = await axios.get<T>(`${await getBaseURL()}${path}`); return response.data; },
  async post<T>(path: string, payload: unknown): Promise<T> { const response = await axios.post<T>(`${await getBaseURL()}${path}`, payload); return response.data; }
};
