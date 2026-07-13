import type { Player } from "@canvas/players/player";
import { PlayerReconciler } from "@core/player-reconciler";
import type { Edit } from "@core/edit-session";
import type { ResolvedEdit } from "@schemas";

describe("PlayerReconciler initial loads", () => {
	it("does not resolve initial reconciliation before newly-created Players load", async () => {
		let finishLoad!: () => void;
		const loadPromise = new Promise<void>(resolve => {
			finishLoad = resolve;
		});
		const player = {
			layer: 0,
			clipId: null,
			needsResolution: false,
			getTimingIntent: () => ({ start: 0, length: 3 }),
			load: jest.fn().mockReturnValue(loadPromise)
		} as unknown as Player;
		const players = new Map<string, Player>();
		const tracks: Player[][] = [[]];
		const events = { on: jest.fn(), emit: jest.fn() };
		const edit = {
			getInternalEvents: () => events,
			getPlayerByClipId: (id: string) => players.get(id) ?? null,
			createPlayerFromAssetType: () => player,
			registerPlayerByClipId: (id: string, value: Player) => players.set(id, value),
			addPlayerToTracksArray: (trackIndex: number, value: Player) => tracks[trackIndex].push(value),
			addPlayerToContainer: jest.fn(),
			getTracks: () => tracks,
			getPlayerMap: () => players,
			removeEmptyTrack: jest.fn(),
			ensureTrackExists: jest.fn()
		} as unknown as Edit;
		const resolved = {
			timeline: {
				tracks: [
					{
						clips: [
							{
								id: "gif-clip",
								asset: { type: "image", src: "https://example.com/animation.gif" },
								start: 0,
								length: 3
							}
						]
					}
				]
			}
		} as unknown as ResolvedEdit;
		const reconciler = new PlayerReconciler(edit);
		let settled = false;

		const reconciliation = reconciler.reconcileInitial(resolved).then(() => {
			settled = true;
		});
		await Promise.resolve();

		expect(player.load).toHaveBeenCalledTimes(1);
		expect(settled).toBe(false);

		finishLoad();
		await reconciliation;
		expect(settled).toBe(true);
	});

	it("waits for every overlapping load for the same Player", async () => {
		let finishFirst!: () => void;
		let finishSecond!: () => void;
		const first = new Promise<void>(resolve => {
			finishFirst = resolve;
		});
		const second = new Promise<void>(resolve => {
			finishSecond = resolve;
		});
		const events = { on: jest.fn(), off: jest.fn() };
		const reconciler = new PlayerReconciler({ getInternalEvents: () => events } as unknown as Edit);
		const player = {} as Player;
		const trackPlayerLoad = (
			reconciler as unknown as { trackPlayerLoad: (value: Player, promise: Promise<void>) => Promise<void> }
		).trackPlayerLoad.bind(reconciler);
		trackPlayerLoad(player, first);
		trackPlayerLoad(player, second);

		let settled = false;
		const waiting = reconciler.whenPlayerSettled(player).then(() => {
			settled = true;
		});
		finishSecond();
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(false);

		finishFirst();
		await waiting;
		expect(settled).toBe(true);
	});

	it("re-resolves auto timing after any current Player finishes loading", async () => {
		let finishLoad!: () => void;
		const load = new Promise<void>(resolve => {
			finishLoad = resolve;
		});
		const player = {
			clipId: "gif-clip",
			getTimingIntent: () => ({ start: 0, length: "auto" })
		} as unknown as Player;
		const players = new Map([["gif-clip", player]]);
		const resolveClipAutoLength = jest.fn().mockResolvedValue(undefined);
		const edit = {
			getInternalEvents: () => ({ on: jest.fn(), off: jest.fn() }),
			getPlayerMap: () => players,
			resolveClipAutoLength
		} as unknown as Edit;
		const reconciler = new PlayerReconciler(edit);
		const trackPlayerLoad = (
			reconciler as unknown as { trackPlayerLoad: (value: Player, promise: Promise<void>) => Promise<void> }
		).trackPlayerLoad.bind(reconciler);

		trackPlayerLoad(player, load);
		finishLoad();
		await load;
		await Promise.resolve();
		await Promise.resolve();

		expect(resolveClipAutoLength).toHaveBeenCalledWith(player);
	});
});
