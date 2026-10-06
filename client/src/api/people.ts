import type {
  AssignFacesResult, DetectedFaceInput, Person, PersonFace, PersonInput, PersonSummary, PhotoPeople, RelativeRect, SimilarFaces,
  UnassignedFaces,
} from '../../../shared/types.js';
import { apiRequest } from './http.js';

export const fetchPeople = (): Promise<PersonSummary[]> => apiRequest<PersonSummary[]>('GET', '/api/people');

export const fetchPerson = (id: string): Promise<Person> => apiRequest<Person>('GET', `/api/people/${id}`);

/** A new person; without a name it is unknown. */
export const createPerson = (input: PersonInput = {}): Promise<Person> => apiRequest<Person>('POST', '/api/people', input);

export const updatePerson = (id: string, input: PersonInput): Promise<Person> => apiRequest<Person>('PATCH', `/api/people/${id}`, input);

/** Removes the person's faces from every folder, then the person. */
export const deletePerson = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/people/${id}`);

/** The person's faces with a rectangle, to choose the avatar from. */
export const fetchPersonFaces = (id: string): Promise<PersonFace[]> => apiRequest<PersonFace[]>('GET', `/api/people/${id}/faces`);

/** Adds the person to a photo: on the detected face `faceId`, or without a rectangle. */
export const addPersonToPhoto = (photoId: number, person: string, faceId?: number): Promise<PhotoPeople> =>
  apiRequest<PhotoPeople>('POST', `/api/photos/${photoId}/people`, faceId === undefined ? { person } : { person, faceId });

export const removePersonFromPhoto = (photoId: number, person: string): Promise<PhotoPeople> =>
  apiRequest<PhotoPeople>('DELETE', `/api/photos/${photoId}/people/${person}`);

export const fetchSimilarFaces = (id: string): Promise<SimilarFaces> => apiRequest<SimilarFaces>('GET', `/api/people/${id}/similar`);

export const assignFaces = (id: string, faceIds: number[]): Promise<AssignFacesResult> =>
  apiRequest<AssignFacesResult>('POST', `/api/people/${id}/faces`, { faceIds });

export const dismissFaces = (id: string, faceIds: number[]): Promise<{ success: true }> =>
  apiRequest('POST', `/api/people/${id}/dismissals`, { faceIds });

/** The photos among `photoIds` that still need face detection with `detector`. */
export const fetchPendingDetection = (photoIds: number[], detector: string): Promise<{ pending: number[] }> =>
  apiRequest('POST', '/api/faces/pending', { photoIds, detector });

export const saveDetectedFaces = (photoId: number, detector: string, fileHash: string, faces: DetectedFaceInput[]): Promise<{ faces: number }> =>
  apiRequest('PUT', `/api/photos/${photoId}/detected-faces`, { detector, fileHash, faces });

/** The person's avatar image; null when they have none (a placeholder is shown). */
export const avatarUrl = (id: string, version: string | null): string | null =>
  version === null ? null : `/api/people/${id}/avatar?v=${version}`;

export const rectQuery = (rect: RelativeRect): string =>
  [rect.left, rect.top, rect.right, rect.bottom].map((value) => value.toFixed(6)).join(',');

/** A square crop around a face of the unedited photo. */
export const faceCropUrl = (photoId: number, rect: RelativeRect, size = 160): string =>
  `/api/photos/${photoId}/face?rect=${rectQuery(rect)}&size=${size}`;

/** The image face detection runs on: the unedited photo, upright. */
export const faceSourceUrl = (photoId: number): string => `/api/photos/${photoId}/face-source`;

/** The people on a photo with their face rectangles, and the detected faces that belong to no one. */
export const fetchPhotoPeople = (photoId: number): Promise<PhotoPeople> => apiRequest<PhotoPeople>('GET', `/api/photos/${photoId}/people`);

/** Detected faces that belong to no person, newest photos first; `limit` 0 gives only their number. */
export const fetchUnassignedFaces = (limit?: number): Promise<UnassignedFaces> =>
  apiRequest<UnassignedFaces>('GET', limit === undefined ? '/api/faces/unassigned' : `/api/faces/unassigned?limit=${limit}`);
