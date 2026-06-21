import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type {
  GenerateSelectionModelRequest,
  GetListRequest,
  SelectionModelRecord,
  StatusRecord,
} from '../../api/type';
import { useCutStore } from '../../api/store';
import {
  Button,
  FieldLabel,
  FormControl,
  Panel,
  PanelHeader,
  SectionBody,
} from '../../components/ui';

const LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: 100,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
};

const DEFAULT_MODEL_PARAMETERS = JSON.stringify(
  {
    hidden_dims: [1024, 512],
    activation: 'relu',
    dropout: 0,
    seed: null,
    temperature: 1.5,
    l1_regularization: 1e-7,
    l2_regularization: 1e-5,
  },
  null,
  2,
);

const NUMERIC_STATUS_FIELDS = [
  { key: 'cash', label: '현금' },
  { key: 'strength', label: '힘' },
  { key: 'agility', label: '민첩' },
  { key: 'intelligence', label: '지력' },
  { key: 'sense', label: '센스' },
  { key: 'attractiveness', label: '매력' },
  { key: 'toughness', label: '근성' },
  { key: 'stress', label: '스트레스' },
] as const;

type NumericStatusKey = (typeof NUMERIC_STATUS_FIELDS)[number]['key'];

function createInitialStatus(): StatusRecord {
  return {
    name: 'Status',
    turn: 1,
    cash: 5,
    strength: 5,
    agility: 5,
    intelligence: 5,
    sense: 5,
    attractiveness: 5,
    toughness: 5,
    stress: 5,
    selection_model_id: null,
  };
}

