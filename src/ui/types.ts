import type { State } from "../core/model";
import type { PhotoRecord } from "../platform/photos";
export type Commit = (
  change: (next: State) => void,
  message: string,
  options?: { photos?: PhotoRecord[]; undo?: boolean; background?: boolean },
) => Promise<boolean>;
