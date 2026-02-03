# Security Policy

## Scope

flatr is a command-line tool that runs locally on your machine. It:
- Reads files from your filesystem
- Writes output files locally
- Does NOT send any data to external services
- Does NOT execute arbitrary code from your project

## Supported versions

Only the latest release receives security updates. Please upgrade to the latest version before reporting issues.

## Reporting a vulnerability

**Please do NOT open public issues for security vulnerabilities.**

Instead:
1. Use [GitHub Security Advisories](https://github.com/nesvet/flatr/security/advisories/new) for private reporting
2. Include:
   - Clear description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

I aim to respond within 3-5 business days and will work with you to address confirmed vulnerabilities.

## Security best practices

When using flatr:
- Review exclude patterns before running on sensitive projects
- Use `--dry-run` first to preview what will be included
- Be careful when sharing generated output files (they contain your code)
- Don't commit `.flatr.json` config if it contains sensitive paths
