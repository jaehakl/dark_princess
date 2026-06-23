import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type { GetListRequest, StatusRecord } from '../../api/type';
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
  const [draftStatus, setDraftStatus] = useState<StatusRecord>(() =>
    createInitialStatus(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingStatus, setIsCreatingStatus] = useState(false);
  const [deletingStatusId, setDeletingStatusId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const statusResponse = await dbTables.Status.listRows(LIST_REQUEST);
      setStatuses(statusResponse.items);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    dbTables.Status.listRows(LIST_REQUEST)
      .then((statusResponse) => {
        if (!isMounted) {
          return;
        }
        setStatuses(statusResponse.items);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!isMounted) {
          return;
        }
        setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
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

  async function createStatus() {
    const payload: StatusRecord = {
      ...draftStatus,
      name: draftStatus.name.trim() || 'Status',
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

  const canCreateStatus =
    !isCreatingStatus &&
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

        <SectionBody className="space-y-4">
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