function randomStat() {
  return Math.floor(Math.random() * 10) + 1;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

export function LandingPage() {
  const navigate = useNavigate();
  const setCurrentCut = useCutStore((state) => state.setCurrentCut);
  const [statuses, setStatuses] = useState<StatusRecord[]>([]);
  const [models, setModels] = useState<SelectionModelRecord[]>([]);
  const [draftStatus, setDraftStatus] = useState<StatusRecord>(() =>
    createInitialStatus(),
  );
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [modelName, setModelName] = useState('Selection Model');
  const [modelParameters, setModelParameters] = useState(DEFAULT_MODEL_PARAMETERS);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingStatus, setIsCreatingStatus] = useState(false);
  const [isGeneratingModel, setIsGeneratingModel] = useState(false);
  const [deletingStatusId, setDeletingStatusId] = useState<number | null>(null);
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [statusResponse, modelResponse] = await Promise.all([
        dbTables.Status.listRows(LIST_REQUEST),
        dbTables.SelectionModel.listRows(LIST_REQUEST),
      ]);
      setStatuses(statusResponse.items);
      setModels(modelResponse.items);

      if (
        selectedModelId === null &&
        modelResponse.items.length > 0 &&
        modelResponse.items[0].id
      ) {
        setSelectedModelId(modelResponse.items[0].id);
        setDraftStatus((current) => ({
          ...current,
          selection_model_id: modelResponse.items[0].id ?? null,
        }));
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setCurrentCut(null);
  }, [setCurrentCut]);

  function updateDraftField(field: NumericStatusKey | 'turn', value: string) {
    const parsedValue = Number(value);
    setDraftStatus((current) => ({
      ...current,
      [field]: Number.isFinite(parsedValue) ? parsedValue : 0,
    }));
  }

  function shuffleStatus() {
    setDraftStatus((current) => ({
      ...current,
      turn: 1,
      cash: randomStat(),
      strength: randomStat(),
      agility: randomStat(),
      intelligence: randomStat(),
      sense: randomStat(),
      attractiveness: randomStat(),
      toughness: randomStat(),
      stress: randomStat(),
    }));
  }

  function selectModel(value: string) {
    const modelId = value ? Number(value) : null;
    setSelectedModelId(modelId);
    setDraftStatus((current) => ({
      ...current,
      selection_model_id: modelId,
    }));
  }

  async function generateModel() {
    const trimmedName = modelName.trim();
    if (!trimmedName) {
      setError('모델 이름을 입력해 주세요.');
      return;
    }

    let parameters: GenerateSelectionModelRequest['parameters'];
    try {
      const parsed = JSON.parse(modelParameters) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('parameters must be an object');
      }
      parameters = parsed as Record<string, unknown>;
    } catch {
      setError('parameters JSON 형식이 올바르지 않습니다.');
      return;
    }

    setIsGeneratingModel(true);
    setError(null);
    try {
      const model = await dbTables.SelectionModel.generateModel({
        name: trimmedName,
        parameters,
      });
      const modelResponse = await dbTables.SelectionModel.listRows(LIST_REQUEST);
      setModels(modelResponse.items);

      if (model.id) {
        setSelectedModelId(model.id);
        setDraftStatus((current) => ({
          ...current,
          selection_model_id: model.id ?? null,
        }));
      }
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    } finally {
      setIsGeneratingModel(false);
    }
  }

  async function createStatus() {
    if (selectedModelId === null) {
      setError('선택 모델을 고르거나 생성해 주세요.');
      return;
    }

    const payload: StatusRecord = {
      ...draftStatus,
      name: draftStatus.name.trim() || 'Status',
      selection_model_id: selectedModelId,
    };

    setIsCreatingStatus(true);
    setError(null);
    try {
      const response = await dbTables.Status.upsertRow([payload]);
      const createdId = response[0]?.id;
      if (!createdId) {
        throw new Error('Status 생성 결과를 확인할 수 없습니다.');
      }
      navigate(`/play/${createdId}`);
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setIsCreatingStatus(false);
    }
  }

  async function deleteStatus(statusItem: StatusRecord) {
    if (!statusItem.id) {
      return;
    }
    if (!window.confirm(`${statusItem.name} Status를 삭제할까요?`)) {
      return;
    }

    setDeletingStatusId(statusItem.id);
    setError(null);
    try {
      await dbTables.Status.deleteRows([statusItem.id]);
      setStatuses((current) => current.filter((item) => item.id !== statusItem.id));
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setDeletingStatusId(null);
    }
  }

  async function deleteSelectedModel() {
    if (!selectedModel?.id) {
      return;
    }
    if (!window.confirm(`${selectedModel.name} 모델을 삭제할까요? 연결된 Status의 모델 선택은 해제됩니다.`)) {
      return;
    }

    setIsDeletingModel(true);
    setError(null);
    try {
      await dbTables.SelectionModel.deleteRows([selectedModel.id]);
      const modelResponse = await dbTables.SelectionModel.listRows(LIST_REQUEST);
      setModels(modelResponse.items);
      setSelectedModelId(null);
      setDraftStatus((current) => ({
        ...current,
        selection_model_id: null,
      }));
      setStatuses((current) =>
        current.map((item) =>
          item.selection_model_id === selectedModel.id
            ? { ...item, selection_model_id: null }
            : item,
        ),
      );
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeletingModel(false);
    }
  }

  const canCreateStatus =
    !isCreatingStatus &&
    selectedModelId !== null &&
    draftStatus.name.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 px-1">
        <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">A moonlit beginning</p>
        <h1 className="text-[clamp(1.25rem,2vw,2.2rem)] leading-[1.05] font-extrabold tracking-[0.02em] text-[#fff7ef] [text-shadow:0_0_22px_rgba(255,194,211,0.42),0_2px_12px_rgba(0,0,0,0.58)]">Create/Select Status</h1>
      </div>

      <div className="grid min-h-[calc(100vh-10rem)] gap-5 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(30rem,1.15fr)]">
      <Panel className="min-h-0">
        <PanelHeader>
          <h2 className="text-base font-semibold text-[#fff7ef]">기록 선택</h2>
          <Button
            className="px-4 py-2 text-sm"
            onClick={() => void loadData()}
            disabled={isLoading}
          >
            새로고침
          </Button>
        </PanelHeader>

        <SectionBody className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          {isLoading ? (
            <p className="px-2 py-6 text-sm text-[var(--app-muted)]">
              불러오는 중
            </p>
          ) : statuses.length === 0 ? (
            <p className="px-2 py-6 text-sm text-[var(--app-muted)]">
              Status 없음
            </p>
          ) : (
            <div className="space-y-2">
              {statuses.map((status) => (
                <div
                  key={status.id}
                  role="button"
                  tabIndex={0}
                  className="relative w-full rounded-[8px] border border-[rgba(255,208,222,0.28)] bg-[linear-gradient(135deg,rgba(255,231,237,0.12),transparent_42%),rgba(19,7,27,0.66)] px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[transform,border-color,background] hover:-translate-y-px hover:border-[rgba(255,224,180,0.84)] hover:bg-[linear-gradient(135deg,rgba(255,225,191,0.18),transparent_48%),rgba(50,15,47,0.84)]"
                  onClick={() => status.id && navigate(`/play/${status.id}`)}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && status.id) {
                      event.preventDefault();
                      navigate(`/play/${status.id}`);
                    }
                  }}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-base font-semibold text-[#fff7ef]">
                      {status.name}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--app-accent)]">
                      #{status.id}
                    </span>
                  </span>
                  <span className="mt-2 grid grid-cols-3 gap-1 text-xs text-[var(--app-muted)]">
                    <span>턴 {status.turn}</span>
                    <span>현금 {status.cash}</span>
                    <span>스트레스 {status.stress}</span>
                  </span>
                  <span className="mt-3 flex justify-end">
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteStatus(status);
                      }}
                      disabled={deletingStatusId === status.id}
                    >
                      {deletingStatusId === status.id ? '삭제 중' : '삭제'}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionBody>
      </Panel>

      <Panel className="min-h-0">
        <PanelHeader>
          <h2 className="text-base font-semibold text-[#fff7ef]">Status 생성</h2>
          <p className="hidden text-xs font-semibold text-[var(--app-muted)] sm:block">
            fate tuning
          </p>
        </PanelHeader>

        <SectionBody className="grid gap-5 xl:grid-cols-[minmax(20rem,1fr)_minmax(20rem,1fr)]">
          <div className="space-y-4">
            <div className="block space-y-1">
              <FieldLabel htmlFor="status-name">이름</FieldLabel>
              <FormControl
                id="status-name"
                value={draftStatus.name}
                onChange={(event) =>
                  setDraftStatus((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="h-12 w-full px-3"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumberField
                label="턴"
                value={draftStatus.turn}
                onChange={(value) => updateDraftField('turn', value)}
              />
              {NUMERIC_STATUS_FIELDS.map((field) => (
                <NumberField
                  key={field.key}
                  label={field.label}
                  value={draftStatus[field.key]}
                  onChange={(value) => updateDraftField(field.key, value)}
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                className="px-5 py-2"
                onClick={shuffleStatus}
              >
                Shuffle
              </Button>
              <Button
                variant={canCreateStatus ? 'primary' : 'default'}
                className="px-5 py-2"
                onClick={() => void createStatus()}
                disabled={!canCreateStatus}
              >
                {isCreatingStatus ? '생성 중' : 'Status 생성'}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="block space-y-1">
              <FieldLabel htmlFor="selection-model">선택 모델</FieldLabel>
              <FormControl
                as="select"
                id="selection-model"
                value={selectedModelId ?? ''}
                onChange={(event) => selectModel(event.target.value)}
                className="h-12 w-full px-3"
              >
                <option value="">선택 안 함</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id ?? ''}>
                    {model.name}
                  </option>
                ))}
              </FormControl>
            </div>

            <div className="rounded-[8px] border border-[rgba(255,208,222,0.25)] bg-[linear-gradient(135deg,rgba(255,229,238,0.12),transparent),rgba(12,5,18,0.64)] px-4 py-4">
              <p className="truncate text-sm font-semibold text-[#fff7ef]">
                {selectedModel?.name ?? '모델 없음'}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--app-muted)]">
                {selectedModel?.file_url ?? '-'}
              </p>
              <Button
                variant="danger"
                className="mt-3 px-3 py-2 text-xs"
                onClick={() => void deleteSelectedModel()}
                disabled={!selectedModel || isDeletingModel}
              >
                {isDeletingModel ? '삭제 중' : '선택 모델 삭제'}
              </Button>
            </div>

            <div className="block space-y-1">
              <FieldLabel htmlFor="model-name">모델 이름</FieldLabel>
              <FormControl
                id="model-name"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                className="h-12 w-full px-3"
              />
            </div>

            <div className="block space-y-1">
              <FieldLabel htmlFor="model-parameters">parameters</FieldLabel>
              <FormControl
                as="textarea"
                id="model-parameters"
                value={modelParameters}
                onChange={(event) => setModelParameters(event.target.value)}
                className="min-h-40 w-full resize-y px-3 py-2 font-mono text-sm"
                spellCheck={false}
              />
            </div>

            <Button
              className="w-full px-5 py-3"
              onClick={() => void generateModel()}
              disabled={isGeneratingModel}
            >
              {isGeneratingModel ? '생성 중' : '모델 생성'}
            </Button>
          </div>
        </SectionBody>

        {error ? (
          <div className="relative border-t border-[var(--app-border)] px-4 py-3 text-sm font-semibold text-[#ff9ab8]">
            {error}
          </div>
        ) : null}
      </Panel>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="block space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <FormControl
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full px-3"
      />
    </div>
  );
}
