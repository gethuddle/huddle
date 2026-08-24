---
name: huddle-publish-pr
description: Finalize and publish a Huddle package branch for reciprocal partner review. Use when the active writer is asked to hand off, push, or open or update a Huddle pull request; do not use to review or merge the partner's PR.
---

# Huddle Publish PR

Move one completed Huddle package from the writer's local branch to a durable GitHub review handoff. This skill operationalizes `AGENTS.md` and the team build specification; it does not replace either source.

## Authorization boundary

An explicit request to use this skill to publish authorizes the necessary package commit, push, pull-request create or update, issue or PR evidence comment, and reciprocal review request. It does not authorize merging, deployment, hosted-service changes, force-pushing, or approving the writer's own pull request.

If the request asks only whether the branch is ready, perform the checks and stop before any mutation.

## Establish the handoff

1. Read `AGENTS.md`, the active package in `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`, its referenced implementation and architecture sections, the current issue, and any existing pull request.
2. Inspect the repository. Do not infer implementation from planned documentation.
3. Resolve the current identity from repository-local Git configuration and the authenticated GitHub account. Confirm `core.hooksPath` is `.githooks`. Only these pairs are valid:
   - Guy: `Guy Azene <azene.guy@gmail.com>` and GitHub `GuyAzene`.
   - Ohad: `Ohad Shoshani Levi <ohadsho34@gmail.com>` and GitHub `ohadsho`.
4. Confirm the current person is the active writer and, when a PR already exists, its author. Confirm the feature branch is based on the latest required package, the package issue exists, and the worktree contains no unrelated changes.
5. Stop and report any source contradiction, unknown or mismatched identity, competing writer, missing dependency, unrelated change, or ambiguous package. Do not guess or clean up another person's work.

## Verify and record the writer checkpoint

1. Compare the full branch diff with current `origin/main`, including lockfiles, generated types, migrations, tests, and documentation.
2. Run every current command required by the package, issue, README, and available repository scripts. Use current output; never claim an unavailable command passed.
3. Check for secrets, private locations, debug output, generated junk, deferred scope, and forbidden dependencies. Apply the repository's security and code-review rules even before partner review.
4. Update the package task boxes only for work actually completed. Set the active package ledger status to `review`, not `done`. Reconcile older merged or closed packages to `done` when the evidence is unambiguous.
5. Keep the README and other public documentation truthful about what is implemented and what remains deferred.
6. Stage only the package changes. Confirm both partners genuinely participated before committing.
7. Commit a coherent checkpoint. Verify the tracked hook added exactly one reciprocal `Co-authored-by` trailer and that the primary author matches the local identity. Do not create an empty bookkeeping commit when the required state is already committed.
8. Push the existing feature branch without rewriting its history.

## Create or update the pull request

Create one pull request into `main`, or update the existing pull request instead of duplicating it. Its body must include:

- the package ID and closing issue reference;
- observable outcome and concise implementation summary;
- authorization, schema, migration, and safety decisions when relevant;
- exact commands and current results from the writer clone;
- manual acceptance evidence and meaningful UI screenshots when applicable;
- known limitations and deliberately excluded work;
- confirmation that the full diff, secrets, and unrelated changes were checked;
- a statement that reciprocal second-clone review and reproduction remain pending.

Request the other partner automatically:

- PR opened by `GuyAzene` → request `ohadsho`.
- PR opened by `ohadsho` → request `GuyAzene`.

Verify the open PR head equals the pushed local commit and the reciprocal reviewer is requested. Return only the PR URL, package, head SHA, verification summary, and the handoff instruction: use `$huddle-review-merge` on the requested review.

Never merge, approve, or dismiss findings from this writer workflow.
