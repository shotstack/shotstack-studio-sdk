import { EffectPresetBuilder } from "@animations/effect-preset-builder";
import { TransitionPresetBuilder } from "@animations/transition-preset-builder";
import type { Edit } from "@core/edit-session";
import { resolveFontPath } from "@core/fonts/font-config";
import { NAMED_FONT_WEIGHTS } from "@core/fonts/font-weights";
import { isPendingAiAsset } from "@core/shared/ai-asset-utils";
import { inferAssetTypeFromUrl, isTextHtml } from "@core/shared/asset-utils";
import type { ResolvedClip } from "@schemas";
import { canEncodeVideo } from "mediabunny";

import { exportBitrate, type ExportIssue, type ExportIssueCode } from "./export-utils";

/** The audio mix is held in memory until the export finishes, and it grows with length at any size. */
export const MAX_EXPORT_SECONDS = 300;
/** The encoded video is held in memory too: five minutes' worth at 1080p, so larger outputs get less time. */
export const MAX_EXPORT_BITS = MAX_EXPORT_SECONDS * exportBitrate({ width: 1920, height: 1080 });

type PreflightEdit = Pick<Edit, "getResolvedEdit" | "getOutputFormat" | "getFontUrlByFamilyAndWeight" | "totalDuration">;

const UNIT_SIZE = { width: 1, height: 1 };

// The preset builders return no keyframes for a name they don't know, which the preview draws as no animation.
const animates = (keyframeSet: object): boolean => Object.values(keyframeSet).some(value => Array.isArray(value) && value.length > 0);

// Mirrors RichTextPlayer's weight reading, so the check asks for the weight the preview registers.
function fontWeightOf(weight: unknown): number {
	if (typeof weight === "number") return weight;
	if (typeof weight !== "string") return 400;
	const parsed = NAMED_FONT_WEIGHTS[weight.toLowerCase().trim()] ?? parseInt(weight, 10);
	return Number.isNaN(parsed) ? 400 : parsed;
}

function findClipIssues(edit: PreflightEdit, clip: ResolvedClip): ExportIssue[] {
	const issues: ExportIssue[] = [];
	const add = (code: ExportIssueCode, message: string): void => {
		issues.push({ code, message, clipId: clip.id });
	};
	const { asset } = clip;

	if (isPendingAiAsset(asset)) add("ai-pending", "This clip hasn't been generated yet.");
	if (asset.type === "video" && asset.chromaKey) add("chroma-key", "Chroma key isn't available in the browser.");
	if (clip.filter && clip.filter !== "none") add("filter", `The ${clip.filter} filter isn't available in the browser.`);
	if (asset.type === "html5" || (asset.type === "html" && !isTextHtml(asset.html))) add("html", "This HTML clip can only be rendered in the cloud.");
	// Mattes redraw in the editor's update loop, which export doesn't run, so a video matte would hold one frame.
	if (asset.type === "luma" && inferAssetTypeFromUrl(asset.src) === "video") add("luma", "Video luma mattes aren't available in the browser.");
	if (clip.effect && !animates(new EffectPresetBuilder(clip).buildRelative(UNIT_SIZE, UNIT_SIZE))) {
		add("effect", `The ${clip.effect} effect isn't available in the browser.`);
	}

	const transitions = new TransitionPresetBuilder(clip).buildRelative();
	for (const direction of ["in", "out"] as const) {
		const name = clip.transition?.[direction];
		if (name && name !== "none" && !animates(transitions[direction])) add("transition", `The ${name} transition isn't available in the browser.`);
	}

	if ("font" in asset && asset.font?.family) {
		const { family } = asset.font;
		const weight = fontWeightOf("weight" in asset.font ? asset.font.weight : undefined);
		if (!resolveFontPath(family, weight) && !edit.getFontUrlByFamilyAndWeight(family, weight)) {
			add("font", `The ${family} font isn't built in or listed in the edit's fonts.`);
		}
	}

	return issues;
}

export function findEditIssues(edit: PreflightEdit, bitrate: number): ExportIssue[] {
	const issues: ExportIssue[] = [];
	const format = edit.getOutputFormat();
	if (format !== "mp4") issues.push({ code: "output-format", message: `The browser exports MP4 only, and this edit asks for ${format}.` });
	if (edit.totalDuration > MAX_EXPORT_SECONDS || edit.totalDuration * bitrate > MAX_EXPORT_BITS) {
		issues.push({
			code: "too-long",
			message: `The browser exports up to ${MAX_EXPORT_SECONDS / 60} minutes of video at 1080p, and less at larger sizes.`
		});
	}
	for (const track of edit.getResolvedEdit().timeline.tracks) {
		for (const clip of track.clips) issues.push(...findClipIssues(edit, clip));
	}
	return issues;
}

export async function findBrowserIssue(size: { width: number; height: number }, bitrate: number): Promise<ExportIssue | null> {
	if (await canEncodeVideo("avc", { width: size.width, height: size.height, bitrate })) return null;
	return { code: "browser", message: `This browser can't encode H.264 video at ${size.width}×${size.height}.` };
}
