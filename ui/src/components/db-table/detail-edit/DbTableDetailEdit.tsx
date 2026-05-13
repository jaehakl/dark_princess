import { useEffect, useMemo, useState } from 'react';
import type { GenImageResponse, UpsertResponse } from '../../../api/api';
import { dbTables } from '../../../api/api';
import {
  addMinutesToDateTimeIso,
  getCurrentDateTimeIsoFloor30,
} from '../../../utils/datetime';
import { DbTypeChildrenImageEdit } from '../../db-type/children-image';
import { DbTypeDatetimeEdit } from '../../db-type/datetime';
import { DbTypeDictListEdit } from '../../db-type/dict-list';
import { DbTypeFkEdit } from '../../db-type/fk';
import { DbTypeImageFileEdit } from '../../db-type/image-file';
import { DbTypeNumberEdit } from '../../db-type/number';
import { DbTypeTextEdit } from '../../db-type/text';
import { DbTypeUrlEdit } from '../../db-type/url';

type DbTableName = keyof typeof dbTables;
type DbRow = Record<string, unknown>;

type DbColumn = {
  label: string;
  type: string;
  targetTable?: DbTableName;
  required?: boolean;
  linkType?: 'children' | 'computed' | 'secondary';
  options?: { key: string; label: string }[];
};

type DetailTableConfig = {
  label: string;
  columns: Record<string, DbColumn>;
  upsertRow: (items: unknown) => Promise<UpsertResponse[]>;
  upsertFormRow?: (
    item: unknown,
    files?: Record<string, File | null | undefined>
  ) => Promise<UpsertResponse>;
  generateImage?: (id: number) => Promise<GenImageResponse>;
  deleteRows: (ids: number[]) => Promise<void>;
};

type DbTableDetailEditProps = {
  tableName: DbTableName;
  row: DbRow;
  columns: string[];
  datetimeColumnSpan?: 'auto' | 'full';
  onSaved?: (response: UpsertResponse[]) => void;
  onDeleted?: () => void;
};

const dbTypeRenderers = {};
const TEXT_MAX_ROWS = 8;
const DB_TYPE_EDITOR_BACKGROUND_CLASS = 'bg-transparent';
type UploadModalMode = 'closed' | 'confirm' | 'uploading';

