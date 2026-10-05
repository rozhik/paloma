import { useCallback, useReducer, useRef } from 'react';
import type { Photo } from '../../../../shared/types.js';
import { savePhotoEdits } from '../../api/plugins.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import type { ChainAction, ChainState } from '../editChain.js';
import { ViewerEditSession, type SaveStatus } from './saveQueue.js';

export interface ViewerEdits {
  chain: ChainState;
  dispatch: (action: ChainAction) => void;
  status: SaveStatus;
  error: unknown;
  retry: () => void;
  discard: () => void;
  /** Waits for the photo's saves to finish; true when everything is saved and the viewer may leave it */
  settle: () => Promise<boolean>;
}

/**
 * Edits of the photo shown in the viewer, saved automatically. The saved chain is the history: Undo removes
 * its last step, whenever that step was made.
 */
export function useViewerEdits(photo: Photo): ViewerEdits {
  const { replaceViewerPhoto, refreshSelectedPhotos } = usePalomaStore();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const session = useRef<ViewerEditSession | null>(null);
  session.current ??= new ViewerEditSession(
    savePhotoEdits,
    rerender,
    (saved) => {
      replaceViewerPhoto(saved);
      refreshSelectedPhotos([saved]);
    },
  );
  const edits = session.current;
  const queue = edits.queue(photo);

  return {
    chain: edits.chain(photo),
    dispatch: useCallback((action: ChainAction) => edits.dispatch(photo, action), [edits, photo.id]),
    status: queue.status,
    error: queue.error,
    retry: () => queue.retry(),
    discard: () => edits.discard(photo),
    settle: async () => (await queue.idle()) === 'saved',
  };
}
