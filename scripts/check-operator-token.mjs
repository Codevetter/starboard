// Fail before migrations or seeding if the operator credential is absent.
// The Worker still verifies the actual token; this check never prints its value.
if (!process.env.STARBOARD_OPERATOR_TOKEN?.trim()) {
  console.error(
    'STARBOARD_OPERATOR_TOKEN is required for Worker operator requests. Configure the matching dedicated token in the Worker and GitHub Actions before retrying.'
  );
  process.exitCode = 1;
}
