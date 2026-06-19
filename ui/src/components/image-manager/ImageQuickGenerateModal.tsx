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

type ImageQuickGenerateModalProps = {
  positivePrompt: string;
  negativePrompt: string;
  isLoadingDefaults: boolean;
  isSubmitting: boolean;
  error: string | null;
  onPositivePromptChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  onReloadDefaults: () => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function ImageQuickGenerateModal({
  positivePrompt,
  negativePrompt,
  isLoadingDefaults,
  isSubmitting,
  error,
  onPositivePromptChange,
  onNegativePromptChange,
  onReloadDefaults,
  onSubmit,
  onClose,
}: ImageQuickGenerateModalProps) {
  const isBusy = isLoadingDefaults || isSubmitting;

  return (
    <ModalBackdrop topAligned role="presentation">
      <Panel
        className="max-h-[min(38rem,calc(100dvh-3rem))] w-[min(44rem,100%)] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-quick-generate-title"
      >
        <PanelHeader>
          <div className="min-w-0">
            <p className="text-[0.78rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">
              Image generation
            </p>
            <h2 id="image-quick-generate-title" className="truncate text-lg font-semibold text-[#fff7ef]">
              빠른 생성
            </h2>
          </div>
          <Button
            variant="danger"
            className="px-3 py-2 text-xs"
            onClick={onClose}
            disabled={isBusy}
          >
            닫기
          </Button>
        </PanelHeader>

        <SectionBody className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <FieldLabel required>positive prompt</FieldLabel>
            <FormControl
              as="textarea"
              value={positivePrompt}
              onChange={(event) => onPositivePromptChange(event.target.value)}
              className="min-h-36 w-full resize-y px-3 py-2 text-sm leading-5"
              disabled={isBusy}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <FieldLabel>negative prompt</FieldLabel>
            <FormControl
              as="textarea"
              value={negativePrompt}
              onChange={(event) => onNegativePromptChange(event.target.value)}
              className="min-h-28 w-full resize-y px-3 py-2 text-sm leading-5"
              disabled={isBusy}
            />
          </div>

          {error ? (
            <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
            <Button
              className="inline-flex items-center gap-2 px-4 py-2 text-sm"
              onClick={onReloadDefaults}
              disabled={isBusy}
            >
              {isLoadingDefaults ? <Spinner aria-hidden="true" /> : null}
              기본값 다시 불러오기
            </Button>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <Button
                className="px-4 py-2 text-sm"
                onClick={onClose}
                disabled={isBusy}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={onSubmit}
                disabled={isBusy}
              >
                {isSubmitting ? <Spinner aria-hidden="true" /> : null}
                생성
              </Button>
            </div>
          </div>
        </SectionBody>
      </Panel>
    </ModalBackdrop>
  );
}