export function DbTableDetailEdit({
  tableName,
  row,
  columns: columnKeys,
  datetimeColumnSpan = 'auto',
  onSaved,
  onDeleted,
}: DbTableDetailEditProps) {
  void dbTypeRenderers;

  const tableConfig = dbTables[tableName] as DetailTableConfig;
  const columnKeysKey = columnKeys.join('\n');
  const columns = useMemo(
    () => {
      const selectedColumnKeys = columnKeysKey ? columnKeysKey.split('\n') : [];
      const resolvedColumns = selectedColumnKeys
        .map((key) => {
          const config = tableConfig.columns[key];
          return config ? { key, config } : null;
        })
        .filter((column): column is { key: string; config: DbColumn } =>
          Boolean(column)
        );

      return resolvedColumns
        .map((column, index) => ({ column, index }))
        .sort(
          (left, right) =>
            Number(isChildrenImageListFkColumn(left.column.config)) -
              Number(isChildrenImageListFkColumn(right.column.config)) ||
            left.index - right.index
        )
        .map(({ column }) => column);
    },
    [columnKeysKey, tableConfig.columns]
  );
  const imageColumns = useMemo(
    () => columns.filter(({ config }) => config.type === 'image'),
    [columns]
  );
  const rowWithDefaults = useMemo(
    () => buildRowWithDatetimeDefaults(row, columns),
    [columns, row]
  );
  const [draftRow, setDraftRow] = useState<DbRow>(rowWithDefaults);
  const [baseRow, setBaseRow] = useState<DbRow>(rowWithDefaults);
  const rowId = getRowId(draftRow) ?? getRowId(baseRow) ?? getRowId(row);
  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>(
    {}
  );
  const [autoSyncedFieldKeys, setAutoSyncedFieldKeys] = useState<Set<string>>(
    () => new Set()
  );
  const hasPendingImageUpload = useMemo(
    () => imageColumns.some(({ key }) => Boolean(pendingFiles[key])),
    [imageColumns, pendingFiles]
  );
  const hasPendingFileUpload = useMemo(
    () =>
      columns.some(
        ({ key, config }) => config.type === 'file' && Boolean(pendingFiles[key])
      ),
    [columns, pendingFiles]
  );
  const hasPendingUpload = hasPendingImageUpload || hasPendingFileUpload;
  const uploadTitleText =
    hasPendingImageUpload && hasPendingFileUpload
      ? '이미지/파일 업로드'
      : hasPendingImageUpload
        ? '이미지 업로드'
        : '파일 업로드';
  const uploadObjectText =
    hasPendingImageUpload && hasPendingFileUpload
      ? '이미지와 파일을'
      : hasPendingImageUpload
        ? '이미지를'
        : '파일을';
  const existingUploadText =
    hasPendingImageUpload && hasPendingFileUpload
      ? '기존 이미지와 파일은'
      : hasPendingImageUpload
        ? '기존 이미지는'
        : '기존 파일은';
  const hasDetailImagePreview = useMemo(
    () =>
      imageColumns.some(
        ({ key }) =>
          pendingFiles[key]?.type.startsWith('image/') ||
          (typeof draftRow[key] === 'string' && Boolean(draftRow[key].trim()))
      ),
    [draftRow, imageColumns, pendingFiles]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [uploadModalMode, setUploadModalMode] =
    useState<UploadModalMode>('closed');
  const [uploadElapsedSeconds, setUploadElapsedSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isUploadModalOpen = uploadModalMode !== 'closed';
  const hasPendingFiles = useMemo(
    () => Object.values(pendingFiles).some(Boolean),
    [pendingFiles]
  );
  const hasDraftChanges = useMemo(() => {
    const keys = new Set([...Object.keys(baseRow), ...Object.keys(draftRow)]);
    return (
      hasPendingFiles ||
      [...keys].some(
        (key) =>
          !autoSyncedFieldKeys.has(key) &&
          !Object.is(baseRow[key], draftRow[key])
      )
    );
  }, [autoSyncedFieldKeys, baseRow, hasPendingFiles, draftRow]);
  const canSave =
    hasDraftChanges &&
    !isSaving &&
    !isDeleting &&
    !isGeneratingImage &&
    !isUploadModalOpen;
  const generateImage = tableConfig.generateImage;
  const savedPrompt =
    typeof baseRow.prompt === 'string' ? baseRow.prompt.trim() : '';
  const canGenerateImage =
    Boolean(generateImage) &&
    rowId !== null &&
    Boolean(savedPrompt) &&
    !hasDraftChanges &&
    !hasPendingUpload &&
    !isSaving &&
    !isDeleting &&
    !isGeneratingImage &&
    !isUploadModalOpen;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDraftRow(rowWithDefaults);
    setBaseRow(rowWithDefaults);
    setPendingFiles({});
    setAutoSyncedFieldKeys(new Set());
    setMessage(null);
    setError(null);
    setUploadModalMode('closed');
    setUploadElapsedSeconds(0);
    setIsGeneratingImage(false);
  }, [rowWithDefaults]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (uploadModalMode !== 'uploading') {
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setUploadElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [uploadModalMode]);

  return (
    <div
      className={[
        'min-w-[275px] space-y-2',
        'edit-text',
      ].join(' ')}
    >
      <section>
        <div className="grid grid-cols-2">
          {columns.map(({ key, config }) => (
            <div
              key={key}
              className={[
                'py-2',
                config.type === 'datetime'
                  ? datetimeColumnSpan === 'full'
                    ? 'col-span-2'
                    : 'col-span-2 md:col-span-1'
                  : 'col-span-2',
              ].join(' ')}
            >
              {config.type === 'datetime' ? (
                <DbTypeDatetimeEdit
                  label={config.label}
                  value={draftRow[key]}
                  required={config.required}
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onChange={(value) =>
                    setDraftRow((current) => ({ ...current, [key]: value }))
                  }
                />
              ) : config.type === 'text' && config.options ? (
                <div className="grid gap-1 md:grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] md:items-center md:gap-3">
                  <p
                    className={[
                      'edit-label edit-text',
                      config.required ? 'edit-label--required' : '',
                    ].join(' ')}
                  >
                    <span className="edit-label__text">{config.label}</span>
                  </p>
                  <select
                    value={typeof draftRow[key] === 'string' ? draftRow[key] : ''}
                    className="h-8 min-w-0 rounded border border-[var(--app-border)] bg-transparent px-2 text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] edit-text"
                    onChange={(event) =>
                      setDraftRow((current) => ({ ...current, [key]: event.target.value }))
                    }
                  >
                    <option value="">선택</option>
                    {typeof draftRow[key] === 'string' &&
                    draftRow[key] &&
                    !config.options.some((option) => option.key === draftRow[key]) ? (
                      <option value={draftRow[key]}>
                        기존 값: {draftRow[key]}
                      </option>
                    ) : null}
                    {config.options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : config.type === 'text' ? (
                <DbTypeTextEdit
                  label={config.label}
                  value={draftRow[key]}
                  maxRows={TEXT_MAX_ROWS}
                  required={config.required}
                  surface="subtle"
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onModalSave={handleSave}
                  isModalSaveEnabled={canSave}
                  isModalSaveBusy={isSaving}
                  onChange={(value) =>
                    setDraftRow((current) => ({ ...current, [key]: value }))
                  }
                />
              ) : config.type === 'dict-list' ? (
                <DbTypeDictListEdit
                  label={config.label}
                  value={draftRow[key]}
                  required={config.required}
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onChange={(value) =>
                    setDraftRow((current) => ({ ...current, [key]: value }))
                  }
                />
              ) : config.type === 'int' || config.type === 'float' ? (
                <DbTypeNumberEdit
                  label={config.label}
                  value={draftRow[key]}
                  numberType={config.type}
                  required={config.required}
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onChange={(value) =>
                    setDraftRow((current) => ({ ...current, [key]: value }))
                  }
                />
              ) : config.type === 'boolean' ? (
                <div className="grid gap-1 md:grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] md:items-center md:gap-3">
                  <p
                    className={[
                      'edit-label edit-text',
                      config.required ? 'edit-label--required' : '',
                    ].join(' ')}
                  >
                    <span className="edit-label__text">{config.label}</span>
                  </p>
                  <label className="inline-flex min-h-8 max-w-max items-center gap-2 rounded border border-[var(--app-border)] bg-transparent px-2.5 text-xs font-semibold text-[var(--app-text)]">
                    <input
                      type="checkbox"
                      checked={draftRow[key] === true}
                      className="h-4 w-4 accent-[var(--app-accent)]"
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setDraftRow((current) => ({
                          ...current,
                          [key]: checked,
                        }));
                      }}
                    />
                    <span>{draftRow[key] === true ? '예' : '아니오'}</span>
                  </label>
                </div>
              ) : config.type === 'url' ? (
                <DbTypeUrlEdit
                  label={config.label}
                  value={draftRow[key]}
                  required={config.required}
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onChange={(value) =>
                    setDraftRow((current) => ({ ...current, [key]: value }))
                  }
                />
              ) : config.type === 'image' || config.type === 'file' ? (
                <DbTypeImageFileEdit
                  label={config.label}
                  value={draftRow[key]}
                  kind={config.type}
                  pendingFile={pendingFiles[key] ?? null}
                  required={config.required}
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onFileChange={(file) =>
                    setPendingFiles((current) => ({
                      ...current,
                      [key]: file,
                    }))
                  }
                />
              ) : config.type === 'fk' ? (
                <DbTypeFkEdit
                  label={config.label}
                  targetTable={config.targetTable}
                  value={draftRow[key]}
                  mode="single"
                  required={config.required}
                  currentTableName={tableName}
                  currentRowId={rowId}
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onChange={(value) =>
                    setDraftRow((current) => ({ ...current, [key]: value }))
                  }
                />
              ) : isChildrenImageListFkColumn(config) ? (
                <DbTypeChildrenImageEdit
                  label={config.label}
                  targetTable={config.targetTable}
                  value={draftRow[key]}
                  required={config.required}
                  currentTableName={tableName}
                  currentRowId={rowId}
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onChange={(value) => syncAutoSyncedListFk(key, value)}
                />
              ) : config.type === 'list-fk' ? (
                <DbTypeFkEdit
                  label={config.label}
                  targetTable={config.targetTable}
                  value={draftRow[key]}
                  mode="list"
                  linkType={config.linkType ?? 'secondary'}
                  required={config.required}
                  currentTableName={tableName}
                  currentRowId={rowId}
                  editorBackgroundClassName={DB_TYPE_EDITOR_BACKGROUND_CLASS}
                  editorTextClassName="edit-text"
                  onChange={(value) =>
                    setDraftRow((current) => ({ ...current, [key]: value }))
                  }
                />
              ) : (
                <div className="grid gap-1 md:grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] md:gap-3">
                  <div>
                    <p
                      className={[
                        'edit-label edit-text',
                        config.required ? 'edit-label--required' : '',
                      ].join(' ')}
                    >
                      <span className="edit-label__text">{config.label}</span>
                    </p>
                  </div>
                  <pre
                    className={[
                      'min-w-0 whitespace-pre-wrap break-words leading-5 text-[var(--app-text)]',
                      'edit-text',
                    ].join(' ')}
                  >
                    {stringifyValue(draftRow[key])}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        {error ? (
          <p
            className={[
              'rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700',
              'edit-text',
            ].join(' ')}
          >
            {error}
          </p>
        ) : null}

        {message ? (
          <p
            className={[
              'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700',
              'edit-text',
            ].join(' ')}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-2 flex flex-row flex-wrap justify-end gap-2">
          {generateImage ? (
            <button
              type="button"
              disabled={!canGenerateImage}
              className={[
                'inline-flex h-10 min-w-24 items-center justify-center whitespace-nowrap rounded-md px-4 transition disabled:cursor-not-allowed disabled:opacity-50',
                'edit-text',
              ].join(' ')}
              onClick={() => {
                void handleGenerateImage();
              }}
            >
              {isGeneratingImage ? '생성 중' : '이미지 생성'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canSave}
            className={[
              'inline-flex h-10 min-w-16 items-center justify-center whitespace-nowrap rounded-md px-4 transition disabled:cursor-not-allowed disabled:opacity-60',
              'edit-text',
            ].join(' ')}
            onClick={handleSave}
          >
            {isSaving ? '저장 중' : '저장'}
          </button>
          <button
            type="button"
            disabled={
              !hasDraftChanges ||
              isSaving ||
              isDeleting ||
              isGeneratingImage ||
              isUploadModalOpen
            }
            className={[
              'inline-flex h-10 min-w-20 items-center justify-center whitespace-nowrap rounded-md px-4 transition disabled:cursor-not-allowed disabled:opacity-50',
              'edit-text',
            ].join(' ')}
            onClick={handleReset}
          >
            원본 복원
          </button>
          <button
            type="button"
            disabled={
              rowId === null ||
              isSaving ||
              isDeleting ||
              isGeneratingImage ||
              isUploadModalOpen
            }
            className={[
              'inline-flex h-10 min-w-16 items-center justify-center whitespace-nowrap rounded-md px-4 transition disabled:cursor-not-allowed disabled:opacity-50',
              'edit-text',
            ].join(' ')}
            onClick={handleDelete}
          >
            {isDeleting ? '삭제 중' : '삭제'}
          </button>
        </div>
      </section>

      {hasDetailImagePreview ? (
        <section>
          <div className="flex flex-wrap gap-3">
            {imageColumns.map(({ key, config }) => (
              <DetailImagePreview
                key={key}
                label={config.label}
                value={draftRow[key]}
                pendingFile={pendingFiles[key] ?? null}
                textClassName="edit-text"
              />
            ))}
          </div>
        </section>
      ) : null}

      {uploadModalMode !== 'closed' ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
        >
          <button
            type="button"
            aria-label="닫기"
            className="modal-backdrop absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
            onClick={closeUploadModal}
          />
          <section className="relative z-10 w-full max-w-[min(28rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
            <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
              <p className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">
                {uploadTitleText}
              </p>
              {uploadModalMode === 'confirm' ? (
                <button
                  type="button"
                  aria-label="닫기"
                  className="inline-flex h-6 w-6 items-center justify-center rounded transition"
                  onClick={closeUploadModal}
                >
                  x
                </button>
              ) : null}
            </div>

            <div className="px-4 py-4">
              {uploadModalMode === 'confirm' ? (
                <p className="leading-6 text-[var(--app-text)] edit-text">
                  {uploadObjectText} 업로드합니다. {existingUploadText}{' '}
                  삭제됩니다. 진행할까요?
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="font-semibold text-[var(--app-text)] edit-text">
                    업로드 중...
                  </p>
                  <p className="text-[var(--app-muted)] edit-text">
                    경과 시간: {uploadElapsedSeconds}초
                  </p>
                </div>
              )}
            </div>

            {uploadModalMode === 'confirm' ? (
              <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-3 py-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center rounded px-3 transition"
                  onClick={closeUploadModal}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center rounded px-3 transition disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => {
                    void handleUploadConfirm();
                  }}
                >
                  진행
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );

  async function handleSave() {
    setError(null);
    setMessage(null);

    if (!hasDraftChanges) {
      return;
    }

    if (!draftRow || typeof draftRow !== 'object' || Array.isArray(draftRow)) {
      setError('저장할 데이터는 JSON object여야 합니다.');
      return;
    }

    if (hasPendingUpload) {
      setUploadElapsedSeconds(0);
      setUploadModalMode('confirm');
      return;
    }

    await executeSave();
  }

  async function executeSave() {
    setIsSaving(true);
    try {
      const uploadFiles = Object.fromEntries(
        Object.entries(pendingFiles).filter(([, file]) => Boolean(file))
      );
      const hasUploadFiles = Object.keys(uploadFiles).length > 0;
      const upsertFormRow = tableConfig.upsertFormRow;
      if (hasUploadFiles && !upsertFormRow) {
        throw new Error('파일 업로드 저장을 지원하지 않는 테이블입니다.');
      }

      const response =
        hasUploadFiles && upsertFormRow
          ? [await upsertFormRow(draftRow, uploadFiles)]
          : await tableConfig.upsertRow([draftRow]);
      const fkWarnings = response
        .flatMap((item) => Object.entries(item.fk_not_found ?? {}))
        .map(([field, ids]) => `${field}: ${ids.join(', ')}`);

      if (fkWarnings.length > 0) {
        setPendingFiles({});
        setMessage(`저장되었지만 찾지 못한 참조가 있습니다. ${fkWarnings.join(' / ')}`);
        return;
      }

      setPendingFiles({});
      const savedRow = mergeSavedResponseId(draftRow, response);
      setDraftRow(savedRow);
      setBaseRow(savedRow);
      setAutoSyncedFieldKeys(new Set());
      onSaved?.(response);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '저장하지 못했습니다.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUploadConfirm() {
    if (isSaving) {
      return;
    }

    setUploadElapsedSeconds(0);
    setUploadModalMode('uploading');
    await executeSave();
    setUploadModalMode('closed');
    setUploadElapsedSeconds(0);
  }

  function closeUploadModal() {
    if (uploadModalMode === 'uploading') {
      return;
    }

    setUploadModalMode('closed');
    setUploadElapsedSeconds(0);
  }

  async function handleGenerateImage() {
    if (!generateImage || rowId === null || !canGenerateImage) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsGeneratingImage(true);
    try {
      const response = await generateImage(rowId);
      const nextRow = { ...baseRow, image: response.image };
      setDraftRow(nextRow);
      setBaseRow(nextRow);
      setPendingFiles((current) => ({ ...current, image: null }));
      setAutoSyncedFieldKeys(new Set());
      setMessage(`이미지를 생성했습니다. seed: ${response.seed}`);
      onSaved?.([{ id: response.id }]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '이미지를 생성하지 못했습니다.'
      );
    } finally {
      setIsGeneratingImage(false);
    }
  }

  function handleReset() {
    setDraftRow(baseRow);
    setPendingFiles({});
    setAutoSyncedFieldKeys(new Set());
    setMessage(null);
    setError(null);
    setUploadModalMode('closed');
    setUploadElapsedSeconds(0);
  }

  async function handleDelete() {
    if (rowId === null) {
      return;
    }

    const confirmed = window.confirm('이 행을 삭제할까요?');
    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsDeleting(true);
    try {
      await tableConfig.deleteRows([rowId]);
      onDeleted?.();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '삭제하지 못했습니다.'
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function syncAutoSyncedListFk(field: string, value: number[]) {
    setAutoSyncedFieldKeys((current) => {
      if (current.has(field)) {
        return current;
      }

      const nextFieldKeys = new Set(current);
      nextFieldKeys.add(field);
      return nextFieldKeys;
    });
    setDraftRow((current) =>
      areNumberArraysEqual(getListIds(current[field]), value)
        ? current
        : { ...current, [field]: [...value] }
    );
  }
}

function DetailImagePreview({
  label,
  value,
  pendingFile,
  textClassName,
}: {
  label: string;
  value: unknown;
  pendingFile: File | null;
  textClassName: string;
}) {
  const pendingImageUrl = useMemo(
    () =>
      pendingFile?.type.startsWith('image/')
        ? URL.createObjectURL(pendingFile)
        : null,
    [pendingFile]
  );
  const imageUrl =
    pendingImageUrl ??
    (typeof value === 'string' && value.trim() ? value.trim() : null);

  useEffect(() => {
    return () => {
      if (pendingImageUrl) {
        URL.revokeObjectURL(pendingImageUrl);
      }
    };
  }, [pendingImageUrl]);

  if (!imageUrl) {
    return null;
  }

  return (
    <figure className="max-w-[250px]">
      <img
        src={imageUrl}
        alt=""
        className="max-h-[250px] max-w-[250px] rounded-md border border-[var(--app-border)] bg-white object-contain"
      />
      <figcaption
        className={[
          'mt-1 truncate font-semibold text-[var(--app-muted)]',
          textClassName,
        ].join(' ')}
      >
        {label}
      </figcaption>
    </figure>
  );
}

function buildRowWithDatetimeDefaults(
  row: DbRow,
  columns: { key: string; config: DbColumn }[]
) {
  if (getRowId(row) !== null) {
    return row;
  }

  const datetimeColumns = columns.filter(
    ({ config }) => config.type === 'datetime'
  );
  if (datetimeColumns.length === 0) {
    return row;
  }

  const requiredDefault = getCurrentDateTimeIsoFloor30();
  const optionalDefault =
    addMinutesToDateTimeIso(requiredDefault, 30) ?? requiredDefault;
  let nextRow: DbRow | null = null;

  for (const { key, config } of datetimeColumns) {
    if (hasRowValue(row[key])) {
      continue;
    }

    nextRow = nextRow ?? { ...row };
    nextRow[key] = config.required ? requiredDefault : optionalDefault;
  }

  return nextRow ?? row;
}

function hasRowValue(value: unknown) {
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }

  return value !== null && value !== undefined;
}

function getRowId(row: DbRow) {
  return typeof row.id === 'number' ? row.id : null;
}

function mergeSavedResponseId(row: DbRow, response: UpsertResponse[]) {
  const savedId = response[0]?.id;
  if (typeof savedId !== 'number' || Object.is(row.id, savedId)) {
    return row;
  }

  return { ...row, id: savedId };
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const jsonValue = JSON.stringify(value, null, 2);
  return jsonValue === undefined ? '-' : jsonValue;
}

function isChildrenImageListFkColumn(config: DbColumn) {
  if (
    config.type !== 'list-fk' ||
    config.linkType !== 'children' ||
    !config.targetTable
  ) {
    return false;
  }

  const targetTableConfig = dbTables[config.targetTable] as
    | { columns?: Record<string, DbColumn> }
    | undefined;
  return Boolean(
    targetTableConfig?.columns &&
      Object.values(targetTableConfig.columns).some(
        (columnConfig) => columnConfig.type === 'image'
      )
  );
}

function getListIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === 'number');
}

function areNumberArraysEqual(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}
