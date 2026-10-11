/**
 * Plugin API version 1: the types a plugin's server module is written against.
 *
 * A plugin's module exports `activate(host)`, which returns the plugin's contributions. Bundled plugins
 * import these types through JSDoc; external plugins can copy them. Keys of the contributions object
 * that this API version does not know are ignored with a warning, so later versions can add new kinds
 * of contributions without breaking existing plugins.
 */
import type sharp from 'sharp';
import type { ComplexityLevel, FilterGroup, LocalizedText, Permission, RelativeRect } from '../../../shared/types.js';

export type { ComplexityLevel, FilterGroup, LocalizedText, Permission, RelativeRect } from '../../../shared/types.js';

export const PLUGIN_API_VERSION = 1;

export interface PluginLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** What Paloma gives a plugin when it is switched on. */
export interface PluginHost {
  apiVersion: typeof PLUGIN_API_VERSION;
  /** Paloma's own sharp, so a plugin needs no image library of its own */
  sharp: typeof sharp;
  /** Logs with the plugin id as a prefix */
  log: PluginLog;
}

interface ParamBase {
  /** Key of the parameter in an edit step */
  name: string;
  label: LocalizedText;
}

/** A number; sizes are fractions of the image, never pixels. */
export interface NumberParamDefinition extends ParamBase {
  type: 'number';
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface BooleanParamDefinition extends ParamBase {
  type: 'boolean';
  default: boolean;
}

export interface ChoiceParamDefinition extends ParamBase {
  type: 'choice';
  options: { value: string | number; label: LocalizedText }[];
  default: string | number;
}

/** A rectangle as fractions 0..1 of the image at that step; the editor shows it as a frame over the image. */
export interface RectParamDefinition extends ParamBase {
  type: 'rect';
  default: RelativeRect;
}

export type ParamDefinition = NumberParamDefinition | BooleanParamDefinition | ChoiceParamDefinition | RectParamDefinition;

/** What a filter's `render` gets: the image after the previous steps and this step's validated parameters. */
export interface RenderInput {
  /** The current pixels; return it or another sharp instance with the result */
  image: sharp.Sharp;
  width: number;
  height: number;
  /** Every declared parameter, defaults filled in */
  params: Record<string, unknown>;
  host: PluginHost;
}

export interface FilterDefinition {
  /** The `filter` value of edit steps; unique across all plugins */
  name: string;
  label: LocalizedText;
  group: FilterGroup;
  params?: ParamDefinition[];
  /** Path of an SVG icon inside the plugin folder, relative to it; without one the editor shows a generic icon */
  icon?: string;
  /**
   * The lowest level at which the editor offers the filter: `child`, `easy`, `normal`, `pro` or `developer`.
   * Without one it has the plugin's level. Steps of the filter are rendered at every level.
   */
  level?: ComplexityLevel;
  render(input: RenderInput): sharp.Sharp | Promise<sharp.Sharp>;
}

/** A user as an auth provider sees them. */
export interface AuthUser {
  id: string;
  username: string;
  enabled: boolean;
}

/**
 * What Paloma gives an auth provider on each call. Users, sessions, roles and permissions stay in Paloma: a
 * provider only checks credentials and names the user they belong to, and Paloma checks again that this user
 * exists and is enabled.
 */
export interface AuthContext {
  /** The user with this username, ignoring case */
  findUserByUsername(username: string): Promise<AuthUser | undefined>;
  /** What this provider keeps about a user (e.g. a password hash), as JSON; separate for every provider id */
  identities: {
    get(userId: string): Promise<unknown | undefined>;
    set(userId: string, data: unknown): Promise<void>;
  };
  /** The owner and permissions of a personal API token value, if it is valid */
  verifyApiToken(value: string): Promise<{ userId: string; tokenId: string; permissions: Permission[] } | null>;
  /** A salted, slow hash of a secret (scrypt), as text to store */
  hashSecret(secret: string): Promise<string>;
  /** Whether `secret` matches a hash from `hashSecret`; takes as long for a wrong secret as for a right one */
  verifySecret(secret: string, hash: string): Promise<boolean>;
}

interface AuthProviderBase {
  /** Unique across plugins; lowercase letters, digits and hyphens */
  id: string;
  label: LocalizedText;
}

/** A field of a login form. */
export interface AuthFieldDefinition {
  name: string;
  label: LocalizedText;
  type: 'text' | 'password';
}

/** A login form: the login page shows one per enabled provider. A successful login starts a browser session. */
export interface CredentialsProviderDefinition extends AuthProviderBase {
  kind: 'credentials';
  fields: AuthFieldDefinition[];
  /** The user the entered values belong to, or null when they are wrong */
  login(input: Record<string, string>, ctx: AuthContext): Promise<{ userId: string } | null>;
  /** Stores a new password for a user (account creation, change and reset); only for password providers */
  setSecret?(userId: string, secret: string, ctx: AuthContext): Promise<void>;
  /** Whether `secret` is the user's current password; required together with `setSecret` */
  checkSecret?(userId: string, secret: string, ctx: AuthContext): Promise<boolean>;
}

/** A credential sent with each request in `Authorization: Bearer <credential>`. */
export interface BearerProviderDefinition extends AuthProviderBase {
  kind: 'bearer';
  /**
   * The user the credential belongs to, or null when it is not this provider's or not valid. `permissions`
   * narrows what the request may do (the user's role still applies); `tokenId` names a personal API token.
   */
  authenticate(credential: string, ctx: AuthContext): Promise<{ userId: string; tokenId?: string; permissions?: Permission[] } | null>;
}

export type AuthProviderDefinition = CredentialsProviderDefinition | BearerProviderDefinition;

export interface PluginContributions {
  filters?: FilterDefinition[];
  /** Ways to log in or to authenticate requests */
  authProviders?: AuthProviderDefinition[];
}

/** The shape of a plugin's server module. */
export interface PluginModule {
  activate(host: PluginHost): PluginContributions | Promise<PluginContributions>;
}
