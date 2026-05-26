import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type { GetListRequest, UpsertResponse } from '../../api/type';
import type { LayoutOutletContext } from '../../app/layout';
import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import { DbTableListSelect } from '../../components/db-table/list-select';
import { MasterDetailLayout } from '../../components/template/master-detail/MasterDetailLayout';
import {
  SceneOptionEditorModal,
  SceneTriggerEditorModal,
} from './SceneConditionTreeModal';

type DbRow = Record<string, unknown>;

type TableConfig = {
  label: string;
  listRows: (request: GetListRequest) => Promise<{ items: DbRow[]; total: number }>;
  upsertRow: (items: unknown) => Promise<UpsertResponse[]>;
  deleteRows: (ids: number[]) => Promise<void>;
};

type DetailState = {
  row: DbRow | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
};

const SCENE_LIST_COLUMNS = ['name', 'priority', 'repeat_policy'];
const SCENE_DETAIL_COLUMNS = [
  'name',
  'description',
  'prompt',
  'priority',
  'repeat_policy',
  'cooldown_turns',
  'image',
  'audio',
  'scene_results',
];

export function SceneEditPage() {
  const { setPageChrome, setQuickAddAction } =
    useOutletContext<LayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const sceneId = parsePositiveId(searchParams.get('scene_id'));
  const targetId = parsePositiveId(searchParams.get('target_id'));
  const optionId = parsePositiveId(searchParams.get('option_id'));
  const isCreateMode = sceneId === null;
  const [detailState, setDetailState] = useState<DetailState>({
    row: null,
    loading: false,
    error: null,
    notFound: false,
  });
  const [listResetKey, setListResetKey] = useState(0);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [isTriggerEditorOpen, setIsTriggerEditorOpen] = useState(false);
  const [isOptionEditorOpen, setIsOptionEditorOpen] = useState(false);

  const updateUrl = useCallback(
    (
      mutate: (nextSearchParams: URLSearchParams) => void,
      options: { replace?: boolean } = {}
    ) => {
      const nextSearchParams = new URLSearchParams(searchParamsString);
      mutate(nextSearchParams);

      if (nextSearchParams.toString() === searchParamsString) {
        return;
      }

      setSearchParams(nextSearchParams, { replace: options.replace ?? false });
    },
    [searchParamsString, setSearchParams]
  );

  const openCreateMode = useCallback(() => {
    updateUrl((nextSearchParams) => {
      nextSearchParams.delete('scene_id');
    });
    setSelectionResetKey((current) => current + 1);
  }, [updateUrl]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPageChrome({
      breadcrumbSuffix: '장면 편집',
      pageTitleSuffix: '장면 편집',
    });
    setQuickAddAction({
      label: '새 장면',
      onClick: openCreateMode,
    });

    return () => {
      setPageChrome(null);
      setQuickAddAction(null);
    };
  }, [openCreateMode, setPageChrome, setQuickAddAction]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(searchParamsString);
    let changed = false;

    (['scene_id', 'target_id', 'option_id'] as const).forEach((key) => {
      const rawValue = nextSearchParams.get(key);
      if (rawValue !== null && parsePositiveId(rawValue) === null) {
        nextSearchParams.delete(key);
        changed = true;
      }
    });

    if (changed) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParamsString, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    if (sceneId === null) {
      setDetailState({
        row: null,
        loading: false,
        error: null,
        notFound: false,
      });
      return;
    }

    const selectedSceneId = sceneId;

    setDetailState({
      row: null,
      loading: true,
      error: null,
      notFound: false,
    });

    async function loadScene() {
      try {
        const response = await (dbTables.Scene as TableConfig).listRows({
          offset: 0,
          limit: null,
          selected_ids: [selectedSceneId],
          search_text: null,
          text_filter: {},
          filter: {},
          sort: null,
        });

        if (cancelled) {
          return;
        }

        const row = response.items[0] ?? null;
        setDetailState({
          row,
          loading: false,
          error: null,
          notFound: row === null,
        });
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setDetailState({
          row: null,
          loading: false,
          error:
            caughtError instanceof Error
              ? caughtError.message
              : '장면을 불러오지 못했습니다.',
          notFound: false,
        });
      }
    }

    void loadScene();

    return () => {
      cancelled = true;
    };
  }, [sceneId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const createRow = useMemo<DbRow>(
    () => ({
      name: '새 장면',
      priority: 0,
      repeat_policy: 'always',
      cooldown_turns: 0,
    }),
    []
  );
  const detailRow = isCreateMode ? createRow : detailState.row;
  const detailTitle =
    isCreateMode
      ? '새 장면'
      : detailRow
        ? String(detailRow.name ?? detailRow.id ?? '장면')
        : '장면 상세';

  return (
    <>
      <MasterDetailLayout
        list={
          <DbTableListSelect
            key={`scene-list-${listResetKey}`}
            tableName="Scene"
            columns={SCENE_LIST_COLUMNS}
            selectedIds={sceneId === null ? [] : [sceneId]}
            onSelectedIdsChange={(selectedIds) => {
              const nextSceneId = selectedIds[0] ?? null;
              updateUrl((nextSearchParams) => {
                nextSearchParams.delete('target_id');
                nextSearchParams.delete('option_id');

                if (typeof nextSceneId !== 'number') {
                  nextSearchParams.delete('scene_id');
                  return;
                }

                nextSearchParams.set('scene_id', String(nextSceneId));
              });
            }}
            pageSize={50}
            initialSort={['priority', 'desc']}
            selectionResetKey={selectionResetKey}
            preserveSelectionOnDataChange
            showPageSizeSelect={false}
            headerActions={
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-xs transition"
                onClick={openCreateMode}
              >
                새 장면
              </button>
            }
            emptyMessage="장면 데이터가 없습니다."
          />
        }
        detail={
          <SceneEditorDetail
            key={sceneId ?? 'new'}
            sceneId={sceneId}
            row={detailRow}
            loading={detailState.loading}
            error={detailState.error}
            notFound={detailState.notFound}
            onSaved={handleSceneSaved}
            onDeleted={handleSceneDeleted}
            onOpenTriggerEditor={() => setIsTriggerEditorOpen(true)}
            onOpenOptionEditor={() => setIsOptionEditorOpen(true)}
          />
        }
        emptyDetail={<SceneEditorEmpty />}
        isDetailOpen
        onDetailClose={openCreateMode}
        detailTitle={detailTitle}
      />

      {isTriggerEditorOpen && sceneId !== null ? (
        <SceneTriggerEditorModal
          sceneId={sceneId}
          onClose={() => setIsTriggerEditorOpen(false)}
        />
      ) : null}

      {isOptionEditorOpen && sceneId !== null ? (
        <SceneOptionEditorModal
          sceneId={sceneId}
          onClose={() => setIsOptionEditorOpen(false)}
        />
      ) : null}
    </>
  );

  async function handleSceneSaved(response: UpsertResponse[]) {
    const savedId = response[0]?.id;
    setListResetKey((current) => current + 1);

    if (isCreateMode && typeof savedId === 'number') {
      if (optionId !== null) {
        const optionResponse = await (dbTables.SceneOption as TableConfig).listRows({
          offset: 0,
          limit: null,
          selected_ids: [optionId],
          search_text: null,
          text_filter: {},
          filter: {},
          sort: null,
        });
        const optionRow = optionResponse.items[0] ?? null;
        const optionSceneId =
          typeof optionRow?.scene_id === 'number' ? optionRow.scene_id : null;
        const optionKey =
          typeof optionRow?.option_key === 'string' ? optionRow.option_key : null;
        const optionLabel =
          typeof optionRow?.label === 'string' ? optionRow.label : null;

        if (optionSceneId === null || optionKey === null || optionLabel === null) {
          throw new Error('다음 장면을 연결할 선택지를 불러오지 못했습니다.');
        }

        await (dbTables.SceneOption as TableConfig).upsertRow([
          {
            id: optionId,
            scene_id: optionSceneId,
            option_key: optionKey,
            label: optionLabel,
            description:
              typeof optionRow.description === 'string' ? optionRow.description : null,
            next_scene_id: savedId,
            sort_order:
              typeof optionRow.sort_order === 'number' ? optionRow.sort_order : 0,
            is_active:
              typeof optionRow.is_active === 'boolean' ? optionRow.is_active : true,
          },
        ]);
      } else {
        await createAutoTriggerConditions({
          sceneId: savedId,
          targetId,
        });
      }

      updateUrl((nextSearchParams) => {
        nextSearchParams.set('scene_id', String(savedId));
        nextSearchParams.delete('target_id');
        nextSearchParams.delete('option_id');
      });
    }
  }

  async function handleSceneDeleted() {
    setListResetKey((current) => current + 1);
    setSelectionResetKey((current) => current + 1);
    updateUrl((nextSearchParams) => {
      nextSearchParams.delete('scene_id');
    });
  }
}

