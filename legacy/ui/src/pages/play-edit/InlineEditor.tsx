import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import type { DbRow, DbTableName } from './types';

export function InlineEditor({
  tableName,
  row,
  columns,
  emptyText,
  onChanged,
}: {
  tableName: DbTableName;
  row: DbRow | null;
  columns: string[];
  emptyText: string;
  onChanged: () => Promise<void>;
}) {
  if (!row) {
    return <p className="py-10 text-center text-sm text-[var(--app-muted)]">{emptyText}</p>;
  }

  return (
    <DbTableDetailEdit
      tableName={tableName}
      row={row}
      columns={columns}
      onSaved={() => void onChanged()}
      onDeleted={() => void onChanged()}
    />
  );
}
