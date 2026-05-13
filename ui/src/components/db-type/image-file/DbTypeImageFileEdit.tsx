import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardIcon, DiskIcon, UploadIcon } from '../../../app/icons';

type DbTypeImageFileKind = 'image' | 'file';

type DbTypeImageFileEditProps = {
  label: string;
  value: unknown;
  kind: DbTypeImageFileKind;
  editorBackgroundClassName: string;
  editorTextClassName?: string;
  pendingFile?: File | null;
  hideLabel?: boolean;
  required?: boolean;
  onFileChange: (file: File | null) => void;
};

type ClipboardImage = {
  file: File;
  url: string;
};

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export function DbTypeImageFileEdit({
  label,
  value,
  kind,
  editorBackgroundClassName,
  editorTextClassName = 'text-xs',
  pendingFile = null,
  hideLabel = false,
  required = false,
  onFileChange,
}: DbTypeImageFileEditProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const currentUrl = formatUrlValue(value);
  const [isClipboardModalOpen, setIsClipboardModalOpen] = useState(false);
  const [clipboardImage, setClipboardImage] = useState<ClipboardImage | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [isReadingClipboard, setIsReadingClipboard] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [clipboardStage, setClipboardStage] = useState<'preview' | 'ready'>(
    'preview'
  );
  const hasPendingFile = Boolean(pendingFile);
  const displayText = hasPendingFile
    ? `${pendingFile?.name ?? '파일'} 업로드 대기`
    : getCurrentDisplayText(currentUrl);
  const pendingPreviewUrl = useMemo(
    () =>
      kind === 'image' && pendingFile && isImageFile(pendingFile)
        ? URL.createObjectURL(pendingFile)
        : null,
    [kind, pendingFile]
  );
  const imagePreviewUrl =
    kind === 'image' ? pendingPreviewUrl ?? currentUrl : null;

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
    };
  }, [pendingPreviewUrl]);

  useEffect(() => {
    return () => {
      if (clipboardImage) {
        URL.revokeObjectURL(clipboardImage.url);
      }
    };
  }, [clipboardImage]);

  return (
    <>
      <div
        className={
          hideLabel
            ? 'grid grid-cols-1 items-center gap-2'
            : 'grid grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] items-center gap-2 md:gap-3'
        }
      >
        {hideLabel ? null : (
          <p
            className={[
              'edit-label',
              required ? 'edit-label--required' : '',
              editorTextClassName,
            ].join(' ')}
          >
            <span className="edit-label__text">{label}</span>
          </p>
        )}

        <div className="flex h-6 min-w-0 items-center gap-1">
          <input
            ref={inputRef}
            type="file"
            accept={kind === 'image' ? IMAGE_ACCEPT : undefined}
            className="hidden"
            onChange={(event) => {
              onFileChange(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />

          {kind === 'image' ? (
            <button
              type="button"
              title={displayText}
              className={[
                'flex h-6 min-w-0 flex-1 items-center gap-1 rounded px-1.5 text-left leading-none transition disabled:cursor-default',
              ].join(' ')}
              disabled={!imagePreviewUrl}
              onClick={() => setIsImageModalOpen(true)}
            >
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt=""
                  className="h-5 w-3.5 shrink-0 rounded border border-[var(--app-border)] bg-white object-contain"
                />
              ) : null}
              <span className="min-w-0 truncate">{displayText}</span>
            </button>
          ) : (
            <a
              href={currentUrl || undefined}
              target="_blank"
              rel="noreferrer"
              download
              title={displayText}
              className={[
                'flex h-6 min-w-0 flex-1 items-center gap-1 rounded border border-transparent px-1.5 leading-none transition hover:border-[var(--app-border)] hover:bg-[var(--app-panel)]',
                editorTextClassName,
                editorBackgroundClassName,
                currentUrl || hasPendingFile
                  ? 'text-[var(--app-text)]'
                  : 'text-[var(--app-muted)]',
              ].join(' ')}
              onClick={(event) => {
                if (!currentUrl) {
                  event.preventDefault();
                }
              }}
            >
              {currentUrl || hasPendingFile ? (
                <DiskIcon className="h-3.5 w-3.5 shrink-0" />
              ) : null}
              <span className="min-w-0 truncate">{displayText}</span>
            </a>
          )}

          {hasPendingFile ? (
            <button
              type="button"
              aria-label={`${label} 업로드 대기 취소`}
              title="업로드 대기 취소"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition"
              onClick={() => onFileChange(null)}
            >
              x
            </button>
          ) : null}

          {kind === 'image' ? (
            <button
              type="button"
              aria-label={`${label} 클립보드 이미지 가져오기`}
              title="클립보드 이미지 가져오기"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition"
              onClick={openClipboardModal}
            >
              <ClipboardIcon />
            </button>
          ) : null}

          <button
            type="button"
            aria-label={`${label} 파일 선택`}
            title="파일 선택"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition"
            onClick={() => inputRef.current?.click()}
          >
            <UploadIcon />
          </button>
        </div>
      </div>

      {isClipboardModalOpen ? (
        <ClipboardImageModal
          label={label}
          image={clipboardImage}
          error={clipboardError}
          stage={clipboardStage}
          isReading={isReadingClipboard}
          onClose={closeClipboardModal}
          onRetry={readClipboardImage}
          onConfirm={() => {
            if (!clipboardImage) {
              return;
            }

            onFileChange(clipboardImage.file);
            setClipboardStage('ready');
          }}
        />
      ) : null}

      {isImageModalOpen && imagePreviewUrl ? (
        <ImagePreviewModal
          label={label}
          imageUrl={imagePreviewUrl}
          onClose={() => setIsImageModalOpen(false)}
        />
      ) : null}
    </>
  );

  function openClipboardModal() {
    setClipboardStage('preview');
    setIsClipboardModalOpen(true);
    void readClipboardImage();
  }

  function closeClipboardModal() {
    setIsClipboardModalOpen(false);
    setClipboardError(null);
    setIsReadingClipboard(false);
    setClipboardStage('preview');
    clearClipboardImage();
  }

  async function readClipboardImage() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      clearClipboardImage();
      setClipboardError('이 브라우저에서는 클립보드 이미지를 읽을 수 없습니다.');
      return;
    }

    setIsReadingClipboard(true);
    setClipboardError(null);
    setClipboardStage('preview');

    try {
      const items = await navigator.clipboard.read();
      const imageItem = findClipboardImageItem(items);
      if (!imageItem) {
        clearClipboardImage();
        setClipboardError('클립보드에 이미지가 없습니다.');
        return;
      }

      const blob = await imageItem.item.getType(imageItem.type);
      const file = new File([blob], buildClipboardFileName(imageItem.type), {
        type: imageItem.type,
      });
      const objectUrl = URL.createObjectURL(file);

      setClipboardImage((current) => {
        if (current) {
          URL.revokeObjectURL(current.url);
        }

        return { file, url: objectUrl };
      });
    } catch {
      clearClipboardImage();
      setClipboardError('클립보드에서 이미지를 읽지 못했습니다.');
    } finally {
      setIsReadingClipboard(false);
    }
  }

  function clearClipboardImage() {
    setClipboardImage((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }

      return null;
    });
  }
}

