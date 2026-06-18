import type { SceneRecord } from '../../api/type';
import type {
  EMPTY_INSTANT_PROMPT_DRAFT,
  PROMPT_EDITOR_COLUMNS,
  STATUS_CHANGE_FIELDS,
} from './constants';

export type PromptEditorColumnName = (typeof PROMPT_EDITOR_COLUMNS)[number]['key'];

export type SaveMode =
  | 'text'
  | 'image';

export type StatusChangeKey = (typeof STATUS_CHANGE_FIELDS)[number]['key'];

export type StatusChangeValues = Record<StatusChangeKey, string>;

export type InstantPromptName = keyof typeof EMPTY_INSTANT_PROMPT_DRAFT;

export type SceneEditComponentProps = {
  sceneId: number | null;
  initialScene: SceneRecord;
  onSaved: (sceneId: number) => void;
  onDeleted?: (sceneId: number) => void;
  onClose?: () => void;
  onDuplicate?: (scene: SceneRecord) => void;
  modalLayout?: boolean;
};
