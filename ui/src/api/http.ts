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

async function readErrorData(data: unknown): Promise<unknown> {
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      return JSON.parse(text);
    } catch {
      return text || null;
    }
  }
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data || null;
    }
  }
  return data ?? null;
}

function stringifyDetail(detail: unknown) {
  if (typeof detail === 'string') {
    return detail || null;
  }
  if (detail === null || detail === undefined) {
    return null;
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

async function readErrorPayload(data: unknown) {
  const parsedData = await readErrorData(data);
  let detail: string | null = null;

  if (parsedData && typeof parsedData === 'object' && 'detail' in parsedData) {
    detail = stringifyDetail((parsedData as { detail?: unknown }).detail);
  }

  return { detail, responseData: parsedData };
}

function logApiError(
  method: HttpMethod,
  url: string,
  error: unknown,
  detail: string | null,
  responseData: unknown,
) {
  if (!axios.isAxiosError(error)) {
    return;
  }
  console.error('[API request failed]', {
    method,
    url,
    status: error.response?.status ?? null,
    statusText: error.response?.statusText ?? null,
    detail,
    responseData,
  });
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
    if (axios.isAxiosError(error)) {
      const { detail, responseData } = await readErrorPayload(error.response?.data);
      logApiError(method, url, error, detail, responseData);
      throw new Error(detail ?? fallbackMessage ?? error.message);
    }
    throw error instanceof Error ? error : new Error(fallbackMessage ?? '요청에 실패했습니다.');
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
