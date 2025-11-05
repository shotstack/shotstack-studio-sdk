export default {
	preset: "ts-jest",
	testEnvironment: "node",
	extensionsToTreatAsEsm: [".ts"],
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
		"^@shotstack/shotstack-studio/schema$": "<rootDir>/dist/schema/index.js"
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