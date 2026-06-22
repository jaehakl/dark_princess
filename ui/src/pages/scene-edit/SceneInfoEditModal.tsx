import { useMemo, useState } from 'react';
import { dbTables } from '../../api/api';
import type { CutRecord, GetListRequest, SceneRecord } from '../../api/type';
import { buildCutContext } from '../../components/cut-editor/cutContext';
import {
  Button,
  FieldLabel,
  FormControl,
  ImageFrame,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
  cx,
} from '../../components/ui';

const SOURCE_SCENE_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: null,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
};

const SOURCE_CUT_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: null,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
};

const SCENE_STAT_FIELDS = [
  { key: 'cash', label: '현금' },
  { key: 'strength', label: '힘' },
  { key: 'agility', label: '민첩' },
  { key: 'intelligence', label: '지력' },
  { key: 'sense', label: '센스' },
  { key: 'attractiveness', label: '매력' },
  { key: 'toughness', label: '근성' },
  { key: 'stress', label: '스트레스' },
] as const;

export type SceneInfoDraft = Pick<
  SceneRecord,
  | 'title'
  | 'context'
  | 'turn'
  | 'cash'
  | 'strength'
  | 'agility'
  | 'intelligence'
  | 'sense'
  | 'attractiveness'
  | 'toughness'
  | 'stress'
>;

type SceneInfoEditModalProps = {
  scene: SceneRecord;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: SceneInfoDraft) => Promise<void> | void;
};