function ImagePreviewModal({
  label,
  imageUrl,
  onClose,
}: {
  label: string;
  imageUrl: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
    >
      <button
        type="button"
        aria-label="닫기"
        className="modal-backdrop absolute inset-0 bg-slate-950/70"
        onClick={onClose}
      />
      <section className="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-[min(31rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
          <p className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">
            {label}
          </p>
          <button
            type="button"
            aria-label="닫기"
            className="inline-flex h-6 w-6 items-center justify-center rounded transition"
            onClick={onClose}
          >
            x
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--app-panel-strong)] p-3">
          <div className="dp-image-frame mx-auto w-full overflow-hidden rounded-md border border-[var(--app-border)] bg-white">
            <img src={imageUrl} alt="" className="dp-image-media" />
          </div>
        </div>
      </section>
    </div>
  );
}

function ClipboardImageModal({
  label,
  image,
  error,
  stage,
  isReading,
  onClose,
  onRetry,
  onConfirm,
}: {
  label: string;
  image: ClipboardImage | null;
  error: string | null;
  stage: 'preview' | 'ready';
  isReading: boolean;
  onClose: () => void;
  onRetry: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
    >
      <button
        type="button"
        aria-label="닫기"
        className="modal-backdrop absolute inset-0 bg-slate-950/30"
        onClick={onClose}
      />
      <section className="relative z-10 w-full max-w-[min(30rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
          <p className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">
            {label} 클립보드 이미지
          </p>
          <button
            type="button"
            aria-label="닫기"
            className="inline-flex h-6 w-6 items-center justify-center rounded transition"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div className="px-3 py-3">
          <div className="dp-image-frame mx-auto flex w-full max-w-[18rem] items-center justify-center overflow-hidden rounded border border-[var(--app-border)] bg-white p-2">
            {isReading ? (
              <p className="text-xs text-[var(--app-muted)]">
                클립보드 이미지를 읽는 중입니다.
              </p>
            ) : image ? (
              <img
                src={image.url}
                alt=""
                className="dp-image-media rounded"
              />
            ) : (
              <p className="text-xs text-[var(--app-muted)]">
                표시할 클립보드 이미지가 없습니다.
              </p>
            )}
          </div>

          {stage === 'ready' ? (
            <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
              업로드 준비됨
            </p>
          ) : null}

          {error ? (
            <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-3 py-2">
          <button
            type="button"
            className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
            onClick={onRetry}
          >
            다시 읽기
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
            onClick={onClose}
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!image || isReading || stage === 'ready'}
            className="inline-flex h-7 items-center justify-center rounded px-2.5 transition disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onConfirm}
          >
            확인
          </button>
        </div>
      </section>
    </div>
  );
}

function findClipboardImageItem(items: ClipboardItem[]) {
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (imageType) {
      return { item, type: imageType };
    }
  }

  return null;
}

function buildClipboardFileName(contentType: string) {
  const extension = getImageExtension(contentType);
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(/[-:T]/g, '');

  return `clipboard-image-${timestamp}.${extension}`;
}

function getImageExtension(contentType: string) {
  if (contentType === 'image/jpeg') {
    return 'jpg';
  }

  const subtype = contentType.split('/')[1];
  return subtype && /^[a-z0-9]+$/i.test(subtype) ? subtype.toLowerCase() : 'png';
}

function formatUrlValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

function getCurrentDisplayText(url: string) {
  if (!url) {
    return '-';
  }

  return getFileNameFromUrl(url) ?? url;
}

function getFileNameFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url, window.location.origin);
    const pathname = parsedUrl.pathname;
    const lastSegment = pathname.split('/').filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : null;
  } catch {
    const lastSegment = url.split('?')[0]?.split('/').filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : null;
  }
}
