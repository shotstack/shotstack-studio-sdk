import * as zod from "zod";

import { ClipSchema, type ResolvedClip } from "./clip";

export const TrackSchema = zod
	.object({
		clips: ClipSchema.array()
	})
	.strict();

export type Track = zod.infer<typeof TrackSchema>;

export type ResolvedTrack = {
	clips: ResolvedClip[];
};
