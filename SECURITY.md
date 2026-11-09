# Security Policy

## Supported Versions

Omnis is pre-1.0. Security fixes are released only for the **latest** published version; please update via the in-app updater or the [Releases page](https://github.com/rinaldinie/omnis/releases).

## Reporting a Vulnerability

**Please do not open public issues for security problems.**

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/rinaldinie/omnis/security/advisories/new). Include:

- the affected version and operating system;
- a description of the issue and its impact;
- steps to reproduce or a proof of concept.

You can expect an acknowledgement within a few days. Once a fix is available, a new release will be published and the advisory disclosed with credit to the reporter, unless you prefer to remain anonymous.

## Scope

Areas of particular interest include:

- storage of store credentials and tokens (secret vault, OS keyring, envelope encryption);
- store session handling and OAuth flow security;
- the metadata resolution pipeline and media caching;
- theme loading and CSS validation;
- the auto-update channel and its signature verification;
- the Tauri IPC surface and content security policy.
