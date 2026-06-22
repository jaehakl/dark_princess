import { dbTables } from '../../api/api';

const HANGUL_RE = /[\uac00-\ud7a3]/;

function parseTranslationAnswer(answer: unknown): unknown {
  if (typeof answer !== 'string') {
    return answer;
  }

  const trimmedAnswer = answer.trim();
  try {
    return JSON.parse(trimmedAnswer);
  } catch {
    const jsonStart = trimmedAnswer.indexOf('{');
    const jsonEnd = trimmedAnswer.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      throw new Error('번역 결과 JSON을 읽을 수 없습니다.');
    }
    try {
      return JSON.parse(trimmedAnswer.slice(jsonStart, jsonEnd + 1));
    } catch {
      throw new Error('번역 결과 JSON을 읽을 수 없습니다.');
    }
  }
}

function normalizeTranslations(payload: unknown, expectedCount: number): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('번역 결과 형식이 올바르지 않습니다.');
  }

  const payloadKeys = Object.keys(payload);
  if (payloadKeys.length !== 1 || payloadKeys[0] !== 'translations') {
    throw new Error('번역 결과 형식이 올바르지 않습니다.');
  }

  const translations = (payload as { translations?: unknown }).translations;
  if (!Array.isArray(translations) || translations.length !== expectedCount) {
    throw new Error('번역 결과 개수를 확인할 수 없습니다.');
  }

  const normalized = translations.map((translation) => {
    if (typeof translation !== 'string') {
      throw new Error('번역 결과 형식이 올바르지 않습니다.');
    }
    const value = translation.replace(/\r\n?/g, '\n').trim();
    if (value && HANGUL_RE.test(value)) {
      throw new Error('번역 결과에 한국어가 포함되어 있습니다.');
    }
    return value;
  });

  if (!normalized.some((translation) => translation.length > 0)) {
    throw new Error('번역된 텍스트가 없습니다.');
  }

  return normalized;
}

export async function translatePromptTexts(texts: string[]): Promise<string[]> {
  const trimmedTexts = texts.map((text) => text.trim());
  if (trimmedTexts.length === 0 || trimmedTexts.some((text) => text.length === 0)) {
    throw new Error('번역할 텍스트를 입력해 주세요.');
  }

  const answer: unknown = await dbTables.LlmUtil.ask({
    system_message: (
      'You translate Korean image prompt inputs into concise English image prompt tags. ' +
      'Return only one valid JSON object with exactly one field named translations. ' +
      'translations must be an array of strings with the same length and order as the input texts. ' +
      'Each string must be concise English comma-separated image prompt tags. ' +
      'Do not include Korean, markdown, code fences, explanations, labels, metadata, arrays outside translations, or extra fields.'
    ),
    question: `Input texts JSON:\n${JSON.stringify(trimmedTexts)}\n\nReturn JSON now.`,
    max_tokens: 512,
    temperature: 0.2,
  });

  return normalizeTranslations(parseTranslationAnswer(answer), trimmedTexts.length);
}
