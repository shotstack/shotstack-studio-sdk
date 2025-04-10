import * as zod from "zod";

import { ClipSchema } from "./clip";

export const TrackSchema = zod.object({
	clips: ClipSchema.array()
});
