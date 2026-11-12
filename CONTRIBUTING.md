# Contributing

Thanks for improving the TwinCAT MCP monorepo.

## Workflow

1. Open an issue or discuss larger changes before heavy implementation work.
2. Fork the repository and create a branch from `main`.
3. Keep commits focused and messages descriptive.
4. Open a pull request against `main` with a short summary of the change and how to verify it.

## Development

Use locked development dependencies with `npm ci`, then run the relevant
workspace checks in [README](README.md). Hosted CI covers Node/workspace tests
and Windows net472 provider fixtures; `scripts/Test-NativeEngineering.ps1` runs
the latter locally. Documentation-only changes should use focused consistency
and link checks rather than live IDE/PLC tests.

The current release scope and development-only editor code are distinct; see
[Release Flow](docs/release-flow.md) before changing capability claims. Tests,
review and package probes must not be described as real-host acceptance.

## License

By contributing, you agree that your contributions will be licensed under the same terms as this project (see [LICENSE](LICENSE)).
