import { useCallback, useReducer, useRef } from 'react';
import type { Photo } from '../../../../shared/types.js';
import { fetchPhotoEdits, savePhotoEdits } from '../../api/plugins.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import type { ChainAction, ChainState } from '../editChain.js';
import { ViewerEditSession, type HistoryLoad, type SaveStatus } from './saveQueue.js';

export interface ViewerEdits {
  chain: ChainState;
  /** Editing is possible once the photo's stored history has loaded */
  load: HistoryLoad;
  dispatch: (action: ChainAction) => void;
  status: SaveStatus;
  error: unknown;
  retry: () => void;
  discard: () => void;
  /** Waits for the photo's saves to finish; true when everything is saved and the viewer may leave it */
  settle: () => Promise<boolean>;
}

/**
 * Edits of the photo shown in the viewer, saved automatically with their undo history, which is kept in the
 * photo's sidecar and so survives closing the viewer.
 */
export function useViewerEdits(photo: Photo): ViewerEdits {
  const { replaceViewerPhoto, refreshSelectedPhotos } = usePalomaStore();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const session = useRef<ViewerEditSession | null>(null);
  session.current ??= new ViewerEditSession(
    {
      load: fetchPhotoEdits,
      save: (photoId, { edits, history }) => savePhotoEdits(photoId, edits, history),
    },
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
    load: edits.load(photo),
    dispatch: useCallback((action: ChainAction) => edits.dispatch(photo, action), [edits, photo.id]),
    status: queue.status,
    error: queue.error,
    retry: () => queue.retry(),
    discard: () => edits.discard(photo),
    settle: async () => (await queue.idle()) === 'saved',
  };
}
