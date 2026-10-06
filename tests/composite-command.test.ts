import { CompositeCommand } from "../src/core/commands/composite-command";

describe("CompositeCommand", () => {
	it("stops at the first step that does not succeed and rolls back the steps before it", async () => {
		const calls: string[] = [];
		const step = (id: string, status: "success" | "noop" = "success") => ({
			name: id,
			execute: () => {
				calls.push(`do ${id}`);
				return { status };
			},
			undo: () => {
				calls.push(`undo ${id}`);
				return { status: "success" as const };
			}
		});
		const stopped = new CompositeCommand([step("a", "noop"), step("b")], "stop");
		expect(await stopped.execute()).toEqual({ status: "noop" });
		expect(calls).toEqual(["do a"]);

		calls.length = 0;
		const ran = new CompositeCommand([step("a"), step("b"), step("c", "noop"), step("d")], "ran");
		expect(await ran.execute()).toEqual({ status: "noop" });
		expect(calls).toEqual(["do a", "do b", "do c", "undo b", "undo a"]);
	});
});
