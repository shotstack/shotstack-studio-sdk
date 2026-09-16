/**
 * Paste identity helpers — strip id and remint alias so resolve uniqueness holds.
 */

import { generateAlias } from "@core/shared/source-clip-finder";

/**
 * Prepare a clip for paste/insert-from-clipboard: drop the source id and, when
 * an alias is present, remint both id and alias via {@link generateAlias}.
 * Leaves clips without an alias unchanged aside from clearing id.
 */
export function remintPastedClipIdentity(clip: { id?: string; alias?: string }): void {
	// eslint-disable-next-line no-param-reassign -- intentional in-place paste identity remint
	delete clip.id;
	if (!clip.alias) return;

	const newId = crypto.randomUUID();
	// eslint-disable-next-line no-param-reassign -- intentional in-place paste identity remint
	clip.id = newId;
	// eslint-disable-next-line no-param-reassign -- intentional in-place paste identity remint
	clip.alias = generateAlias(newId);
}
