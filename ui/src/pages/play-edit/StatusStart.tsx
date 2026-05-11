import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import { DbTableListSelect } from '../../components/db-table/list-select';
import { STATUS_COLUMNS } from './columns';

export function StatusStart({ onStatusSelected }: { onStatusSelected: (statusId: number) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
      <section className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3 shadow-sm">
        <h1 className="mb-3 text-base font-semibold text-[var(--app-text)]">
          불러올 Status
        </h1>
        <DbTableListSelect
          tableName="Status"
          columns={['name', 'turn', 'sub_turn']}
          onSelectedIdsChange={(selectedIds) => {
            const nextStatusId = selectedIds[0];
            if (typeof nextStatusId === 'number') {
              onStatusSelected(nextStatusId);
            }
          }}
          showPageSizeSelect={false}
          emptyMessage="저장된 Status가 없습니다."
        />
      </section>

      <section className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-[var(--app-text)]">
          새 Status
        </h2>
        <DbTableDetailEdit
          tableName="Status"
          row={{ name: '새 게임', turn: 0, sub_turn: 0 }}
          columns={STATUS_COLUMNS}
          onSaved={(response) => {
            const savedId = response[0]?.id;
            if (typeof savedId === 'number') {
              onStatusSelected(savedId);
            }
          }}
        />
      </section>
    </div>
  );
}
