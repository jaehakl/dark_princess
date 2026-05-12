// YOU MUST OPEN ALL FRONTEND SOURCE FILES with UTF-8 ENCODING to READ KOREAN CHARACTERS CORRECTLY.

import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

type HttpMethod = 'get' | 'post' | 'delete';

const apiClient = axios.create({
  baseURL: API_URL,
});

async function send<T>(method: HttpMethod, url: string, data?: unknown): Promise<T> {
  const response = await apiClient.request<T>({
    method,
    url,
    ...(data === undefined ? {} : { data }),
  });

  return response.data;
}

export async function request<T>(
  method: HttpMethod,
  url: string,
  data?: unknown,
): Promise<T> {
  return await send<T>(method, url, data);
}
