/**
 * User-friendly error message formatting for clip load failures.
 * Detects file type mismatches and provides helpful suggestions.
 */

const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv", "m4v"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "aac", "ogg", "m4a", "flac"];

/**
 * Extract filename from an error message containing a URL
 */
export function extractFilenameFromError(error: string): string | null {
	const urlMatch = error.match(/['"]?(https?:\/\/[^'"]+)['"]?/);
	if (urlMatch) {
		const url = urlMatch[1];
		return url.split("/").pop()?.split("?")[0] || null;
	}
	return null;
}

/**
 * Format a user-friendly error message based on asset type and error details.
 * Detects wrong file type scenarios and provides helpful suggestions.
 */
export function formatClipErrorMessage(error: string, assetType: string): string {
	const filename = extractFilenameFromError(error);
	const fileExt = filename?.split(".").pop()?.toLowerCase();

	// Detect wrong file type scenarios
	if (error.toLowerCase().includes("invalid") && error.toLowerCase().includes("source")) {
		// Image clip with wrong file
		if (assetType === "image") {
			if (fileExt && VIDEO_EXTENSIONS.includes(fileExt)) {
				return `⚠️ Wrong file type\n\nThis clip expects an image, but "${filename}" is a video file.\n\nTry using a .jpg, .png, or .gif instead.`;
			}
			if (fileExt && AUDIO_EXTENSIONS.includes(fileExt)) {
				return `⚠️ Wrong file type\n\nThis clip expects an image, but "${filename}" is an audio file.\n\nTry using a .jpg, .png, or .gif instead.`;
			}
		}

		// Video clip with wrong file
		if (assetType === "video") {
			if (fileExt && IMAGE_EXTENSIONS.includes(fileExt)) {
				return `⚠️ Wrong file type\n\nThis clip expects a video, but "${filename}" is an image file.\n\nTry using a .mp4 or .mov instead.`;
			}
			if (fileExt && AUDIO_EXTENSIONS.includes(fileExt)) {
				return `⚠️ Wrong file type\n\nThis clip expects a video, but "${filename}" is an audio file.\n\nTry using a .mp4 or .mov instead.`;
			}
		}

		// Audio clip with wrong file
		if (assetType === "audio") {
			if (fileExt && VIDEO_EXTENSIONS.includes(fileExt)) {
				return `⚠️ Wrong file type\n\nThis clip expects audio, but "${filename}" is a video file.\n\nTry using a .mp3 or .wav instead.`;
			}
			if (fileExt && IMAGE_EXTENSIONS.includes(fileExt)) {
				return `⚠️ Wrong file type\n\nThis clip expects audio, but "${filename}" is an image file.\n\nTry using a .mp3 or .wav instead.`;
			}
		}

		// Luma clip with wrong file
		if (assetType === "luma") {
			if (fileExt && AUDIO_EXTENSIONS.includes(fileExt)) {
				return `⚠️ Wrong file type\n\nLuma masks require an image or video, but "${filename}" is an audio file.`;
			}
		}
	}

	// Generic file load error
	if (filename) {
		return `⚠️ Couldn't load file\n\n"${filename}" failed to load.\n\nCheck that the file exists and the link is correct.`;
	}

	// Fallback for unknown errors
	return `⚠️ Something went wrong\n\nThis clip couldn't be loaded.\n\nPlease check your media files.`;
}
