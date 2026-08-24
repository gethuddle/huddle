---
name: huddle-review-merge
description: Perform the reciprocal second-clone review and, when explicitly requested, merge a Huddle pull request opened by the other partner. Use for assigned Huddle PR reviews; never implement fixes or review or merge the caller's own PR.
---

# Huddle Review and Merge

Replace the manual reviewer command list with one reproducible, identity-aware Huddle review. Remain read-only with respect to the pull-request branch. A clean, explicitly authorized review may approve and merge; a blocking finding must stop the merge and return the branch to its writer.

## Authorization boundary

An explicit request to use this skill to **review and merge** authorizes fetching the PR, running its local verification, submitting the reciprocal GitHub review, and merging only after every gate below passes. A request to **review** without the word `merge` authorizes the review but must stop before merge.

Neither form authorizes fixing files, committing to or pushing the PR branch, force-pushing, deploying, changing hosted services, dismissing another review, or deleting the remote branch.

## Select the reciprocal pull request

1. Read `AGENTS.md` first.
2. Resolve the authenticated GitHub login and repository-local Git identity. The only valid pairs are:
   - Guy: `Guy Azene <azene.guy@gmail.com>` and GitHub `GuyAzene`.
   - Ohad: `Ohad Shoshani Levi <ohadsho34@gmail.com>` and GitHub `ohadsho`.
3. Use the supplied PR number. If none is supplied, select the single open Huddle PR that requests the current user's review. If there are zero or multiple candidates, list them and stop rather than guessing.
4. Confirm the PR is ready for review, its author is the other partner, and the current user is the requested reviewer:
   - `GuyAzene` author → `ohadsho` reviewer and merger.
   - `ohadsho` author → `GuyAzene` reviewer and merger.
5. Never review or merge a PR authored by the authenticated reviewer account.

## Build the review boundary

1. Read the PR, all review threads, its issue and exclusions, the package section in `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`, and every referenced normative section.
2. Fetch `origin/main` and the exact PR head. Record both SHAs.
3. Preserve the reviewer's current worktree. Review from a clean detached checkout, dedicated clone, or isolated worktree at the PR head; never overwrite or clean local changes.
4. Inspect the complete diff against the current base, including files that automated tools skip. GitHub Copilot summaries and partial automated reviews do not count as the second-partner review.
5. Stop on a specification contradiction, unexpected base, changed or uncommitted tracked file, unknown identity, or PR head that moves during review.

## Reproduce and review

1. Run every command claimed in the PR plus every applicable package evidence command on the reviewer computer. Use the committed lockfile and local services required by that package.
2. Run the repository's available formatting, lint, typecheck, unit, component, database, build, and end-to-end gates that the package requires. Before CI package `F04`, record unavailable CI gates as unavailable rather than pretending they passed.
3. Confirm the verification leaves tracked files unchanged. A generated-type or formatting drift is a finding.
4. Review against `AGENTS.md`, the issue acceptance criteria, and the code-review rules. Prioritize correctness, authorization and RLS, privacy, data integrity, concurrency, missing tests, unsafe logs or secrets, deferred scope, and documentation drift.
5. Verify every human-authored commit uses a recognized primary identity and exactly one reciprocal co-author trailer.
6. Cite each finding at the smallest useful file and line range. Explain the concrete failure and missing evidence. Separate blocking findings from optional improvements.

## Decide and record

If any command fails, required evidence is absent, a blocking finding exists, required CI is red, or the PR head changed:

- do not approve or merge;
- submit a `REQUEST_CHANGES` review with the blocking evidence unless the user explicitly requested chat-only review;
- return ownership to the original writer;
- stop after giving the exact failed command or file and line evidence.

If no blocking findings exist:

1. Confirm all reviewer commands passed, required checks are green, the PR is mergeable, review threads are resolved, the head SHA is unchanged, and the issue link will close the correct package.
2. Submit the reciprocal approval with the reviewed SHA, commands and results, manual evidence, and an explicit no-blocking-findings statement.
3. If merge was explicitly authorized, use an enabled GitHub merge method without deleting the remote branch. Prefer squash for a small package.
4. Before completing a GitHub-generated squash or merge, ensure the final commit message contains exactly one reciprocal trailer for the PR author:
   - `GuyAzene` author → `Co-authored-by: Ohad Shoshani Levi <ohadsho34@gmail.com>`.
   - `ohadsho` author → `Co-authored-by: Guy Azene <azene.guy@gmail.com>`.
5. Verify the PR is `MERGED`, its closing issue is closed, and `origin/main` contains the resulting commit.
6. Report the PR URL, reviewed head, command evidence, merge commit, issue state, and next writer. The reviewer becomes the initial writer for the next dependency-ready package unless the repository records another rotation.

The next package writer must reconcile the merged package ledger entry from `review` to `done` before publishing the next pull request.
