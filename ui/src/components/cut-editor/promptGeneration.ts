import { dbTables } from '../../api/api';
import { PROMPT_COLUMNS } from './constants';

const GENERATED_PROMPT_ITEM_KEYS = [
  'prompt_situation',
  'prompt_hero',
  'prompt_camera',
  'prompt_detail',
  'prompt_negative',
] as const;

type GeneratedPromptItems = Record<(typeof GENERATED_PROMPT_ITEM_KEYS)[number], string>;

function parseGeneratedPromptAnswer(answer: unknown): unknown {
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
      throw new Error('프롬프트 생성 결과 JSON을 읽을 수 없습니다.');
    }
    try {
      return JSON.parse(trimmedAnswer.slice(jsonStart, jsonEnd + 1));
    } catch {
      throw new Error('프롬프트 생성 결과 JSON을 읽을 수 없습니다.');
    }
  }
}

function normalizeGeneratedPromptItems(parsedAnswer: unknown): GeneratedPromptItems {
  if (!parsedAnswer || typeof parsedAnswer !== 'object' || Array.isArray(parsedAnswer)) {
    throw new Error('프롬프트 생성 결과 형식이 올바르지 않습니다.');
  }

  const parsedPrompt = parsedAnswer as Record<keyof GeneratedPromptItems, unknown>;
  const nextGeneratedPrompt: GeneratedPromptItems = {
    prompt_situation: '',
    prompt_hero: '',
    prompt_camera: '',
    prompt_detail: '',
    prompt_negative: '',
  };

  for (const key of GENERATED_PROMPT_ITEM_KEYS) {
    const value = parsedPrompt[key];
    if (typeof value !== 'string') {
      throw new Error('프롬프트 생성 결과에 필요한 항목이 없습니다.');
    }
    nextGeneratedPrompt[key] = value.replace(/\r\n?/g, '\n').trim();
  }

  let remainingPositiveWords = 20;
  for (const column of PROMPT_COLUMNS) {
    const words = nextGeneratedPrompt[column.key].split(/\s+/).filter(Boolean);
    const keptWords = words.slice(0, remainingPositiveWords);
    nextGeneratedPrompt[column.key] = keptWords.join(' ');
    remainingPositiveWords = Math.max(0, remainingPositiveWords - keptWords.length);
  }

  if (!GENERATED_PROMPT_ITEM_KEYS.some((key) => nextGeneratedPrompt[key].length > 0)) {
    throw new Error('생성된 프롬프트 항목이 비어 있습니다.');
  }

  return nextGeneratedPrompt;
}

export async function generatePromptItemsFromScript(script: string): Promise<GeneratedPromptItems> {
  const answer: unknown = await dbTables.LlmUtil.ask({
    system_message: (
      'You convert cut scripts into English image prompt tags. ' +
      'Return only one valid JSON object with exactly these string fields: ' +
      'prompt_situation, prompt_hero, prompt_camera, prompt_detail, prompt_negative. ' +
      'Every value must be concise English comma-separated image prompt tags. ' +
      'The combined word count of prompt_situation, prompt_hero, prompt_camera, and prompt_detail must be 20 words or fewer. ' +
      'Use prompt_situation for story context and background. ' +
      'Use prompt_hero for visible character appearance, pose and action. ' +
      'Use prompt_camera for shot size, angle, lens, composition, lighting and mood. ' +
      'Use prompt_detail for props, clothing, texture, background details, and style details. ' +
      'Use prompt_negative for unwanted visual artifacts and exclusions. ' +
      'Do not include markdown, code fences, explanations, arrays, nested objects, or extra fields.'
    ),
    question: `Cut script:\n${script}\n\nReturn JSON now.`,
    max_tokens: 256,
    temperature: 0.2,
  });

  return normalizeGeneratedPromptItems(parseGeneratedPromptAnswer(answer));
}
