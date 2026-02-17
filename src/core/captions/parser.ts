export interface Cue {
	start: number;
	end: number;
	text: string;
}

function parseTimestamp(timestamp: string): number {
	const normalized = timestamp.trim().replace(",", ".");
	const parts = normalized.split(":");

	if (parts.length === 3) {
		const hours = parseInt(parts[0], 10);
		const minutes = parseInt(parts[1], 10);
		const seconds = parseFloat(parts[2]);
		return hours * 3600 + minutes * 60 + seconds;
	}

	if (parts.length === 2) {
		const minutes = parseInt(parts[0], 10);
		const seconds = parseFloat(parts[1]);
		return minutes * 60 + seconds;
	}

	return parseFloat(normalized) || 0;
}

export function parseVTT(content: string): Cue[] {
	const cues: Cue[] = [];
	const lines = content.split(/\r?\n/);

	let i = 0;

	while (i < lines.length && !lines[i].includes("-->")) {
		i += 1;
	}

	while (i < lines.length) {
		const line = lines[i].trim();

		if (line.includes("-->")) {
			const [startStr, endStr] = line.split("-->").map(s => s.trim().split(" ")[0]);
			const start = parseTimestamp(startStr);
			const end = parseTimestamp(endStr);

			const textLines: string[] = [];
			i += 1;

			while (i < lines.length && lines[i].trim() !== "" && !lines[i].includes("-->")) {
				const textLine = lines[i].trim();
				if (!textLine.startsWith("NOTE")) {
					textLines.push(textLine);
				}
				i += 1;
			}

			if (textLines.length > 0) {
				cues.push({
					start,
					end,
					text: textLines.join("\n")
				});
			}
		} else {
			i += 1;
		}
	}

	return cues;
}

export function parseSRT(content: string): Cue[] {
	const cues: Cue[] = [];
	const lines = content.split(/\r?\n/);

	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();

		if (/^\d+$/.test(line) || line === "") {
			i += 1;
		} else if (line.includes("-->")) {
			const [startStr, endStr] = line.split("-->").map(s => s.trim());
			const start = parseTimestamp(startStr);
			const end = parseTimestamp(endStr);

			const textLines: string[] = [];
			i += 1;

			while (i < lines.length && lines[i].trim() !== "") {
				textLines.push(lines[i].trim());
				i += 1;
			}

			if (textLines.length > 0) {
				cues.push({
					start,
					end,
					text: textLines.join("\n")
				});
			}
		} else {
			i += 1;
		}
	}

	return cues;
}

export function parseSubtitle(content: string): Cue[] {
	const trimmed = content.trim();

	if (trimmed.startsWith("WEBVTT")) {
		return parseVTT(content);
	}

	return parseSRT(content);
}

export function findActiveCue(cues: Cue[], time: number): Cue | null {
	return cues.find(cue => time >= cue.start && time <= cue.end) ?? null;
}

export function getCuesDuration(cues: Cue[]): number {
	if (cues.length === 0) return 0;
	return Math.max(...cues.map(cue => cue.end));
}
