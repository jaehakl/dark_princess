export const STATUS_COLUMNS = [
  'name',
  'turn',
  'cash',
  'strength',
  'agility',
  'intelligence',
  'sense',
  'attractiveness',
  'toughness',
  'stress',
];

export const TARGET_COLUMNS = ['type', 'name', 'description', 'prompt', 'properties', 'image'];

export const SCENE_COLUMNS = [
  'name',
  'description',
  'prompt',
  'priority',
  'repeat_policy',
  'cooldown_turns',
  'image',
  'audio',
  'trigger_blocks',
  'scene_options',
  'scene_results',
];

export const OPTION_COLUMNS = [
  'scene_id',
  'option_key',
  'label',
  'description',
  'next_scene_id',
  'sort_order',
  'is_active',
  'conditions',
];

export const TARGET_STATUS_COLUMNS = [
  'status_id',
  'target_id',
  'interactions',
  'visitable',
  'target_status_tags',
];

export const HISTORY_COLUMNS = [
  'status_id',
  'scene_id',
  'target_status_id',
  'turn',
  'sub_turn',
  'scene_decisions',
  'applied_results',
];
