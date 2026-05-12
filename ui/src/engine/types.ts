export type DbRow = Record<string, unknown>;

export type TargetStatusSnapshot = DbRow & {
  target?: DbRow | null;
};

export type PlaySnapshot = {
  phase: 'target_select' | 'scene';
  status: DbRow;
  scene: DbRow | null;
  scene_history: DbRow | null;
  target_status: TargetStatusSnapshot | null;
  scene_options: DbRow[];
  target_statuses: TargetStatusSnapshot[];
};

export type ConditionState = {
  statusTags: Set<number>;
  targetTags: Set<number>;
  seenSceneTurns: Map<number, number[]>;
  chosenOptions: Set<number>;
};
