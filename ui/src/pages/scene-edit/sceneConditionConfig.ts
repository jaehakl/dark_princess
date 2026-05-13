import { dbTables } from '../../api/api';

export type ConditionKind =
  | 'target'
  | 'status_tag'
  | 'target_tag'
  | 'scene_seen'
  | 'status_stat'
  | 'target_interaction';

export const CONDITION_KINDS = [
  'target',
  'status_tag',
  'target_tag',
  'scene_seen',
  'status_stat',
  'target_interaction',
] as const satisfies readonly ConditionKind[];

export const CONDITION_COLUMNS_BY_KIND: Record<ConditionKind, string[]> = {
  target: ['operator', 'target_id', 'sort_order'],
  status_tag: ['operator', 'tag_id', 'sort_order'],
  target_tag: ['operator', 'tag_id', 'sort_order'],
  scene_seen: ['operator', 'scene_ref_id', 'sort_order'],
  status_stat: ['operator', 'stat_field', 'numeric_value', 'sort_order'],
  target_interaction: ['operator', 'stat_field', 'numeric_value', 'sort_order'],
};

export function getConditionKind(value: unknown): ConditionKind {
  return CONDITION_KINDS.includes(value as ConditionKind)
    ? (value as ConditionKind)
    : 'target';
}

export function getConditionKindLabel(kind: ConditionKind) {
  const kindOptions = dbTables.SceneCondition.columns.kind.options ?? [];
  return kindOptions.find((option) => option.key === kind)?.label ?? kind;
}

export function getDefaultConditionOperator(kind: ConditionKind) {
  return ['status_tag', 'target_tag', 'scene_seen'].includes(kind)
    ? 'has'
    : 'eq';
}
