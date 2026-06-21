import type { ImageRecord } from '../../api/type';
import {
  Button,
  ImageFrame,
  ModalBackdrop,
  Panel,
  PanelHeader,
} from '../ui';

type ImageDetailModalProps = {
  image: ImageRecord;
  isDeleting: boolean;
  onClose: () => void;
  onDelete: (image: ImageRecord) => void;
};

function formatValue(value: number | null | undefined) {
  return typeof value === 'number' ? String(value) : '-';
}

function formatParameters(parameters: Record<string, unknown> | null | undefined) {
  if (!parameters) {
    return '-';
  }
  return JSON.stringify(parameters, null, 2);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[rgba(255,208,222,0.14)] py-2 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#f1c4d0]">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm font-semibold text-[#fff7ef]">
        {value}
      </dd>
    </div>
  );
}

export function ImageDetailModal({
  image,
  isDeleting,
  onClose,
  onDelete,
}: ImageDetailModalProps) {
  return (
    <ModalBackdrop topAligned>
      <Panel
        className="w-[min(72rem,calc(100vw-2rem))] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-detail-title"
      >
        <PanelHeader>
          <div className="min-w-0">
            <p className="text-[0.78rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">
              Image
            </p>
            <h2 id="image-detail-title" className="truncate text-lg font-semibold text-[#fff7ef]">
              Image #{formatValue(image.id)}
            </h2>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="danger"
              className="px-3 py-2 text-xs"
              onClick={() => onDelete(image)}
              disabled={isDeleting}
            >
              {isDeleting ? '삭제 중' : '삭제'}
            </Button>
            <Button className="px-3 py-2 text-xs" onClick={onClose} disabled={isDeleting}>
              닫기
            </Button>
          </div>
        </PanelHeader>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(18rem,0.95fr)_minmax(24rem,1.05fr)]">
          <ImageFrame className="relative rounded-[8px] border border-[rgba(255,218,228,0.2)]">
            {image.image_object_key ? (
              <img
                src={image.image_object_key}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : null}
          </ImageFrame>

          <div className="min-w-0 space-y-4">
            <dl className="rounded-[8px] border border-[rgba(255,208,222,0.2)] bg-[rgba(12,5,18,0.56)] px-4 py-2">
              <DetailRow label="ID" value={formatValue(image.id)} />
              <DetailRow label="Seed" value={formatValue(image.seed_image_id)} />
              <DetailRow label="Cut" value={formatValue(image.cut_count)} />
              <DetailRow label="Family root" value={formatValue(image.family_root_image_id)} />
              <DetailRow label="Family count" value={formatValue(image.family_image_count)} />
            </dl>

            <dl className="rounded-[8px] border border-[rgba(255,208,222,0.2)] bg-[rgba(12,5,18,0.56)] px-4 py-2">
              <DetailRow label="Positive" value={image.positive_prompt?.trim() || '-'} />
              <DetailRow label="Negative" value={image.negative_prompt?.trim() || '-'} />
            </dl>

            <div className="rounded-[8px] border border-[rgba(255,208,222,0.2)] bg-[rgba(12,5,18,0.56)] p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#f1c4d0]">
                Model parameters
              </p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[#fff7ef]">
                {formatParameters(image.model_parameters)}
              </pre>
            </div>
          </div>
        </div>
      </Panel>
    </ModalBackdrop>
  );
}
