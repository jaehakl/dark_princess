import type { UpsertResponse } from '../../api/type';
import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import {
  CONDITION_COLUMNS_BY_KIND,
  CONDITION_KINDS,
  type ConditionKind,
  getConditionKind,
  getConditionKindLabel,
} from './sceneConditionConfig';

type DbRow = Record<string, unknown>;

export function SceneConditionEditor({
  row,
  onSaved,
  onDeleted,
}: {
  row: DbRow;
  onSaved: (response: UpsertResponse[]) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const kind = getConditionKind(row.kind);
  const kindLabel = getConditionKindLabel(kind);

  return (
    <div className="space-y-3">
      <div className="grid gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 md:grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] md:items-center md:gap-3">
        <p className="edit-label edit-text">
          <span className="edit-label__text">종류</span>
        </p>
        <p className="edit-text font-semibold text-[var(--app-text)]">
          {kindLabel}
        </p>
      </div>

      <DbTableDetailEdit
        tableName="SceneCondition"
        row={row}
        columns={CONDITION_COLUMNS_BY_KIND[kind]}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
}

export function ConditionKindSelect({
  value,
  onChange,
}: {
  value: ConditionKind;
  onChange: (value: ConditionKind) => void;
}) {
  return (
    <select
      value={value}
      className="h-9 min-w-0 rounded-md border border-[var(--app-border)] bg-white px-2 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
      onChange={(event) => onChange(getConditionKind(event.target.value))}
    >
      {CONDITION_KINDS.map((kind) => (
        <option key={kind} value={kind}>
          {getConditionKindLabel(kind)}
        </option>
      ))}
    </select>
  );
}
