# Changesets

Every pull request that changes behavior adds a changeset: run `pnpm changeset`, pick the packages and the bump type, and commit the generated file. Package versions are independent.

On `main`, CI opens or updates a pull request titled "chore: version packages". It bumps versions, writes each package's `CHANGELOG.md` and removes the consumed changesets. Merging it makes CI create one git tag per package (`<package name>@<version>`) and one GitHub Release per tag. Nothing is published to npm; the packages keep `"private": true`.
