import type { PlaySnapshot } from '../../api/api';

export function ScenePlayPanel({
  snapshot,
  loading,
  busy,
  onSelectTarget,
  onChooseOption,
}: {
  snapshot: PlaySnapshot | null;
  loading: boolean;
  busy: boolean;
  onSelectTarget: (targetStatusId: number) => Promise<void>;
  onChooseOption: (optionId: number) => Promise<void>;
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
        <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2">
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
                  {image ? (
                    <img src={image} alt="" className="h-36 w-full object-cover" />
                  ) : (
                    <div className="h-24 bg-[var(--app-panel-strong)]" />
                  )}
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
    <div className="flex h-full min-h-[32rem] flex-col">
      <div className="relative min-h-[22rem] flex-1 overflow-hidden bg-slate-950">
        {sceneImage ? (
          <img src={sceneImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[var(--app-panel-strong)]" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 to-transparent p-5">
          <h2 className="text-xl font-semibold text-white">
            {String(snapshot.scene.name ?? '장면')}
          </h2>
          {sceneDescription ? (
            <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-white">
              {sceneDescription}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 border-t border-[var(--app-border)] bg-white p-3">
        {snapshot.scene_options.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--app-border)] px-3 py-4 text-center text-sm text-[var(--app-muted)]">
            선택지가 없습니다.
          </p>
        ) : (
          snapshot.scene_options.map((option) => (
            <button
              key={String(option.id)}
              type="button"
              disabled={busy || typeof option.id !== 'number'}
              className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-left transition hover:border-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-50"
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
