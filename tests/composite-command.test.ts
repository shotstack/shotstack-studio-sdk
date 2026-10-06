import { CompositeCommand } from "../src/core/commands/composite-command";

describe("CompositeCommand", () => {
	it("runs commands in order, undoes every command in reverse, and reports the first result", async () => {
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
		const command = new CompositeCommand([step("a", "noop"), step("b")], "both");
		expect(await command.execute()).toEqual({ status: "noop" });
		await command.undo();
		expect(calls).toEqual(["do a", "do b", "undo b", "undo a"]);
	});
});
