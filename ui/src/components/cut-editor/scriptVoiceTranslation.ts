import { dbTables } from '../../api/api';

function normalizeTranslatedScript(answer: unknown) {
  if (typeof answer !== 'string') {
    throw new Error('번역 결과 형식이 올바르지 않습니다.');
  }

  const translatedScript = answer
    .replace(/\r\n?/g, '\n')
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  if (!translatedScript) {
    throw new Error('번역 결과가 비어 있습니다.');
  }

  return translatedScript
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export async function translateCutScriptToJapanese(script: string) {
  const trimmedScript = script.trim();
  if (!trimmedScript) {
    throw new Error('번역할 컷 스크립트를 입력해 주세요.');
  }

  const answer: unknown = await dbTables.LlmUtil.ask({
    system_message: (
      'You translate Korean visual-novel cut scripts into natural Japanese. ' +
      'Keep the original point of view, emotional nuance, line breaks, and spoken/narrative tone. ' +
      'Return only the translated Japanese script text. ' +
      'Do not return Korean, markdown, code fences, explanations, numbering, bullets, titles, or labels.'
    ),
    question: [
      'Korean cut script:',
      trimmedScript,
      '',
      'Translate the cut script into Japanese now.',
    ].join('\n'),
    max_tokens: 1024,
    temperature: 0.2,
  });

  return normalizeTranslatedScript(answer);
}
