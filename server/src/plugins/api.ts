/**
 * Plugin API version 1: the types a plugin's server module is written against.
 *
 * A plugin's module exports `activate(host)`, which returns the plugin's contributions. Bundled plugins
 * import these types through JSDoc; external plugins can copy them. Keys of the contributions object
 * that this API version does not know are ignored with a warning, so later versions can add new kinds
 * of contributions without breaking existing plugins.
 */
import type sharp from 'sharp';
import type { FilterGroup, LocalizedText, RelativeRect } from '../../../shared/types.js';

export type { FilterGroup, LocalizedText, RelativeRect } from '../../../shared/types.js';

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
  render(input: RenderInput): sharp.Sharp | Promise<sharp.Sharp>;
}

export interface PluginContributions {
  filters?: FilterDefinition[];
}

/** The shape of a plugin's server module. */
export interface PluginModule {
  activate(host: PluginHost): PluginContributions | Promise<PluginContributions>;
}
