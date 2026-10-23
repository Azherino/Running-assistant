import { parseFit } from './fit';
import { parseTcx } from './tcx';
import type { ParseOutcome } from './types';

export interface ActivityFileInput {
  name: string;
  /** Text contents for XML formats. */
  text?: string;
  /** Binary contents for FIT files. */
  bytes?: Uint8Array;
}

function isFitMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const signature = String.fromCharCode(...bytes.slice(8, 12));
  return signature === '.FIT';
}

/**
 * Picks the right parser from the file name, falling back to content detection.
 * Keep this free of React Native imports so it can be tested in Node.
 */
export function parseActivityFile(input: ActivityFileInput): ParseOutcome {
  const name = input.name.toLowerCase();

  if (name.endsWith('.zip')) {
    throw new Error('ZIP files are not supported. Unzip the export and pick the .tcx or .fit file.');
  }
  if (name.endsWith('.gpx')) {
    throw new Error('GPX files are not supported yet. Pick the original TCX or FIT export.');
  }

  const looksLikeFit = input.bytes != null && isFitMagic(input.bytes);
  if (name.endsWith('.fit') || looksLikeFit) {
    if (input.bytes == null) {
      throw new Error('FIT files must be read as binary data.');
    }
    return parseFit(input.bytes);
  }

  if (input.text == null) {
    throw new Error('Could not read this activity file.');
  }

  const trimmed = input.text.trimStart();
  if (trimmed.startsWith('<')) {
    return parseTcx(input.text);
  }

  throw new Error('Unrecognized file format. Pick a TCX or FIT activity export.');
}
