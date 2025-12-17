export default {
	preset: "ts-jest",
	testEnvironment: "node",
	extensionsToTreatAsEsm: [".ts"],
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
		"^@shotstack/shotstack-studio/schema$": "<rootDir>/dist/schema/index.cjs",
		"^@core/(.*)$": "<rootDir>/src/core/$1",
		"^@canvas/(.*)$": "<rootDir>/src/components/canvas/$1",
		"^@timeline/(.*)$": "<rootDir>/src/components/timeline/$1",
		"^@shared/(.*)$": "<rootDir>/src/core/shared/$1",
		"^@schemas/(.*)$": "<rootDir>/src/core/schemas/$1",
		"^@layouts/(.*)$": "<rootDir>/src/core/layouts/$1",
		"^@animations/(.*)$": "<rootDir>/src/core/animations/$1",
		"^@events/(.*)$": "<rootDir>/src/core/events/$1",
		"^@inputs/(.*)$": "<rootDir>/src/core/inputs/$1",
		"^@loaders/(.*)$": "<rootDir>/src/core/loaders/$1",
		"^@export/(.*)$": "<rootDir>/src/core/export/$1",
		"^@styles/(.*)$": "<rootDir>/src/styles/$1",
		"^@templates/(.*)$": "<rootDir>/src/templates/$1"
	},
	testPathIgnorePatterns: ["/node_modules/", "/dist/"],
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				useESM: true,
				tsconfig: "tsconfig.test.json"
			}
		]
	}
};
