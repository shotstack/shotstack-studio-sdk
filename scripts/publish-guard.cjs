if (!process.env.CI) {
  console.error(
    "\n" +
    "========================================\n" +
    " Do not run npm/pnpm publish locally.\n" +
    " Releases are managed by CI pipeline.\n" +
    " Push to main to trigger a release.\n" +
    "========================================\n"
  );
  process.exit(1);
}
