import { useEffect, useMemo, useRef, useState } from 'react';
import { voicevoxApi } from '../../api/voicevox';
import type { VoicevoxSpeaker, VoicevoxStyle } from '../../api/voicevox';
import {
  Button,
  FieldLabel,
  FormControl,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
} from '../ui';
import { translateCutScriptToJapanese } from './scriptVoiceTranslation';

type ActiveTask = 'load-speakers' | 'translate' | 'generate' | 'run-all';

type CutVoicevoxModalProps = {
  script: string;
  onClose: () => void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function getSelectableStyles(speaker: VoicevoxSpeaker | null) {
  if (!speaker) {
    return [];
  }

  const talkStyles = speaker.styles.filter((style) => style.type === undefined || style.type === 'talk');
  return talkStyles.length > 0 ? talkStyles : speaker.styles;
}

function getDefaultStyleId(speaker: VoicevoxSpeaker | null) {
  return getSelectableStyles(speaker)[0]?.id ?? null;
}

function getStyleLabel(style: VoicevoxStyle) {
  return style.type && style.type !== 'talk'
    ? `${style.name} (${style.type})`
    : style.name;
}

export function CutVoicevoxModal({ script, onClose }: CutVoicevoxModalProps) {
  const sourceScript = script.trim();
  const [speakers, setSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [selectedSpeakerUuid, setSelectedSpeakerUuid] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);
  const [japaneseText, setJapaneseText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveTask | null>('load-speakers');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const selectedSpeaker = useMemo(
    () => speakers.find((speaker) => speaker.speaker_uuid === selectedSpeakerUuid) ?? null,
    [selectedSpeakerUuid, speakers],
  );
  const selectableStyles = useMemo(() => getSelectableStyles(selectedSpeaker), [selectedSpeaker]);
  const isBusy = activeTask !== null;
  const hasSpeakers = speakers.length > 0 && selectedStyleId !== null;
  const canTranslate = sourceScript.length > 0 && !isBusy;
  const canGenerateAudio = japaneseText.trim().length > 0 && hasSpeakers && !isBusy;
  const canRunAll = sourceScript.length > 0 && hasSpeakers && !isBusy;
  const canPlayAudio = audioUrl !== null && !isBusy;

  function clearAudio(updateState = true) {
    audioRef.current?.pause();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (updateState) {
      setAudioUrl(null);
    }
  }

  function replaceAudioBlob(blob: Blob) {
    clearAudio();
    const nextUrl = URL.createObjectURL(blob);
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
    return nextUrl;
  }

  function playAudioUrl(url: string) {
    const audio = audioRef.current;
    if (!audio) {
      void new Audio(url).play().catch(() => {});
      return;
    }

    audio.src = url;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadSpeakers() {
      setActiveTask('load-speakers');
      setError(null);
      try {
        const nextSpeakers = await voicevoxApi.speakers();
        if (isCancelled) {
          return;
        }

        const firstSpeaker = nextSpeakers.find((speaker) => getSelectableStyles(speaker).length > 0) ?? null;
        setSpeakers(nextSpeakers);
        setSelectedSpeakerUuid(firstSpeaker?.speaker_uuid ?? '');
        setSelectedStyleId(getDefaultStyleId(firstSpeaker));
        setStatusMessage(nextSpeakers.length > 0 ? null : '사용 가능한 VOICEVOX 성우가 없습니다.');
      } catch (loadError) {
        if (!isCancelled) {
          setError(getErrorMessage(loadError));
          setStatusMessage(null);
        }
      } finally {
        if (!isCancelled) {
          setActiveTask(null);
        }
      }
    }

    void loadSpeakers();
    return () => {
      isCancelled = true;
      clearAudio(false);
    };
  }, []);

  function selectSpeaker(speakerUuid: string) {
    const nextSpeaker = speakers.find((speaker) => speaker.speaker_uuid === speakerUuid) ?? null;
    setSelectedSpeakerUuid(speakerUuid);
    setSelectedStyleId(getDefaultStyleId(nextSpeaker));
    setStatusMessage(null);
    setError(null);
    clearAudio();
  }

  function selectStyle(styleId: string) {
    const nextStyleId = Number(styleId);
    setSelectedStyleId(Number.isFinite(nextStyleId) ? nextStyleId : null);
    setStatusMessage(null);
    setError(null);
    clearAudio();
  }

  async function translateScript() {
    return await translateCutScriptToJapanese(sourceScript);
  }

  async function generateAudio(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('일본어 번역 결과를 입력해 주세요.');
    }
    if (selectedStyleId === null) {
      throw new Error('성우와 톤을 선택해 주세요.');
    }

    const query = await voicevoxApi.audioQuery(trimmedText, selectedStyleId);
    const blob = await voicevoxApi.synthesis(query, selectedStyleId);
    return replaceAudioBlob(blob);
  }

  async function handleTranslate() {
    setActiveTask('translate');
    setError(null);
    setStatusMessage(null);
    try {
      const translatedScript = await translateScript();
      clearAudio();
      setJapaneseText(translatedScript);
      setStatusMessage('번역 완료');
    } catch (translateError) {
      setError(getErrorMessage(translateError));
    } finally {
      setActiveTask(null);
    }
  }

  async function handleGenerateAudio() {
    setActiveTask('generate');
    setError(null);
    setStatusMessage(null);
    try {
      await generateAudio(japaneseText);
      setStatusMessage('음성 생성 완료');
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    } finally {
      setActiveTask(null);
    }
  }

  async function handleRunAll() {
    setActiveTask('run-all');
    setError(null);
    setStatusMessage(null);
    try {
      const translatedScript = await translateScript();
      setJapaneseText(translatedScript);
      const nextAudioUrl = await generateAudio(translatedScript);
      setStatusMessage('번역과 음성 생성 완료');
      playAudioUrl(nextAudioUrl);
    } catch (runError) {
      setError(getErrorMessage(runError));
    } finally {
      setActiveTask(null);
    }
  }

  return (
    <ModalBackdrop role="presentation" topAligned>
      <Panel
        role="dialog"
        aria-modal="true"
        className="max-h-[calc(100dvh-3rem)] w-[min(58rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <PanelHeader className="flex-wrap items-start">
          <div className="min-w-0">
            <p className="text-[0.8rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">VOICEVOX</p>
            <h2 className="text-base font-semibold text-[#fff7ef]">일본어 음성 프리뷰</h2>
          </div>
          <Button className="px-3 py-2 text-xs" onClick={onClose} disabled={activeTask === 'run-all'}>
            닫기
          </Button>
        </PanelHeader>
        <SectionBody className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <FieldLabel>원문 스크립트</FieldLabel>
              <pre className="min-h-56 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-[rgba(255,196,214,0.28)] bg-[rgba(9,3,14,0.76)] p-3 text-sm leading-6 text-[var(--app-text)]">
                {sourceScript || '표시할 스크립트가 없습니다.'}
              </pre>
            </div>
            <div className="min-w-0 space-y-2">
              <FieldLabel>일본어 번역</FieldLabel>
              <FormControl
                as="textarea"
                rows={10}
                value={japaneseText}
                onChange={(event) => {
                  setJapaneseText(event.target.value);
                  setStatusMessage(null);
                  setError(null);
                  clearAudio();
                }}
                className="min-h-56 w-full resize-y px-3 py-2 text-sm leading-6"
                disabled={activeTask === 'translate' || activeTask === 'run-all'}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <FieldLabel>성우</FieldLabel>
              <FormControl
                as="select"
                value={selectedSpeakerUuid}
                onChange={(event) => selectSpeaker(event.target.value)}
                className="h-10 w-full px-3 text-sm"
                disabled={isBusy || speakers.length === 0}
              >
                <option value="">성우 선택</option>
                {speakers.map((speaker) => (
                  <option key={speaker.speaker_uuid} value={speaker.speaker_uuid}>
                    {speaker.name}
                  </option>
                ))}
              </FormControl>
            </div>
            <div className="min-w-0 space-y-2">
              <FieldLabel>톤</FieldLabel>
              <FormControl
                as="select"
                value={selectedStyleId ?? ''}
                onChange={(event) => selectStyle(event.target.value)}
                className="h-10 w-full px-3 text-sm"
                disabled={isBusy || selectableStyles.length === 0}
              >
                <option value="">톤 선택</option>
                {selectableStyles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {getStyleLabel(style)}
                  </option>
                ))}
              </FormControl>
            </div>
          </div>

          {audioUrl ? (
            <audio ref={audioRef} src={audioUrl} controls className="w-full" />
          ) : (
            <div className="grid min-h-12 place-items-center rounded-[8px] border border-[rgba(255,196,214,0.2)] bg-[rgba(9,3,14,0.42)] text-xs font-semibold text-[var(--app-muted)]">
              생성된 음성이 없습니다.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={() => void handleTranslate()}
              disabled={!canTranslate}
            >
              {activeTask === 'translate' ? <Spinner aria-hidden="true" /> : null}
              {activeTask === 'translate' ? '번역 중' : '번역'}
            </Button>
            <Button
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={() => void handleGenerateAudio()}
              disabled={!canGenerateAudio}
            >
              {activeTask === 'generate' ? <Spinner aria-hidden="true" /> : null}
              {activeTask === 'generate' ? '생성 중' : '음성 생성'}
            </Button>
            <Button
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={() => audioUrlRef.current ? playAudioUrl(audioUrlRef.current) : undefined}
              disabled={!canPlayAudio}
            >
              재생
            </Button>
            <Button
              variant="primary"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={() => void handleRunAll()}
              disabled={!canRunAll}
            >
              {activeTask === 'run-all' ? <Spinner aria-hidden="true" /> : null}
              {activeTask === 'run-all' ? '실행 중' : '번역+생성+재생'}
            </Button>
          </div>

          {activeTask === 'load-speakers' ? (
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              <Spinner aria-hidden="true" />
              VOICEVOX 성우를 불러오는 중
            </p>
          ) : null}
          {statusMessage ? (
            <p aria-live="polite" className="text-xs font-semibold text-[#ffd8b0]">
              {statusMessage}
            </p>
          ) : null}
          {error ? (
            <p aria-live="assertive" className="text-sm font-semibold text-[#ff9ab8]">
              {error}
            </p>
          ) : null}
        </SectionBody>
      </Panel>
    </ModalBackdrop>
  );
}
