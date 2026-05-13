import type { ConditionState, DbRow } from './types';
import {
  numberField,
  optionalNumberField,
  recordField,
  rowId,
  stringField,
} from './rows';

export function buildConditionState({
  status,
  targetStatus,
  statusTags,
  targetStatusTags,
  histories,
}: {
  status: DbRow;
  targetStatus: DbRow;
  statusTags: DbRow[];
  targetStatusTags: DbRow[];
  histories: DbRow[];
}): ConditionState {
  const statusId = rowId(status);
  const targetStatusId = rowId(targetStatus);
  const seenSceneTurns = new Map<number, number[]>();

  histories.forEach((history) => {
    const sceneId = optionalNumberField(history, 'scene_id');
    const turn = optionalNumberField(history, 'turn');
    if (sceneId === null || turn === null) {
      return;
    }
    seenSceneTurns.set(sceneId, [...(seenSceneTurns.get(sceneId) ?? []), turn]);
  });

  return {
    statusTags: new Set(
      statusTags
        .filter((item) => optionalNumberField(item, 'status_id') === statusId)
        .map((item) => optionalNumberField(item, 'tag_id'))
        .filter((id): id is number => id !== null),
    ),
    targetTags: new Set(
      targetStatusTags
        .filter((item) => optionalNumberField(item, 'target_status_id') === targetStatusId)
        .map((item) => optionalNumberField(item, 'tag_id'))
        .filter((id): id is number => id !== null),
    ),
    seenSceneTurns,
  };
}

export function conditionMatches(
  condition: DbRow,
  status: DbRow,
  targetStatus: DbRow,
  state: ConditionState,
) {
  const operator = stringField(condition, 'operator').toLowerCase();
  const kind = stringField(condition, 'kind');

  if (kind === 'target') {
    return compareValues(
      optionalNumberField(targetStatus, 'target_id'),
      optionalNumberField(condition, 'target_id'),
      operator,
    );
  }
  if (kind === 'status_tag') {
    return matchExists(state.statusTags.has(numberField(condition, 'tag_id', -1)), operator);
  }
  if (kind === 'target_tag') {
    return matchExists(state.targetTags.has(numberField(condition, 'tag_id', -1)), operator);
  }
  if (kind === 'scene_seen') {
    return matchExists(state.seenSceneTurns.has(numberField(condition, 'scene_ref_id', -1)), operator);
  }
  if (kind === 'status_stat') {
    return compareValues(
      status[stringField(condition, 'stat_field')],
      optionalNumberField(condition, 'numeric_value'),
      operator,
    );
  }
  if (kind === 'target_interaction') {
    const value = recordField(condition, 'value');
    const expected =
      optionalNumberField(condition, 'numeric_value') ??
      (typeof value.value === 'number' ? value.value : null);
    return compareValues(
      recordField(targetStatus, 'interactions')[stringField(condition, 'stat_field')],
      expected,
      operator,
    );
  }

  return false;
}

export function compareValues(left: unknown, right: unknown, operator: string) {
  if (operator === 'eq' || operator === '=' || operator === '==' || operator === '') {
    return left === right;
  }
  if (operator === 'ne' || operator === '!=' || operator === 'not') {
    return left !== right;
  }
  if (typeof left !== 'number' || typeof right !== 'number') {
    return false;
  }
  if (operator === 'gt' || operator === '>') {
    return left > right;
  }
  if (operator === 'gte' || operator === '>=') {
    return left >= right;
  }
  if (operator === 'lt' || operator === '<') {
    return left < right;
  }
  if (operator === 'lte' || operator === '<=') {
    return left <= right;
  }
  return false;
}

function matchExists(exists: boolean, operator: string) {
  return operator === 'not' || operator === 'not_has' || operator === 'ne' || operator === '!='
    ? !exists
    : exists;
}
