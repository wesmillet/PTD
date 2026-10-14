/**
 * Maps edited in the in-game editor, kept in memory per level id so a
 * test-play (which restarts the level scene) and later edits see the same
 * draft. Nothing is persisted: Export downloads the Tiled JSON.
 */
import { cloneModel, type MapModel } from './tiled';

const drafts = new Map<string, MapModel>();

export const editorStore = {
  get(levelId: string): MapModel | undefined {
    const m = drafts.get(levelId);
    return m ? cloneModel(m) : undefined;
  },
  set(levelId: string, model: MapModel): void {
    drafts.set(levelId, cloneModel(model));
  },
  clear(levelId: string): void {
    drafts.delete(levelId);
  },
  has(levelId: string): boolean {
    return drafts.has(levelId);
  },
};