function SceneEditorDetail({
  sceneId,
  row,
  loading,
  error,
  notFound,
  onSaved,
  onDeleted,
  onOpenTriggerEditor,
  onOpenOptionEditor,
}: {
  sceneId: number | null;
  row: DbRow | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  onSaved: (response: UpsertResponse[]) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  onOpenTriggerEditor: () => void;
  onOpenOptionEditor: () => void;
}) {
  if (loading) {
    return <DetailMessage title="장면을 불러오는 중입니다" description="잠시만 기다려 주세요." />;
  }

  if (error) {
    return <DetailMessage title="장면을 불러오지 못했습니다" description={error} />;
  }

  if (notFound || !row) {
    return <DetailMessage title="장면이 없습니다" description="장면이 없거나 삭제되었습니다." />;
  }

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-2">
        <button
          type="button"
          disabled={sceneId === null}
          className="inline-flex h-9 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onOpenTriggerEditor}
        >
          트리거 편집
        </button>
        <button
          type="button"
          disabled={sceneId === null}
          className="inline-flex h-9 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onOpenOptionEditor}
        >
          선택지 편집
        </button>
        {sceneId === null ? (
          <p className="text-sm text-[var(--app-muted)]">
            저장 후 트리거와 선택지를 편집할 수 있습니다.
          </p>
        ) : null}
      </section>

      <DbTableDetailEdit
        tableName="Scene"
        row={row}
        columns={SCENE_DETAIL_COLUMNS}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function SceneEditorEmpty() {
  return (
    <div className="flex h-full min-h-[26rem] flex-col justify-center gap-3 p-5 text-center">
      <h2 className="text-xl font-semibold text-[var(--app-text)]">
        장면을 선택하거나 새 장면을 저장해 주세요
      </h2>
    </div>
  );
}

function DetailMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[18rem] flex-col justify-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-5 text-center">
      <h3 className="text-base font-semibold text-[var(--app-text)]">{title}</h3>
      <p className="text-sm text-[var(--app-muted)]">{description}</p>
    </div>
  );
}

async function createAutoTriggerConditions({
  sceneId,
  targetId,
}: {
  sceneId: number;
  targetId: number | null;
}) {
  if (targetId === null) {
    return;
  }

  const blockResponse = await (dbTables.SceneTriggerBlock as TableConfig).upsertRow([
    {
      scene_id: sceneId,
      label: '자동 조건',
      chance_percent: 100,
      sort_order: 0,
    },
  ]);
  const blockId = blockResponse[0]?.id;
  if (typeof blockId !== 'number') {
    return;
  }

  await (dbTables.SceneCondition as TableConfig).upsertRow(
    [
      {
        kind: 'target',
        operator: 'eq',
        target_id: targetId,
        trigger_block_id: blockId,
        sort_order: 0,
      },
    ]
  );
}

function parsePositiveId(rawValue: string | null) {
  if (rawValue === null || !rawValue.trim()) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}
