import type {
  DbTableName as ApiDbTableName,
  GetListRequest,
  UpsertResponse,
} from '../../api/type';

export type DbRow = Record<string, unknown>;
export type DbTableName = ApiDbTableName;
export type PlayEditTab = 'status' | 'target' | 'history';

export type TableConfig = {
  label: string;
  listRows: (request: GetListRequest) => Promise<{ items: DbRow[]; total: number }>;
  upsertRow: (items: unknown) => Promise<UpsertResponse[]>;
};
