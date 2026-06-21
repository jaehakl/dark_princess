// YOU MUST OPEN ALL FRONTEND SOURCE FILES with UTF-8 ENCODING to READ KOREAN CHARACTERS CORRECTLY.

import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

export const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

type HttpMethod = 'get' | 'post' | 'delete';
type RequestOptions = Omit<AxiosRequestConfig, 'method' | 'url' | 'data'> & {
  fallbackMessage?: string;
};

const apiClient = axios.create({
  baseURL: API_URL,
});

async function readErrorDetail(data: unknown) {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail?: unknown }).detail;
    return typeof detail === 'string' && detail ? detail : null;
  }
  if (data instanceof Blob) {
    try {
      return readErrorDetail(JSON.parse(await data.text()));
    } catch {
      return null;
    }
  }
  if (typeof data === 'string') {
    try {
      return readErrorDetail(JSON.parse(data));
    } catch {
      return null;
    }
  }
  return null;
}

async function sendResponse<T>(
  method: HttpMethod,
  url: string,
  data?: unknown,
  options: RequestOptions = {},
): Promise<AxiosResponse<T>> {
  const { fallbackMessage, ...requestOptions } = options;
  try {
    return await apiClient.request<T>({
      ...requestOptions,
      method,
      url,
      ...(data === undefined ? {} : { data }),
    });
  } catch (error) {
    if (!fallbackMessage) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      const detail = await readErrorDetail(error.response?.data);
      throw new Error(detail ?? fallbackMessage);
    }
    throw error instanceof Error ? error : new Error(fallbackMessage);
  }
}

export async function request<T>(
  method: HttpMethod,
  url: string,
  data?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const response = await sendResponse<T>(method, url, data, options);
  return response.data;
}

export async function requestResponse<T>(
  method: HttpMethod,
  url: string,
  data?: unknown,
  options?: RequestOptions,
): Promise<AxiosResponse<T>> {
  return await sendResponse<T>(method, url, data, options);
}
