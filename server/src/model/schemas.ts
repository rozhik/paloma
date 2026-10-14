import { z } from 'zod/v4';
import { MAX_ALIAS, MAX_COMMENT, MAX_LINK, MAX_LINKS, MAX_NAME } from '../services/personValidation.js';

// The JSON documents of library objects and the changeset that changes them. These schemas are the one source
// for the published JSON Schema (`GET /api/schema`) and for validating changesets; every description is written
// for an AI client reading the schema.

/** Marks a property that a changeset cannot set. */
const readOnly = <T extends z.ZodType>(schema: T): T => schema.meta({ readOnly: true });

export const relativeRect = z.object({
  left: z.number().min(0).max(1).describe('Left edge as a fraction 0..1 of the unedited image width, from the left'),
  top: z.number().min(0).max(1).describe('Top edge as a fraction 0..1 of the unedited image height, from the top'),
  right: z.number().min(0).max(1).describe('Right edge as a fraction 0..1 of the unedited image width, from the left'),
  bottom: z.number().min(0).max(1).describe('Bottom edge as a fraction 0..1 of the unedited image height, from the top'),
}).describe('A rectangle on the photo as fractions of the original (unedited) image size');

export const geotag = z.object({
  lat: z.number().min(-90).max(90).describe('Latitude in decimal degrees, -90..90, north positive'),
  lon: z.number().min(-180).max(180).describe('Longitude in decimal degrees, -180..180, east positive'),
}).describe('A location in decimal degrees (WGS 84)');

/**
 * One edit step as any filter accepts it. The published schema replaces it with one definition per filter of
 * the active plugins (see jsonSchema.ts).
 */
export const editStep = z.object({
  filter: z.string().min(1).describe('Name of the filter, e.g. "crop64", "rotate", "bw"'),
  enabled: z.literal(false).optional().describe('false keeps the step without applying it; leave out to apply it'),
}).catchall(z.unknown()).describe('One step of the non-destructive edit chain: the filter name and its parameters as named keys');

/** Size limits of changeset values (object-changes capability). */
export const MAX_CAPTION = 2000;
export const MAX_TAGS = 200;
export const MAX_TAG = 100;
export const MAX_PHOTO_LIST = 200;
export const MAX_ALBUM_NAME = 200;
export const MAX_ALBUM_LOCATION = 200;
export const MAX_ALBUM_DESCRIPTION = 5000;
export const MAX_EDIT_STEPS = 100;
/** Album tokens, contact ids and refs are much shorter; this only bounds what is accepted. */
export const MAX_ID = 100;

export const editChain = z.array(editStep).max(MAX_EDIT_STEPS)
  .describe(`Non-destructive edits applied from first to last when the photo is shown or exported. The photo file is never changed. [] means no edits. At most ${MAX_EDIT_STEPS} steps`);

const photoId = z.number().int().positive();
const contactId = z.string().regex(/^[0-9a-f]{16}$/);

