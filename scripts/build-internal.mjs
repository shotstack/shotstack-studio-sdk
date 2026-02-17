import { existsSync, renameSync, rmSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
const publicTypesPath = resolve(distDir, "index.d.ts");
const internalTypesPath = resolve(distDir, "internal.d.ts");
const backupTypesPath = resolve(distDir, "index.d.ts.internal-backup");

const restorePublicTypes = hadBackup => {
	if (hadBackup && existsSync(backupTypesPath)) {
		rmSync(publicTypesPath, { force: true });
		renameSync(backupTypesPath, publicTypesPath);
		return;
	}

	rmSync(publicTypesPath, { force: true });
};

let hadBackup = false;

try {
	rmSync(backupTypesPath, { force: true });

	if (existsSync(publicTypesPath)) {
		renameSync(publicTypesPath, backupTypesPath);
		hadBackup = true;
	}

	rmSync(internalTypesPath, { force: true });

	const result = spawnSync("vite", ["build", "--config", "vite.config.internal.ts"], {
		cwd: projectRoot,
		stdio: "inherit",
		shell: process.platform === "win32"
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(`Internal build failed with exit code ${result.status ?? "unknown"}.`);
	}

	if (!existsSync(internalTypesPath)) {
		throw new Error("Missing dist/internal.d.ts after internal build.");
	}

	restorePublicTypes(hadBackup);
	rmSync(backupTypesPath, { force: true });
} catch (error) {
	restorePublicTypes(hadBackup);
	rmSync(backupTypesPath, { force: true });

	const message = error instanceof Error ? error.message : String(error);
	console.error(`[build:internal] ${message}`);
	process.exit(1);
}
