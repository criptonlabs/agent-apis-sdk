# Changesets

Every pull request that changes behavior adds a changeset: run `pnpm changeset`, pick the packages and the bump type, and commit the generated file. Package versions are independent. The packages are private, so versions are bumped but no tags are created.
