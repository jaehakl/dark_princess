import { dbTables } from '../../api/api';

function normalizeGeneratedScript(answer: unknown) {
  if (typeof answer !== 'string') {
    throw new Error('스크립트 생성 결과 형식이 올바르지 않습니다.');
  }

  const normalizedAnswer = answer
    .replace(/\r\n?/g, '\n')
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  if (!normalizedAnswer) {
    throw new Error('생성된 스크립트가 비어 있습니다.');
  }

  return normalizedAnswer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export async function generateCutScript(previousSituation: string, currentSituation: string) {
  const answer: unknown = await dbTables.LlmUtil.ask({
    system_message: (
      'You write Korean visual-novel cut scripts. ' +
      'Use the previous situation as past context and the current situation as the present draft to continue from. ' +
      'Write from the first-person point of view, using Korean first-person narration such as 내가 or 나는. ' +
      'Describe what the viewpoint character sees, feels, thinks, and does from inside the scene. ' +
      'Avoid third-person narration for the viewpoint character. ' +
      'Return only the generated Korean script text, about 10 short lines separated by newline characters. ' +
      'Do not return markdown, code fences, explanations, numbering, bullets, titles, or labels.'
    ),
    question: [
      '이전 상황:',
      previousSituation.trim() || '(없음)',
      '',
      '현재 상황:',
      currentSituation.trim() || '(없음)',
      '',
      '위 내용을 이어서 컷 스크립트를 작성해 주세요.',
    ].join('\n'),
    max_tokens: 768,
    temperature: 0.75,
  });

  return normalizeGeneratedScript(answer);
}