export const photoDocument = z.object({
  type: readOnly(z.literal('photo').describe('Always "photo"')),
  id: readOnly(photoId.describe('Photo id in this library. Ids can change when the library is rebuilt; folder.id + fileName name the file')),
  folder: readOnly(z.object({
    id: z.number().int().describe('Folder id'),
    name: z.string().describe('Folder name: the last segment of its path (the full path on the server is not shown)'),
  }).describe('The folder the photo file is in')),
  fileName: readOnly(z.string().describe('File name in the folder. Files are never renamed, moved or deleted through this model')),
  width: readOnly(z.number().int().describe('Width of the original image in pixels')),
  height: readOnly(z.number().int().describe('Height of the original image in pixels')),
  fileSize: readOnly(z.number().int().describe('File size in bytes')),
  takenAt: readOnly(z.string().nullable().describe('When the photo was taken (ISO 8601 local time from EXIF or the file); null when unknown')),
  star: z.boolean().describe('Starred (a favourite). Set true or false'),
  hidden: z.boolean().describe('Hidden photos are left out of lists and searches unless asked for. Set true or false'),
  caption: z.string().nullable().describe('Description of the photo; null when there is none. Set a string; "" removes the description'),
  tags: z.array(z.string()).describe('Tags (keywords), compared ignoring letter case. Set an array to replace them, or {"add": [...], "remove": [...]} to adjust them'),
  location: geotag.nullable().describe('Where the photo was taken; null when unknown. Set {"lat", "lon"}, or null to remove the location, also one from the camera (the file itself is not changed)'),
  locationSource: readOnly(z.enum(['exif', 'user']).nullable().describe('"exif" when the location comes from the camera, "user" when it was set in Paloma or Picasa, null without a location')),
  place: readOnly(z.string().nullable().describe('Place name of the location in English when known; null otherwise')),
  albums: z.array(z.object({
    id: z.string().describe('Album token'),
    name: z.string().nullable().describe('Album name; null for an untitled album'),
  })).describe('Albums the photo is in. Set an array of album tokens to replace them, or {"add": [...], "remove": [...]} with tokens (or "@ref" of an album created in the same changeset)'),
  people: z.array(z.object({
    id: z.string().describe('Contact id of the person (16 hex digits)'),
    name: z.string().nullable().describe('Shown name; null for an unknown person'),
    rect: relativeRect.nullable().describe('The face frame on the photo; null when the person is marked without a frame'),
  })).describe('People on the photo, one item per face. Set an array or {"add": [...], "remove": [...]} of contact ids; add {"person": id, "face": detectedFaceId} to assign a detected face. Removing a person removes all their faces from the photo'),
  detectedFaces: readOnly(z.array(z.object({
    id: z.number().int().describe('Detected face id, usable as "face" when adding a person'),
    rect: relativeRect,
  })).describe('Faces found by face detection that belong to no person yet')),
  edits: editChain.describe('Non-destructive edit chain applied from first to last. Set the whole new chain; [] removes all edits'),
  modified: readOnly(z.boolean().describe('Whether the photo has saved edits')),
}).describe('A photo or video file of the library and everything Paloma stores about it');

export const albumDocument = z.object({
  type: readOnly(z.literal('album').describe('Always "album"')),
  id: readOnly(z.string().describe('Album token (32 hex digits for albums made in Paloma or Picasa)')),
  name: z.string().nullable().describe('Album name; null for an untitled album. Set a non-empty string'),
  date: readOnly(z.string().nullable().describe('When the album was made (ISO 8601 with offset)')),
  description: z.string().nullable().describe('Album description. Set a string; "" or null removes it'),
  location: z.string().nullable().describe('Place the album is about, as free text. Set a string; "" or null removes it'),
  cover: photoId.nullable().describe('Id of the cover photo; null when the album has no photo you can see. Set the id of a photo of the album, or null for the default (the first photo)'),
  photoCount: readOnly(z.number().int().describe('Photos in the album that are not hidden')),
}).describe('An album: a named set of photos from any folders. Photos are added and removed through the photos\' "albums" attribute');

export const personDocument = z.object({
  type: readOnly(z.literal('person').describe('Always "person"')),
  id: readOnly(contactId.describe('Contact id: 16 lowercase hex digits')),
  name: z.string().nullable().describe('Name; null for an unknown person (a face nobody named yet). Set a non-empty string; a known person\'s name cannot be removed'),
  alias: z.string().nullable().describe('Short name or nickname. Set a string, or null to remove'),
  comment: z.string().nullable().describe('Free-text note. Set a string, or null to remove'),
  links: z.array(z.string()).describe('Profile links: absolute http or https URLs, at most 20. Set the whole list'),
  birth: z.string().nullable().describe('Birth year "YYYY" or date "YYYY-MM-DD", not in the future. Set a string, or null to remove'),
  gender: z.enum(['female', 'male']).nullable().describe('Set "female", "male" or null'),
  hasAvatar: readOnly(z.boolean().describe('Whether the person has a face to show as avatar')),
  photoCount: readOnly(z.number().int().describe('Photos that are not hidden and show the person')),
}).describe('A person who appears on photos. Profile fields other than the name can be set only for a person with a name');

