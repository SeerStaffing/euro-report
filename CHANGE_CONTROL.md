# Change Control

All edits to this project are made through GitHub using a **branch + pull request
per change** model. No direct commits to `main`.

## Workflow

1. **Branch** off the latest `main`:
   ```
   git checkout main && git pull
   git checkout -b <type>/<short-description>
   ```
2. **Commit** focused changes using Conventional Commits (see below).
3. **Push** the branch and **open a PR** into `main`.
4. **Review** — at least one approval; CI/checks (if any) must pass.
5. **Merge** via squash merge, then delete the branch.
6. **Record** the change in [CHANGELOG.md](CHANGELOG.md) as part of the PR.

## Branch naming

`<type>/<short-description>` — e.g. `feat/remove-all-button`,
`fix/proxy-fallback`, `chore/git-setup`.

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`.

## Commit messages (Conventional Commits)

```
<type>: <imperative summary>

<optional body explaining the why>
```

Example:
```
feat: add Remove all button to approved links

Mirrors Approve all; clears only approved/live links, leaving pending intact.
```

## Pull request expectations

Every PR description includes:

- **What** changed (summary).
- **Why** (motivation / linked request).
- **How to test** (steps to verify in the browser).
- **Changelog** entry added under "Unreleased".

## Versioning

Semantic-ish tags cut from `main` at meaningful milestones (`v1.0`, `v1.1`, …).
The `Unreleased` section of the changelog is renamed to the version on release.
