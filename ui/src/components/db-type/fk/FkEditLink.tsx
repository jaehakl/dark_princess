import { Link } from 'react-router-dom';
import { LinkIcon } from '../../../app/icons';
import type { DbTableName } from './types';

export function FkEditLink({
  tableName,
  rowId,
}: {
  tableName: DbTableName;
  rowId: number;
}) {
  const to = `/list-edit?table=${encodeURIComponent(
    tableName
  )}&rowId=${encodeURIComponent(String(rowId))}`;

  return (
    <Link
      to={to}
      aria-label={`${tableName} ${rowId} 목록 편집 페이지 열기`}
      title="목록 편집 페이지로 이동"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--app-muted)] transition hover:bg-[var(--app-panel-strong)] hover:text-[var(--app-text)]"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <LinkIcon />
    </Link>
  );
}
