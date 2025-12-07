export { parseSubtitle, parseVTT, parseSRT, findActiveCue, getCuesDuration, type Cue } from "./parser";

export {
	TranscriptionService,
	type TranscriptionProgress,
	type TranscriptionResult,
	type TranscriptionConfig,
	type WhisperModel
} from "./transcription-service";

export {
	isAliasReference,
	parseAliasName,
	findClipByAlias,
	extractAudioUrl,
	resolveTranscriptionAlias,
	revokeVttUrl,
	type AliasResolutionResult
} from "./alias-resolver";