export const folderDocument = z.object({
  type: readOnly(z.literal('folder').describe('Always "folder"')),
  id: readOnly(z.number().int().describe('Folder id')),
  name: readOnly(z.string().describe('Folder name: the last segment of its path (the full path on the server is not shown)')),
  photoCount: readOnly(z.number().int().describe('Photos in the folder that are not hidden')),
}).describe('A folder of photo files on the server; read-only');

export const tagDocument = z.object({
  type: readOnly(z.literal('tag').describe('Always "tag"')),
  id: readOnly(z.string().describe('The tag as shown (its most used spelling)')),
  name: readOnly(z.string().describe('The tag as shown')),
  photoCount: readOnly(z.number().int().describe('Photos that are not hidden and have the tag, ignoring letter case')),
}).describe('A tag used on at least one photo; read-only. Rename a tag by adding the new and removing the old one on its photos');

export const documentSchemas = {
  photo: photoDocument,
  album: albumDocument,
  person: personDocument,
  folder: folderDocument,
  tag: tagDocument,
} as const;

// --- Changesets ---

/** `@ref`: an album or person created earlier in the same changeset. */
export const REF = /^@[A-Za-z0-9_-]{1,64}$/;
export const refName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
  .describe('A name for the new object, so later changes in the same changeset can use "@<ref>" as its id');

const albumToken = z.string().min(1).max(MAX_ID).describe('Album token, or "@<ref>" of an album created earlier in this changeset');
const personRef = z.string().min(1).max(MAX_ID).describe('Contact id, or "@<ref>" of a person created earlier in this changeset');

/** An array replaces the list; `add`/`remove` adjust it. */
const listChange = <T extends z.ZodType>(item: T, what: string, max: number) => z.union([
  z.array(item).max(max).describe(`The new ${what}, replacing the current ones; at most ${max}`),
  z.object({
    add: z.array(item).max(max).optional().describe(`${what} to add at the end when missing; at most ${max}`),
    remove: z.array(item).max(max).optional().describe(`${what} to remove; at most ${max}`),
  }).strict().describe(`Adjust the ${what}`),
]).describe(`The ${what}: an array replaces them, {"add", "remove"} adjusts them`);

const photoPerson = z.union([
  personRef,
  z.object({
    person: personRef,
    face: z.number().int().optional().describe('A detected face of this photo (from detectedFaces) to assign to the person'),
  }).strict(),
]);

export const photoSet = z.object({
  star: photoDocument.shape.star,
  hidden: photoDocument.shape.hidden,
  caption: z.string().max(MAX_CAPTION).describe(`New description, at most ${MAX_CAPTION} characters; "" removes it`),
  tags: listChange(z.string().max(MAX_TAG).describe(`A tag, at most ${MAX_TAG} characters`), 'tags', MAX_TAGS),
  location: photoDocument.shape.location,
  albums: listChange(albumToken, 'albums', MAX_PHOTO_LIST),
  people: listChange(photoPerson, 'people', MAX_PHOTO_LIST),
  edits: photoDocument.shape.edits,
}).partial().strict().describe('Photo attributes to set');

const albumFields = {
  name: z.string().max(MAX_ALBUM_NAME).describe(`Album name, not empty, at most ${MAX_ALBUM_NAME} characters`),
  description: z.string().max(MAX_ALBUM_DESCRIPTION).nullable().describe(`Description, at most ${MAX_ALBUM_DESCRIPTION} characters; "" or null removes it`),
  location: z.string().max(MAX_ALBUM_LOCATION).nullable().describe(`Location text, at most ${MAX_ALBUM_LOCATION} characters; "" or null removes it`),
};

