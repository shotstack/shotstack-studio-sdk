/**
 * Infer asset type (image or video) from a URL by examining its file extension.
 *
 * This is a heuristic fallback used when the asset type isn't explicitly known,
 * such as when transforming luma masks back to their original type.
 *
 * @param src - The asset source URL
 * @returns "video" if the URL has a video extension, otherwise "image"
 */
export function inferAssetTypeFromUrl(src: string): "image" | "video" {
	const url = src.toLowerCase().split("?")[0];
	const videoExtensions = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".ogv", ".ogg"];

	if (videoExtensions.some(ext => url.endsWith(ext))) {
		return "video";
	}
	return "image";
}
