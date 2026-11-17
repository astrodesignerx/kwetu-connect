<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Housekeeping after a merge

After merging a branch, and before creating another worktree, tidy up with the `tidy-worktrees` skill (`.claude/skills/tidy-worktrees`). Start with its read-only inventory (`node .claude/skills/tidy-worktrees/inventory.mjs`). Remove only worktrees that are clean, fully in main and have nothing running from them, using `git worktree remove` without `--force` and `git branch -d`, never `-D`. Keep and name anything with uncommitted files or unmerged commits. Never drop the `clientcomms` database. Remote branches are deleted only when the user says so. Record what was removed and what was kept in STATE.md.
