# Security

If you believe you have found a security vulnerability, please **do not** open a public issue.

Instead, report it responsibly via GitHub [private vulnerability reporting](https://github.com/Auda29/twincat-mcp-mono/security/advisories/new) for this repository (if enabled), or contact the maintainers through a non-public channel they provide.

We will work with you to understand and address the issue.

## Published Engineering 0.5.3 assessment

The GitHub release does not claim a clean dependency audit or real-host
acceptance. Its assembled Core/MCP runtime retains a high Zod 3 availability
advisory and a low fast-xml-parser advisory. These counts do not describe the
entire development/Pi dependency tree. See [Release Flow](docs/release-flow.md)
for advisory references, the exact artifact pin and the inactive ST-editor
release boundary. Existing public advisories do not change the private reporting
route above for newly discovered vulnerabilities.