export const albumCreateSet = z.object({
  ...albumFields,
  photos: z.array(photoId).min(1).describe('Ids of the album\'s photos; at least one, since albums are stored with their photos'),
}).partial({ description: true, location: true }).strict().describe('The new album');

export const albumUpdateSet = z.object({
  ...albumFields,
  cover: albumDocument.shape.cover,
}).partial().strict().describe('Album attributes to set');

export const personSet = z.object({
  name: z.string().max(MAX_NAME).describe(`Name, not empty, at most ${MAX_NAME} characters`),
  alias: z.string().max(MAX_ALIAS).nullable().describe(`Short name or nickname, at most ${MAX_ALIAS} characters. Set a string, or null to remove`),
  comment: z.string().max(MAX_COMMENT).nullable().describe(`Free-text note, at most ${MAX_COMMENT} characters. Set a string, or null to remove`),
  links: z.array(z.string().max(MAX_LINK)).max(MAX_LINKS)
    .describe(`Profile links: absolute http or https URLs, at most ${MAX_LINKS} of at most ${MAX_LINK} characters. Set the whole list`),
  birth: personDocument.shape.birth,
  gender: personDocument.shape.gender,
}).partial().strict().describe('Person attributes to set');

const OPS = {
  create: 'Create a new object',
  update: 'Set attributes of existing objects',
  delete: 'Delete objects',
} as const;
const op = <K extends keyof typeof OPS>(name: K) => z.literal(name).describe(OPS[name]);
const type = <K extends 'photo' | 'album' | 'person'>(name: K) => z.literal(name).describe(`Kind of object: ${name}`);

const target = <T extends z.ZodType>(id: T) => ({
  id: id.optional().describe('The object to change; use either id or ids'),
  ids: z.array(id).min(1).optional().describe('The objects to change; use either id or ids'),
});

const createAlbum = z.object({
  op: op('create'), type: type('album'), ref: refName.optional(), set: albumCreateSet,
}).strict().describe('Create an album with photos');
const createPerson = z.object({
  op: op('create'), type: type('person'), ref: refName.optional(), set: personSet,
}).strict().describe('Create a person; without a name the person is unknown');
const updatePhotos = z.object({
  op: op('update'), type: type('photo'), ...target(photoId), set: photoSet,
}).strict().describe('Set attributes of photos');
const updateAlbums = z.object({
  op: op('update'), type: type('album'), ...target(albumToken), set: albumUpdateSet,
}).strict().describe('Set attributes of albums');
const updatePeople = z.object({
  op: op('update'), type: type('person'), ...target(personRef), set: personSet,
}).strict().describe('Set attributes of people');
const deleteAlbums = z.object({
  op: op('delete'), type: type('album'), ...target(albumToken),
}).strict().describe('Delete albums everywhere; photo files stay');
const deletePeople = z.object({
  op: op('delete'), type: type('person'), ...target(personRef),
}).strict().describe('Delete people and remove their faces from every photo; photo files stay');

/** The schema of each change, by op and type. */
export const changeSchemas = {
  create: { album: createAlbum, person: createPerson },
  update: { photo: updatePhotos, album: updateAlbums, person: updatePeople },
  delete: { album: deleteAlbums, person: deletePeople },
} as const;

export const MAX_CHANGES = 1000;
export const MAX_OBJECTS = 5000;

export const changeset = z.object({
  changes: z.array(z.union([createAlbum, createPerson, updatePhotos, updateAlbums, updatePeople, deleteAlbums, deletePeople]))
    .min(1).max(MAX_CHANGES)
    .describe(`Changes applied in order; each sees the results of the earlier ones. At most ${MAX_CHANGES} changes naming at most ${MAX_OBJECTS} objects`),
  dryRun: z.boolean().optional().describe('true: check the changes and return what would change without writing anything'),
}).strict().describe('A list of changes to photos, albums and people. Everything is checked before anything is written; only .paloma.json files in the photo folders are written');
