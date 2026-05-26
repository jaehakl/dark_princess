import type { PlaySnapshot } from '../../engine';

export function ScenePlayPanel({
  snapshot,
  loading,
  busy,
  onSelectTarget,
  onChooseOption,
  onAdvanceTurn,
}: {
  snapshot: PlaySnapshot | null;
  loading: boolean;
  busy: boolean;
  onSelectTarget: (targetStatusId: number) => Promise<void>;
  onChooseOption: (optionId: number) => Promise<void>;
  onAdvanceTurn: () => Promise<void>;
}) {
  if (loading && !snapshot) {
    return (
      <div className="flex h-full min-h-[32rem] items-center justify-center text-[var(--app-muted)]">
        플레이 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex h-full min-h-[32rem] items-center justify-center text-[var(--app-muted)]">
        Status를 선택해 주세요.
      </div>
    );
  }

  if (!snapshot.scene) {
    return (
      <div className="flex h-full min-h-[32rem] flex-col">
        <div className="border-b border-[var(--app-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--app-text)]">
            방문처 선택
          </h2>
          <p className="mt-1 text-sm text-[var(--app-muted)]">
            Turn {String(snapshot.status.turn ?? 0)}
          </p>
        </div>
        <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.target_statuses.length === 0 ? (
            <div className="col-span-full rounded-md border border-dashed border-[var(--app-border)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
              TargetStatus가 없습니다. 방문처 추가로 현재 Status에 대상을 연결하세요.
            </div>
          ) : (
            snapshot.target_statuses.map((targetStatus) => {
              const target = targetStatus.target ?? {};
              const name = typeof target.name === 'string' ? target.name : `Target #${targetStatus.target_id}`;
              const image = typeof target.image === 'string' ? target.image : null;
              const description = typeof target.description === 'string' ? target.description : '';
              const visitable = targetStatus.visitable === true;

              return (
                <button
                  key={String(targetStatus.id)}
                  type="button"
                  disabled={!visitable || busy || typeof targetStatus.id !== 'number'}
                  className={[
                    'overflow-hidden rounded-md border text-left transition disabled:cursor-not-allowed',
                    visitable
                      ? 'border-[var(--app-border)] bg-white hover:border-[var(--app-accent)]'
                      : 'border-[var(--app-border)] bg-[var(--app-panel-strong)] opacity-60',
                  ].join(' ')}
                  onClick={() => {
                    if (typeof targetStatus.id === 'number') {
                      void onSelectTarget(targetStatus.id);
                    }
                  }}
                >
                  <div className="dp-image-frame overflow-hidden border-b border-[var(--app-border)]">
                    {image ? (
                      <img src={image} alt="" className="dp-image-media" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-sm text-[var(--app-muted)]">
                        이미지 없음
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{name}</span>
                      <span className="shrink-0 text-xs text-[var(--app-muted)]">
                        {visitable ? '방문 가능' : '비활성'}
                      </span>
                    </div>
                    {description ? (
                      <p className="line-clamp-2 text-sm font-normal text-[var(--app-muted)]">
                        {description}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  const sceneImage = typeof snapshot.scene.image === 'string' ? snapshot.scene.image : null;
  const sceneDescription =
    typeof snapshot.scene.description === 'string' ? snapshot.scene.description : '';

  return (
    <div className="flex h-full min-h-[32rem] flex-col bg-[var(--app-panel-strong)]">
      <div className="relative min-h-[26rem] flex-1 overflow-hidden bg-slate-950">
        {sceneImage ? (
          <img
            src={sceneImage}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--app-panel-strong)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/78 via-black/42 to-black/10" />

        <div className="relative z-10 flex h-full min-h-[26rem] flex-col">
          <div className="border-b border-white/20 px-4 py-3">
            <p className="text-sm font-semibold text-white/82">
              Turn {String(snapshot.status.turn ?? 0)}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {String(snapshot.scene.name ?? '장면')}
            </h2>
          </div>

          <div className="min-h-[10rem] max-w-3xl flex-1 overflow-y-auto px-4 py-4">
            {sceneDescription ? (
              <p className="whitespace-pre-wrap text-base font-normal leading-7 text-white drop-shadow">
                {sceneDescription}
              </p>
            ) : (
              <p className="text-sm text-white/75">
                장면 설명이 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2 border-t border-[var(--app-border)] bg-[var(--app-panel-strong)] p-3">
        {snapshot.scene_options.length === 0 ? (
          <button
            type="button"
            disabled={busy || typeof snapshot.scene_history?.id !== 'number'}
            className="rounded-md border border-[var(--app-border)] bg-white px-4 py-3 text-left font-semibold transition hover:border-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void onAdvanceTurn();
            }}
          >
            다음 턴으로
          </button>
        ) : (
          snapshot.scene_options.map((option) => (
            <button
              key={String(option.id)}
              type="button"
              disabled={busy || typeof option.id !== 'number'}
              className="rounded-md border border-[var(--app-border)] bg-white px-4 py-3 text-left transition hover:border-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (typeof option.id === 'number') {
                  void onChooseOption(option.id);
                }
              }}
            >
              <span className="block font-semibold">{String(option.label ?? option.option_key ?? '선택지')}</span>
              {typeof option.description === 'string' && option.description ? (
                <span className="mt-1 block text-sm font-normal text-[var(--app-muted)]">
                  {option.description}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
