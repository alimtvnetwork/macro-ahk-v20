# CI/CD Pipeline — Implementation Guide

> **Purpose**: This folder documents the full CI/CD pipeline for this project.
> It is written to be **AI-portable** — any AI coding assistant should be able
> to read these files and reproduce, extend, or debug the pipeline without
> prior context.

## Quick Overview

This project is a **Chrome extension** with multiple **standalone scripts**
that are built separately and bundled into the extension at build time.

The pipeline has two workflows:
1. **CI** — runs on every push to `main` (lint → test → build)
2. **Release** — runs on push to `release/*` branches (same pipeline + packaging + GitHub Release)

## Files in This Folder

| File | What It Covers |
|------|---------------|
| [`01-architecture.md`](01-architecture.md) | Project structure, build artifacts, dependency graph |
| [`02-ci-workflow.md`](02-ci-workflow.md) | CI pipeline: triggers, steps, concurrency |
| [`03-release-workflow.md`](03-release-workflow.md) | Release pipeline: versioning, packaging, GitHub Release |
| [`04-validation-scripts.md`](04-validation-scripts.md) | Pre-build checks (version sync, dependency audit, dist freshness) |
| [`05-build-chain.md`](05-build-chain.md) | Build order, per-project build commands, Vite configs |
| [`06-versioning.md`](06-versioning.md) | Version policy, files that carry the version, bump process |
| [`07-extending.md`](07-extending.md) | How to add a new standalone script, new validation, or new release asset |
