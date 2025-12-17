import * as zod from "zod";

import { TrackSchema, type ResolvedTrack } from "./track";

export const FontSourceUrlSchema = zod.string().url("Invalid image url format.");

export const FontSourceSchema = zod
	.object({
		src: FontSourceUrlSchema
	})
	.strict();

export const SoundtrackEffectSchema = zod.enum(["fadeIn", "fadeOut", "fadeInFadeOut"]);

export const SoundtrackSchema = zod
	.object({
		src: zod.string().url(),
		effect: SoundtrackEffectSchema.optional(),
		volume: zod.number().min(0).max(1).optional()
	})
	.strict();

export const TimelineSchema = zod
	.object({
		background: zod.string().optional(),
		fonts: FontSourceSchema.array().optional(),
		tracks: TrackSchema.array(),
		soundtrack: SoundtrackSchema.optional()
	})
	.strict();

const ShotstackDestinationSchema = zod
	.object({
		provider: zod.literal("shotstack"),
		exclude: zod.boolean().optional()
	})
	.strict();

const S3DestinationSchema = zod
	.object({
		provider: zod.literal("s3"),
		options: zod
			.object({
				region: zod.string(),
				bucket: zod.string().min(3).max(63),
				prefix: zod.string().optional(),
				filename: zod.string().optional(),
				acl: zod.string().optional()
			})
			.strict()
	})
	.strict();

const MuxDestinationSchema = zod
	.object({
		provider: zod.literal("mux"),
		options: zod
			.object({
				playbackPolicy: zod.array(zod.enum(["public", "signed"])).optional(),
				passthrough: zod.string().max(255).optional()
			})
			.strict()
			.optional()
	})
	.strict();

const GoogleCloudStorageDestinationSchema = zod
	.object({
		provider: zod.literal("google-cloud-storage"),
		options: zod
			.object({
				bucket: zod.string().optional(),
				prefix: zod.string().optional(),
				filename: zod.string().optional()
			})
			.strict()
			.optional()
	})
	.strict();

const GoogleDriveDestinationSchema = zod
	.object({
		provider: zod.literal("google-drive"),
		options: zod
			.object({
				filename: zod.string().optional(),
				folderId: zod.string().optional()
			})
			.strict()
			.optional()
	})
	.strict();

const VimeoDestinationSchema = zod
	.object({
		provider: zod.literal("vimeo"),
		options: zod
			.object({
				name: zod.string().optional(),
				description: zod.string().optional(),
				privacy: zod
					.object({
						view: zod.enum(["anybody", "nobody", "contacts", "password", "unlisted"]).optional(),
						embed: zod.enum(["public", "private", "whitelist"]).optional(),
						comments: zod.enum(["anybody", "nobody", "contacts"]).optional()
					})
					.strict()
					.optional(),
				folderUri: zod.string().optional()
			})
			.strict()
			.optional()
	})
	.strict();

const TiktokDestinationSchema = zod
	.object({
		provider: zod.literal("tiktok")
	})
	.strict();

const DestinationSchema = zod.union([
	ShotstackDestinationSchema,
	S3DestinationSchema,
	MuxDestinationSchema,
	GoogleCloudStorageDestinationSchema,
	GoogleDriveDestinationSchema,
	VimeoDestinationSchema,
	TiktokDestinationSchema
]);

export const OutputSchema = zod
	.object({
		size: zod
			.object({
				width: zod.number().positive(),
				height: zod.number().positive()
			})
			.strict(),
		fps: zod.number().positive().optional(),
		format: zod.string(),
		destinations: zod.array(DestinationSchema).optional()
	})
	.strict();

export const MergeFieldSchema = zod.object({
	find: zod.string().min(1),
	replace: zod.string()
});

export const EditSchema = zod
	.object({
		timeline: TimelineSchema,
		output: OutputSchema,
		merge: zod.array(MergeFieldSchema).optional()
	})
	.strict();

export type MergeField = zod.infer<typeof MergeFieldSchema>;
export type Soundtrack = zod.infer<typeof SoundtrackSchema>;

export type Edit = zod.infer<typeof EditSchema>;

export type ResolvedEdit = Omit<Edit, "timeline"> & {
	timeline: Omit<Edit["timeline"], "tracks"> & {
		tracks: ResolvedTrack[];
	};
};
