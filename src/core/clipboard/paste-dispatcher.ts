import { AddTrackCommand } from "@core/commands/add-track-command";
import type { Edit } from "@core/edit-session";
import { ClipSchema, type Clip, type Track } from "@schemas";
import { resolvePastePlacement } from "@timeline/interaction/interaction-calculations";

/**
 * Insert a clip at `preferredTrackIdx`, falling back to a new top track if the
 * clip's time range would overlap an existing clip on the preferred track.
 * @internal
 */
export async function insertClipWithOverlapPolicy(edit: Edit, preferredTrackIdx: number, clip: Clip): Promise<void> {
	const desiredStart = typeof clip.start === "number" ? clip.start : 0;
	const desiredLength = typeof clip.length === "number" ? clip.length : 0;
	const tracks = edit.getTracks();
	const track = tracks[preferredTrackIdx];

	const action = resolvePastePlacement({
		preferredTrackIndex: preferredTrackIdx,
		preferredTrackClips: track?.map(p => ({ start: p.getStart(), length: p.getEnd() - p.getStart() })),
		desiredStart,
		desiredLength
	});

	if (action.type === "insert-track") {
		ClipSchema.parse(clip);
		await edit.executeEditCommand(new AddTrackCommand(action.insertionIndex, { clips: [clip] } as Track));
		return;
	}

	await edit.addClip(action.trackIndex, clip);
}