function createDraft(scene: SceneRecord): SceneInfoDraft {
  return {
    title: scene.title,
    context: scene.context,
    turn: scene.turn,
    cash: scene.cash,
    strength: scene.strength,
    agility: scene.agility,
    intelligence: scene.intelligence,
    sense: scene.sense,
    attractiveness: scene.attractiveness,
    toughness: scene.toughness,
    stress: scene.stress,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function getScriptSummary(cut: CutRecord) {
  const summary = cut.script.replace(/\s+/g, ' ').trim();
  return summary || 'script 없음';
}

function normalizeGeneratedContext(answer: unknown) {
  if (typeof answer !== 'string') {
    throw new Error('context 생성 결과 형식이 올바르지 않습니다.');
  }

  const normalizedAnswer = answer
    .replace(/\r\n?/g, '\n')
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
  if (!normalizedAnswer) {
    throw new Error('생성된 context가 비어 있습니다.');
  }
  return normalizedAnswer;
}

export function SceneInfoEditModal({
  scene,
  isSaving,
  onClose,
  onSave,
}: SceneInfoEditModalProps) {
  const [draft, setDraft] = useState(() => createDraft(scene));
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [sourceScenes, setSourceScenes] = useState<SceneRecord[]>([]);
  const [selectedSourceScene, setSelectedSourceScene] = useState<SceneRecord | null>(null);
  const [sourceCuts, setSourceCuts] = useState<CutRecord[]>([]);
  const [isLoadingSourceScenes, setIsLoadingSourceScenes] = useState(false);
  const [isLoadingSourceCuts, setIsLoadingSourceCuts] = useState(false);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const currentSceneId = typeof scene.id === 'number' ? scene.id : null;
  const isBusy = isSaving || isLoadingSourceScenes || isLoadingSourceCuts || isGeneratingContext;

  const terminalSourceCuts = useMemo(() => {
    const parentIds = new Set<number>();
    for (const cut of sourceCuts) {
      if (typeof cut.prev_cut_id === 'number') {
        parentIds.add(cut.prev_cut_id);
      }
    }
    return sourceCuts.filter((cut) => typeof cut.id === 'number' && !parentIds.has(cut.id));
  }, [sourceCuts]);

  async function openContextSourcePicker() {
    setIsSourcePickerOpen(true);
    setSelectedSourceScene(null);
    setSourceCuts([]);
    setSourceScenes([]);
    setSourceError(null);
    setIsLoadingSourceScenes(true);
    try {
      const response = await dbTables.Scene.listRows(SOURCE_SCENE_LIST_REQUEST);
      setSourceScenes(
        response.items.filter((sourceScene) => (
          typeof sourceScene.id === 'number' && sourceScene.id !== currentSceneId
        )),
      );
    } catch (loadError) {
      setSourceScenes([]);
      setSourceError(getErrorMessage(loadError));
    } finally {
      setIsLoadingSourceScenes(false);
    }
  }

  async function selectSourceScene(sourceScene: SceneRecord) {
    const sourceSceneId = sourceScene.id;
    if (typeof sourceSceneId !== 'number') {
      return;
    }

    setSelectedSourceScene(sourceScene);
    setSourceCuts([]);
    setSourceError(null);
    setIsLoadingSourceCuts(true);
    try {
      const response = await dbTables.Cut.listRows({
        ...SOURCE_CUT_LIST_REQUEST,
        filter: { scene_id: [sourceSceneId, sourceSceneId] },
      });
      setSourceCuts(response.items);
    } catch (loadError) {
      setSourceCuts([]);
      setSourceError(getErrorMessage(loadError));
    } finally {
      setIsLoadingSourceCuts(false);
    }
  }

  async function generateContextFromCut(cut: CutRecord) {
    const cutId = cut.id;
    if (!selectedSourceScene || typeof cutId !== 'number') {
      return;
    }

    const sourceContext = buildCutContext(selectedSourceScene, sourceCuts, cutId);
    if (!sourceContext.trim()) {
      setSourceError('선택한 Cut에서 cut_context를 만들 수 없습니다.');
      return;
    }

    setSourceError(null);
    setIsGeneratingContext(true);
    try {
      const answer: unknown = await dbTables.LlmUtil.ask({
        system_message: (
          'You summarize previous visual-novel scene context in Korean. ' +
          'Return only Korean text with exactly four labeled sections: 설정, 등장 인물, 줄거리, 직전 장면. ' +
          'Keep each section concise and useful as the next scene context. ' +
          'Do not return markdown, code fences, bullets, or extra explanations.'
        ),
        question: [
          '다음 cut_context를 바탕으로 새 Scene context를 작성해 주세요.',
          '선택한 막다른 Cut까지의 내용이 이전 장면 전체 흐름입니다.',
          '',
          'cut_context:',
          sourceContext,
        ].join('\n'),
        max_tokens: 1024,
        temperature: 0.2,
      });
      setDraft((current) => ({
        ...current,
        context: normalizeGeneratedContext(answer),
      }));
      setIsSourcePickerOpen(false);
    } catch (generateError) {
      setSourceError(getErrorMessage(generateError));
    } finally {
      setIsGeneratingContext(false);
    }
  }

  return (
    <>
      <ModalBackdrop role="presentation" topAligned>
        <Panel
          role="dialog"
          aria-modal="true"
          aria-labelledby="scene-info-edit-title"
          className="max-h-[calc(100dvh-3rem)] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto"
        >
          <PanelHeader>
            <h2 id="scene-info-edit-title" className="text-base font-semibold text-[#fff7ef]">Scene 정보 편집</h2>
            <Button
              className="px-3 py-2 text-xs"
              onClick={onClose}
              disabled={isBusy}
            >
              닫기
            </Button>
          </PanelHeader>
          <SectionBody className="space-y-4">
            <div className="space-y-1">
              <FieldLabel htmlFor="scene-title">제목</FieldLabel>
              <FormControl
                id="scene-title"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                disabled={isBusy}
                className="h-11 w-full px-3"
              />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel htmlFor="scene-context">context</FieldLabel>
                <Button
                  className="px-3 py-2 text-xs"
                  onClick={() => void openContextSourcePicker()}
                  disabled={isBusy}
                >
                  이전 장면에서 context 생성
                </Button>
              </div>
              <FormControl
                as="textarea"
                id="scene-context"
                value={draft.context}
                onChange={(event) => setDraft((current) => ({ ...current, context: event.target.value }))}
                disabled={isBusy}
                className="min-h-48 w-full resize-y px-3 py-2 text-sm leading-6"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <SceneNumberField
                label="턴"
                value={draft.turn}
                onChange={(value) => setDraft((current) => ({ ...current, turn: value }))}
                disabled={isBusy}
              />
              {SCENE_STAT_FIELDS.map((field) => (
                <SceneNumberField
                  key={field.key}
                  label={field.label}
                  value={draft[field.key]}
                  onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
                  disabled={isBusy}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                className="px-4 py-2 text-xs"
                onClick={onClose}
                disabled={isBusy}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="px-4 py-2 text-xs"
                onClick={() => void onSave(draft)}
                disabled={isBusy}
              >
                {isSaving ? '저장 중' : '저장'}
              </Button>
            </div>
          </SectionBody>
        </Panel>
      </ModalBackdrop>

      {isSourcePickerOpen ? (
        <ModalBackdrop role="presentation" topAligned>
          <Panel
            role="dialog"
            aria-modal="true"
            aria-labelledby="scene-context-source-title"
            className="flex max-h-[calc(100dvh-3rem)] w-[min(72rem,calc(100vw-2rem))] flex-col overflow-hidden"
          >
            <PanelHeader>
              <div className="min-w-0">
                <h2 id="scene-context-source-title" className="text-base font-semibold text-[#fff7ef]">
                  이전 장면 context 생성
                </h2>
                <p className="mt-1 text-xs font-semibold text-[var(--app-muted)]">
                  다른 Scene을 선택한 뒤 막다른 Cut을 선택해 context를 생성합니다.
                </p>
              </div>
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => setIsSourcePickerOpen(false)}
                disabled={isBusy}
              >
                닫기
              </Button>
            </PanelHeader>
            <SectionBody className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              {sourceError ? (
                <p className="text-sm font-semibold text-[#ff9ab8]">{sourceError}</p>
              ) : null}
              {isLoadingSourceScenes ? (
                <div className="flex min-h-72 items-center justify-center gap-3 text-sm font-semibold text-[var(--app-muted)]">
                  <Spinner aria-hidden="true" />
                  <span>Scene을 불러오는 중</span>
                </div>
              ) : (
                <div className="grid min-h-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <p className="text-xs font-extrabold text-[var(--app-muted)]">Scene</p>
                    {sourceScenes.length === 0 ? (
                      <div className="grid min-h-48 place-items-center rounded-[8px] border border-[rgba(255,208,222,0.24)] text-sm font-semibold text-[var(--app-muted)]">
                        선택할 다른 Scene 없음
                      </div>
                    ) : (
                      <div className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1">
                        {sourceScenes.map((sourceScene) => {
                          const isSelected = selectedSourceScene?.id === sourceScene.id;
                          return (
                            <button
                              key={sourceScene.id}
                              type="button"
                              className={cx(
                                'w-full rounded-[8px] border bg-[rgba(12,5,18,0.58)] p-3 text-left transition-[border-color,background]',
                                isSelected
                                  ? 'border-[rgba(255,232,183,0.86)] bg-[rgba(64,31,52,0.78)]'
                                  : 'border-[rgba(255,208,222,0.24)] hover:border-[rgba(255,224,180,0.84)]',
                              )}
                              onClick={() => void selectSourceScene(sourceScene)}
                              disabled={isBusy}
                            >
                              <span className="block truncate text-sm font-extrabold text-[#fff7ef]">
                                {sourceScene.title.trim() || `Scene #${sourceScene.id}`}
                              </span>
                              <span className="mt-1 block text-xs font-semibold text-[var(--app-muted)]">
                                #{sourceScene.id} · Cut {sourceScene.cut_count ?? '-'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-extrabold text-[var(--app-muted)]">막다른 Cut</p>
                    {!selectedSourceScene ? (
                      <div className="grid min-h-72 place-items-center rounded-[8px] border border-[rgba(255,208,222,0.24)] text-sm font-semibold text-[var(--app-muted)]">
                        Scene을 먼저 선택해 주세요.
                      </div>
                    ) : isLoadingSourceCuts || isGeneratingContext ? (
                      <div className="flex min-h-72 items-center justify-center gap-3 text-sm font-semibold text-[var(--app-muted)]">
                        <Spinner aria-hidden="true" />
                        <span>{isGeneratingContext ? 'context 생성 중' : 'Cut을 불러오는 중'}</span>
                      </div>
                    ) : terminalSourceCuts.length === 0 ? (
                      <div className="grid min-h-72 place-items-center rounded-[8px] border border-[rgba(255,208,222,0.24)] text-sm font-semibold text-[var(--app-muted)]">
                        막다른 Cut 없음
                      </div>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {terminalSourceCuts.map((cut, index) => {
                          const cutId = cut.id;
                          const cutLabel = `Cut #${cutId ?? '-'}`;
                          const scriptSummary = getScriptSummary(cut);
                          return (
                            <button
                              key={cutId ?? `terminal-cut-${index}`}
                              type="button"
                              className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[rgba(12,5,18,0.58)] p-2 text-left transition-[transform,border-color,background] hover:-translate-y-px hover:border-[rgba(255,224,180,0.84)] hover:bg-[rgba(50,15,47,0.82)]"
                              onClick={() => void generateContextFromCut(cut)}
                              disabled={isBusy}
                              title={`${cutLabel}\n${scriptSummary}`}
                            >
                              <ImageFrame className="relative aspect-square rounded-[6px] border border-[rgba(255,218,228,0.22)]">
                                {cut.image_url ? (
                                  <img
                                    src={cut.image_url}
                                    alt=""
                                    className="absolute inset-0 h-full w-full object-contain"
                                    draggable={false}
                                  />
                                ) : null}
                              </ImageFrame>
                              <span className="min-w-0 space-y-1">
                                <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-[#fff7ef]">
                                  <span className="truncate">{cutLabel}</span>
                                </span>
                                <span className="block text-xs font-semibold text-[var(--app-muted)]">
                                  prev #{cut.prev_cut_id ?? '-'}
                                </span>
                                <span className="line-clamp-3 block text-xs leading-5 text-[#ffe8ee]">
                                  {scriptSummary}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SectionBody>
          </Panel>
        </ModalBackdrop>
      ) : null}
    </>
  );
}

function SceneNumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <FormControl
        type="number"
        value={value}
        onChange={(event) => {
          const parsedValue = Number(event.target.value);
          onChange(Number.isFinite(parsedValue) ? parsedValue : 0);
        }}
        disabled={disabled}
        className="h-11 w-full px-3"
      />
    </div>
  );
}
