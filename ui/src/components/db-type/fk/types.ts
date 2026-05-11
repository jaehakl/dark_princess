import type {
  GetListRequest,
  GetListResponse,
  UpsertResponse,
  dbTables,
} from '../../../api/api';

export type DbTableName = keyof typeof dbTables;
export type DbRow = Record<string, unknown>;
export type DbTypeFkEditMode = 'single' | 'list';
export type LinkType = 'secondary' | 'children' | 'computed';

export type LinkTypeCapabilities = {
  canSearchSelect: boolean;
  canCreateTarget: boolean;
  canRemoveSecondaryRelation: boolean;
  canDeleteTarget: boolean;
  canEditTargetRequiredFields: boolean;
  usesLinkedSurface: boolean;
};

export type DbColumn = {
  label: string;
  type: string;
  targetTable?: DbTableName;
  required?: boolean;
  options?: { key: string; label: string }[];
};

export type FkTableConfig = {
  label: string;
  columns: Record<string, DbColumn>;
  listRows: (
    listRequest: GetListRequest
  ) => Promise<GetListResponse<Record<string, unknown>>>;
  upsertRow: (items: unknown) => Promise<UpsertResponse[]>;
  deleteRows: (ids: number[]) => Promise<void>;
};

export type DbTypeFkEditProps = {
  label: string;
  targetTable?: DbTableName;
  value: unknown;
  mode?: DbTypeFkEditMode;
  linkType?: LinkType;
  hideLabel?: boolean;
  required?: boolean;
  currentTableName?: DbTableName;
  currentRowId?: number | null;
  editorBackgroundClassName?: string;
  editorTextClassName?: string;
  onChange?: (value: number | number[] | null) => void;
};

export type RequiredFieldFkEditorProps = {
  label: string;
  targetTable?: DbTableName;
  value: unknown;
  mode: 'single';
  editorBackgroundClassName: string;
  editorTextClassName: string;
  hideLabel: boolean;
  required?: boolean;
  currentTableName?: DbTableName;
  currentRowId?: number | null;
  onChange: (value: unknown) => void;
};

export type EditingCell = {
  row: DbRow;
  columnKey: string;
  config: DbColumn;
} | null;

export type PendingRemoval = {
  rowId: number;
} | null;

export type SearchDropdownPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};
