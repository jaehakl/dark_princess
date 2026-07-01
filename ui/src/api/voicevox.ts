export type VoicevoxStyle = {
  id: number;
  name: string;
  type?: string;
};

export type VoicevoxSpeaker = {
  name: string;
  speaker_uuid: string;
  styles: VoicevoxStyle[];
};

type VoicevoxAudioQuery = Record<string, unknown>;

export const VOICEVOX_API_URL = (
  import.meta.env.VITE_PUBLIC_VOICEVOX_API_BASE_URL || 'http://localhost:50021'
).replace(/\/+$/, '');

async function readErrorText(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    const payload = JSON.parse(text);
    if (payload && typeof payload === 'object' && 'detail' in payload) {
      return String((payload as { detail?: unknown }).detail);
    }
  } catch {
    return text;
  }
  return text;
}

async function requestVoicevoxResponse(path: string, init: RequestInit, fallbackMessage: string) {
  let response: Response;
  try {
    response = await fetch(`${VOICEVOX_API_URL}${path}`, init);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error(fallbackMessage);
  }

  if (!response.ok) {
    throw new Error(await readErrorText(response) ?? fallbackMessage);
  }

  return response;
}

export const voicevoxApi = {
  async speakers() {
    const response = await requestVoicevoxResponse('/speakers', {}, 'VOICEVOX 성우 목록을 불러오지 못했습니다.');
    return await response.json() as VoicevoxSpeaker[];
  },

  async audioQuery(text: string, speaker: number) {
    const params = new URLSearchParams({
      text,
      speaker: String(speaker),
    });
    const response = await requestVoicevoxResponse(
      `/audio_query?${params.toString()}`,
      { method: 'POST' },
      'VOICEVOX 음성 쿼리 생성에 실패했습니다.',
    );
    return await response.json() as VoicevoxAudioQuery;
  },

  async synthesis(query: VoicevoxAudioQuery, speaker: number) {
    const params = new URLSearchParams({
      speaker: String(speaker),
    });
    const response = await requestVoicevoxResponse(
      `/synthesis?${params.toString()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      },
      'VOICEVOX 음성 생성에 실패했습니다.',
    );
    return await response.blob();
  },
};
