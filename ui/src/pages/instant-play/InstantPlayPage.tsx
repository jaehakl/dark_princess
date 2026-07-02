import { useEffect, useMemo, useRef, useState } from 'react';
import { dbTables } from '../../api/api';
import type { ImageRecord } from '../../api/type';
import { useCutStore } from '../../api/store';
import { voicevoxApi } from '../../api/voicevox';
import type { VoicevoxSpeaker } from '../../api/voicevox';
import {
  Button,
  FieldLabel,
  FormControl,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
  cx,
} from '../../components/ui';
import { generatePromptItemsFromScript } from '../../components/cut-editor/promptGeneration';
import { translateCutScriptToJapanese } from '../../components/cut-editor/scriptVoiceTranslation';

type InstantPlayScene = {
  context: string;
  script: string;
  scriptJp: string;
  audioUrl: string | null;
  image: ImageRecord | null;
  imagePrompt: string;
};

const EMPTY_SCENE: InstantPlayScene = {
  context: '',
  script: '',
  scriptJp: '',
  audioUrl: null,
  image: null,
  imagePrompt: '',
};

export function InstantPlayPage() {
  const setCurrentCut = useCutStore((state) => state.setCurrentCut);
  const [scene, setScene] = useState<InstantPlayScene>(EMPTY_SCENE);
  const [requirements, setRequirements] = useState('');
  const [speakers, setSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [selectedSpeakerUuid, setSelectedSpeakerUuid] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);
  const [isLoadingSpeakers, setIsLoadingSpeakers] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const selectedSpeaker = useMemo(
    () => speakers.find((speaker) => speaker.speaker_uuid === selectedSpeakerUuid) ?? null,
    [selectedSpeakerUuid, speakers],
  );
  const selectableStyles = useMemo(() => {
    if (!selectedSpeaker) {
      return [];
    }
    const talkStyles = selectedSpeaker.styles.filter((style) => style.type === undefined || style.type === 'talk');
    return talkStyles.length > 0 ? talkStyles : selectedSpeaker.styles;
  }, [selectedSpeaker]);
  const imageUrl = scene.image?.image_object_key ?? null;
  const hasScene = scene.script.trim().length > 0;
  const canSubmit = !isGenerating && requirements.trim().length > 0;

  useEffect(() => {
    setCurrentCut(null);
  }, [setCurrentCut]);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      setIsLoadingSpeakers(true);
      setVoiceMessage(null);
      try {
        const nextSpeakers = await voicevoxApi.speakers();
        if (isCancelled) {
          return;
        }

        let nextSpeakerUuid = '';
        let nextStyleId: number | null = null;
        for (const speaker of nextSpeakers) {
          const talkStyles = speaker.styles.filter((style) => style.type === undefined || style.type === 'talk');
          const firstStyle = talkStyles[0] ?? speaker.styles[0] ?? null;
          if (firstStyle) {
            nextSpeakerUuid = speaker.speaker_uuid;
            nextStyleId = firstStyle.id;
            break;
          }
        }

        setSpeakers(nextSpeakers);
        setSelectedSpeakerUuid(nextSpeakerUuid);
        setSelectedStyleId(nextStyleId);
        if (nextStyleId === null) {
          setVoiceMessage('사용 가능한 VOICEVOX 성우가 없습니다.');
        }
      } catch (loadError) {
        if (isCancelled) {
          return;
        }
        setVoiceMessage(loadError instanceof Error ? loadError.message : 'VOICEVOX 성우 목록을 불러오지 못했습니다.');
      } finally {
        if (!isCancelled) {
          setIsLoadingSpeakers(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const audioElement = audioRef.current;

    return () => {
      audioElement?.pause();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  async function submitNextScene() {
    const submittedRequirements = requirements.trim();
    if (!submittedRequirements || isGenerating) {
      return;
    }

    const previousContext = scene.context;
    const previousScript = scene.script;
    audioRef.current?.pause();
    setRequirements('');
    setIsGenerating(true);
    setError(null);
    setVoiceMessage(null);
    setImageMessage(null);

    try {
      setActiveStep('다음 script 생성 중');
      const scriptAnswer: unknown = await dbTables.LlmUtil.ask({
        system_message: (
          'You write Korean novel scene scripts. ' +
          'Continue from the previous compressed context and previous script when present. ' +
          'Use the next scene requirement as the immediate direction. ' +
          //'Write from the first-person point of view, using Korean first-person narration such as 내가 or 나는. ' +
          //'Describe what the viewpoint character sees, feels, thinks, and does from inside the scene. ' +
          'Return only the generated Korean script text, about 200 Korean characters. ' +
          'Do not return markdown, code fences, explanations, numbering, bullets, titles, or labels.'
        ),
        question: [
          '기존 context:',
          previousContext.trim() || '(없음)',
          '',
          '기존 script:',
          previousScript.trim() || '(없음)',
          '',
          '다음 Scene 요구사항:',
          submittedRequirements,
          '',
          '위 내용을 바탕으로 다음 장면 script를 작성해 주세요.',
        ].join('\n'),
        max_tokens: 256,
        temperature: 0.75,
      });

      if (typeof scriptAnswer !== 'string') {
        throw new Error('스크립트 생성 결과 형식이 올바르지 않습니다.');
      }
      const nextScript = scriptAnswer
        .replace(/\r\n?/g, '\n')
        .replace(/^```[a-zA-Z]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
      if (!nextScript) {
        throw new Error('생성된 스크립트가 비어 있습니다.');
      }

      let nextContext = '';
      if (previousContext.trim() || previousScript.trim()) {
        setActiveStep('context 2000자 요약 중');
        const contextAnswer: unknown = await dbTables.LlmUtil.ask({
          system_message: (
            'You summarize Korean visual-novel play history into a compact rolling context. ' +
            'Use only the previous context and previous script. ' +
            'Keep important character state, location, unresolved intent, emotional tension, and recent events. ' +
            'Return Korean plain text around 1000 characters. ' +
            'Do not return markdown, code fences, explanations, titles, bullets, or labels.'
          ),
          question: [
            '기존 context:',
            previousContext.trim() || '(없음)',
            '',
            '기존 script:',
            previousScript.trim() || '(없음)',
            '',
            '위 내용을 다음 플레이 context로 1000자 내외로 다시 요약해 주세요.',
          ].join('\n'),
          max_tokens: 1024,
          temperature: 0.2,
        });

        if (typeof contextAnswer !== 'string') {
          throw new Error('context 요약 결과 형식이 올바르지 않습니다.');
        }
        nextContext = contextAnswer
          .replace(/\r\n?/g, '\n')
          .replace(/^```[a-zA-Z]*\n?/, '')
          .replace(/\n?```$/, '')
          .trim();
        if (!nextContext) {
          throw new Error('요약된 context가 비어 있습니다.');
        }
      }

      setActiveStep('script 일본어 번역 중');
      const nextScriptJp = await translateCutScriptToJapanese(nextScript);

      setActiveStep('image prompt 생성 중');
      const promptItems = await generatePromptItemsFromScript(nextScript);
      const imagePrompt = [
        promptItems.prompt_situation,
        promptItems.prompt_hero,
        promptItems.prompt_detail,
        promptItems.prompt_camera,
      ].map((item) => item.trim()).filter(Boolean).join(', ') || promptItems.prompt_negative.trim();
      if (!imagePrompt) {
        throw new Error('이미지 검색 프롬프트가 비어 있습니다.');
      }

      setActiveStep('유사 image 검색 중');
      const similarImages = await dbTables.Image.similarImages(imagePrompt);
      const nextImage = similarImages.find((image) => Boolean(image.image_object_key)) ?? null;
      if (!nextImage) {
        setImageMessage('유사 image를 찾지 못해 빈 배경으로 표시합니다.');
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }

      setScene({
        context: nextContext,
        script: nextScript,
        scriptJp: nextScriptJp,
        audioUrl: null,
        image: nextImage,
        imagePrompt,
      });

      setActiveStep('VOICEVOX audio 생성 중');
      if (selectedStyleId === null) {
        setVoiceMessage('성우와 톤을 선택하면 다음 장면부터 audio를 생성합니다.');
        return;
      }

      try {
        const query = await voicevoxApi.audioQuery(nextScriptJp, selectedStyleId);
        const audioBlob = await voicevoxApi.synthesis(query, selectedStyleId);
        const nextAudioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = nextAudioUrl;
        setScene((current) => ({ ...current, audioUrl: nextAudioUrl }));

        if (audioRef.current) {
          audioRef.current.src = nextAudioUrl;
          audioRef.current.currentTime = 0;
          await audioRef.current.play().catch(() => {
            setVoiceMessage('브라우저 정책으로 자동 재생이 차단되었습니다. 오디오 재생 버튼을 눌러 주세요.');
          });
        }
      } catch (voiceError) {
        setVoiceMessage(voiceError instanceof Error ? voiceError.message : 'VOICEVOX audio 생성에 실패했습니다.');
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '다음 Scene 생성에 실패했습니다.');
      setRequirements(submittedRequirements);
    } finally {
      setActiveStep(null);
      setIsGenerating(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100dvh-6.5rem)] max-w-[1180px] grid-rows-[auto_minmax(0,1fr)_auto] gap-4">
      <Panel className="min-w-0">
        <PanelHeader className="flex-wrap items-start">
          <div className="min-w-0">
            <p className="text-[0.8rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Instant Play</p>
            <h1 className="truncate text-lg font-semibold text-[#fff7ef]">즉석 Scene 생성</h1>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-end justify-end gap-2">
            <div className="min-w-40">
              <FieldLabel htmlFor="instant-play-speaker">성우</FieldLabel>
              <FormControl
                as="select"
                id="instant-play-speaker"
                value={selectedSpeakerUuid}
                onChange={(event) => {
                  const nextSpeaker = speakers.find((speaker) => speaker.speaker_uuid === event.target.value) ?? null;
                  const talkStyles = nextSpeaker?.styles.filter((style) => style.type === undefined || style.type === 'talk') ?? [];
                  const firstStyle = talkStyles[0] ?? nextSpeaker?.styles[0] ?? null;
                  setSelectedSpeakerUuid(event.target.value);
                  setSelectedStyleId(firstStyle?.id ?? null);
                  setVoiceMessage(null);
                }}
                className="mt-1 h-10 w-full px-3 text-sm"
                disabled={isLoadingSpeakers || isGenerating || speakers.length === 0}
              >
                <option value="">성우 선택</option>
                {speakers.map((speaker) => (
                  <option key={speaker.speaker_uuid} value={speaker.speaker_uuid}>
                    {speaker.name}
                  </option>
                ))}
              </FormControl>
            </div>
            <div className="min-w-36">
              <FieldLabel htmlFor="instant-play-style">톤</FieldLabel>
              <FormControl
                as="select"
                id="instant-play-style"
                value={selectedStyleId ?? ''}
                onChange={(event) => {
                  const nextStyleId = Number(event.target.value);
                  setSelectedStyleId(Number.isFinite(nextStyleId) ? nextStyleId : null);
                  setVoiceMessage(null);
                }}
                className="mt-1 h-10 w-full px-3 text-sm"
                disabled={isLoadingSpeakers || isGenerating || selectableStyles.length === 0}
              >
                <option value="">톤 선택</option>
                {selectableStyles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.type && style.type !== 'talk' ? `${style.name} (${style.type})` : style.name}
                  </option>
                ))}
              </FormControl>
            </div>
            <Button
              className="h-10 px-4 py-2 text-xs"
              onClick={() => setIsContextOpen(true)}
            >
              Context
            </Button>
          </div>
        </PanelHeader>
      </Panel>

      <section className="relative min-h-[24rem] overflow-hidden rounded-[8px] border border-[rgba(255,218,228,0.28)] bg-[linear-gradient(135deg,rgba(255,245,232,0.08),transparent_50%),rgba(8,2,13,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),var(--app-shadow)]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="현재 instant play scene"
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-semibold text-[var(--app-muted)]">
            {hasScene ? '표시할 image가 없습니다.' : 'Scene 없음'}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(0deg,rgba(7,1,11,0.92),rgba(7,1,11,0.72)_58%,transparent)] px-4 pt-20 pb-4">
          <div
            className={cx(
              'mx-auto max-w-4xl rounded-[8px] border border-[rgba(255,218,228,0.34)] bg-[rgba(10,3,15,0.76)] px-5 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-[10px]',
              !hasScene && 'opacity-0',
            )}
          >
            <p className="whitespace-pre-wrap text-[1rem] leading-7 font-bold text-[#fff7ef]">
              {scene.script}
            </p>
          </div>
        </div>

        {isGenerating ? (
          <div className="absolute inset-0 grid place-items-center bg-[rgba(5,0,10,0.52)] backdrop-blur-[4px]">
            <div className="inline-flex items-center gap-3 rounded-[8px] border border-[rgba(255,218,228,0.34)] bg-[rgba(11,4,16,0.82)] px-4 py-3 text-sm font-semibold text-[#fff7ef] shadow-[0_18px_46px_rgba(0,0,0,0.34)]">
              <Spinner aria-hidden="true" />
              <span>{activeStep ?? 'Scene 생성 중'}</span>
            </div>
          </div>
        ) : null}
      </section>

      <Panel className="min-w-0">
        <SectionBody className="space-y-3">
          <form
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void submitNextScene();
            }}
          >
            <div className="min-w-0 space-y-1">
              <FieldLabel htmlFor="instant-play-requirements">다음 Scene 요구사항</FieldLabel>
              <FormControl
                as="textarea"
                id="instant-play-requirements"
                rows={3}
                value={requirements}
                onChange={(event) => {
                  setRequirements(event.target.value);
                  setError(null);
                }}
                className="min-h-24 w-full resize-y px-3 py-2 text-sm leading-6"
                disabled={isGenerating}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                variant={canSubmit ? 'primary' : 'default'}
                className="min-h-12 w-full px-5 py-3 text-sm md:w-auto"
                disabled={!canSubmit}
              >
                {isGenerating ? '생성 중' : '제출'}
              </Button>
            </div>
          </form>

          <audio ref={audioRef} src={scene.audioUrl ?? undefined} controls className="w-full" />

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {isLoadingSpeakers ? (
              <span className="inline-flex items-center gap-2 text-[var(--app-muted)]">
                <Spinner aria-hidden="true" />
                VOICEVOX 성우를 불러오는 중
              </span>
            ) : null}
            {scene.audioUrl ? (
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = 0;
                    void audioRef.current.play().catch((playError: unknown) => {
                      setVoiceMessage(playError instanceof Error ? playError.message : 'audio 재생에 실패했습니다.');
                    });
                  }
                }}
              >
                오디오 재생
              </Button>
            ) : null}
            {imageMessage ? <span className="text-[#ffd8b0]">{imageMessage}</span> : null}
            {voiceMessage ? <span className="text-[#ffd8b0]">{voiceMessage}</span> : null}
            {error ? <span className="text-[#ff9ab8]">{error}</span> : null}
          </div>
        </SectionBody>
      </Panel>

      {isContextOpen ? (
        <ModalBackdrop role="presentation">
          <Panel
            role="dialog"
            aria-modal="true"
            aria-labelledby="instant-play-context-title"
            className="max-h-[calc(100dvh-3rem)] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto"
          >
            <PanelHeader>
              <div className="min-w-0">
                <p className="text-[0.8rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Rolling context</p>
                <h2 id="instant-play-context-title" className="text-base font-semibold text-[#fff7ef]">
                  Context
                </h2>
              </div>
              <Button className="px-3 py-2 text-xs" onClick={() => setIsContextOpen(false)}>
                닫기
              </Button>
            </PanelHeader>
            <SectionBody>
              <pre className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-[rgba(255,196,214,0.28)] bg-[rgba(9,3,14,0.76)] p-4 text-sm leading-6 text-[var(--app-text)]">
                {scene.context.trim() || '아직 context가 없습니다.'}
              </pre>
            </SectionBody>
          </Panel>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
