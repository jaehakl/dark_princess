import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type {
  GenerateSelectionModelRequest,
  GetListRequest,
  SelectionModelRecord,
  StatusRecord,
} from '../../api/type';
import { useSceneStore } from '../../api/store';

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
    hidden_dims: [2048, 1024],
    activation: 'relu',
    dropout: 0,
    seed: null,
    temperature: 2.0,
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
  const setCurrentScene = useSceneStore((state) => state.setCurrentScene);
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
    setCurrentScene(null);
  }, [setCurrentScene]);

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
        <p className="vn-subtitle">A moonlit beginning</p>
        <h1 className="vn-title">Create/Select Status</h1>
      </div>

      <div className="grid min-h-[calc(100vh-10rem)] gap-5 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(30rem,1.15fr)]">
      <section className="vn-panel min-h-0">
        <div className="vn-panel-header">
          <h2 className="text-base font-semibold text-[#fff7ef]">기록 선택</h2>
          <button
            type="button"
            className="vn-button px-4 py-2 text-sm"
            onClick={() => void loadData()}
            disabled={isLoading}
          >
            새로고침
          </button>
        </div>

        <div className="vn-section-body vn-list">
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
                  className="vn-status-card px-4 py-4"
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
                    <button
                      type="button"
                      className="vn-danger-button px-3 py-1.5 text-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteStatus(status);
                      }}
                      disabled={deletingStatusId === status.id}
                    >
                      {deletingStatusId === status.id ? '삭제 중' : '삭제'}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="vn-panel min-h-0">
        <div className="vn-panel-header">
          <h2 className="text-base font-semibold text-[#fff7ef]">Status 생성</h2>
          <p className="hidden text-xs font-semibold text-[var(--app-muted)] sm:block">
            fate tuning
          </p>
        </div>

        <div className="vn-section-body grid gap-5 xl:grid-cols-[minmax(20rem,1fr)_minmax(20rem,1fr)]">
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="edit-label">
                <span className="edit-label__text">이름</span>
              </span>
              <input
                value={draftStatus.name}
                onChange={(event) =>
                  setDraftStatus((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="edit-control h-12 w-full px-3"
              />
            </label>

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
              <button
                type="button"
                className="vn-button px-5 py-2"
                onClick={shuffleStatus}
              >
                Shuffle
              </button>
              <button
                type="button"
                className={[
                  'vn-button px-5 py-2',
                  canCreateStatus
                    ? 'vn-button-primary'
                    : '',
                ].join(' ')}
                onClick={() => void createStatus()}
                disabled={!canCreateStatus}
              >
                {isCreatingStatus ? '생성 중' : 'Status 생성'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="edit-label">
                <span className="edit-label__text">선택 모델</span>
              </span>
              <select
                value={selectedModelId ?? ''}
                onChange={(event) => selectModel(event.target.value)}
                className="edit-control h-12 w-full px-3"
              >
                <option value="">선택 안 함</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id ?? ''}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="vn-model-card px-4 py-4">
              <p className="truncate text-sm font-semibold text-[#fff7ef]">
                {selectedModel?.name ?? '모델 없음'}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--app-muted)]">
                {selectedModel?.file_url ?? '-'}
              </p>
              <button
                type="button"
                className="vn-danger-button mt-3 px-3 py-2 text-xs"
                onClick={() => void deleteSelectedModel()}
                disabled={!selectedModel || isDeletingModel}
              >
                {isDeletingModel ? '삭제 중' : '선택 모델 삭제'}
              </button>
            </div>

            <label className="block space-y-1">
              <span className="edit-label">
                <span className="edit-label__text">모델 이름</span>
              </span>
              <input
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                className="edit-control h-12 w-full px-3"
              />
            </label>

            <label className="block space-y-1">
              <span className="edit-label">
                <span className="edit-label__text">parameters</span>
              </span>
              <textarea
                value={modelParameters}
                onChange={(event) => setModelParameters(event.target.value)}
                className="edit-control min-h-40 w-full resize-y px-3 py-2 font-mono text-sm"
                spellCheck={false}
              />
            </label>

            <button
              type="button"
              className="vn-button w-full px-5 py-3"
              onClick={() => void generateModel()}
              disabled={isGeneratingModel}
            >
              {isGeneratingModel ? '생성 중' : '모델 생성'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="relative border-t border-[var(--app-border)] px-4 py-3 text-sm font-semibold text-[#ff9ab8]">
            {error}
          </div>
        ) : null}
      </section>
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
    <label className="block space-y-1">
      <span className="edit-label">
        <span className="edit-label__text">{label}</span>
      </span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="edit-control h-11 w-full px-3"
      />
    </label>
  );
}
