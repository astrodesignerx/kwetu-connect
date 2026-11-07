# Kwetu OS web app

Browser client for Kwetu OS (Next.js 16, App Router).

Use Node.js 24 and pnpm 11.3.0. In Windows PowerShell, use `pnpm.cmd` in
the commands below if the execution policy blocks `pnpm.ps1`. This needs no
system policy change.

## Getting started

Install once from the workspace root:

```bash
pnpm install --frozen-lockfile
```

Run the web app:

```bash
pnpm --filter web dev
```

Open http://localhost:3013 with your browser to see the result.

With the API running in `Development`, sign in with `@admin` and password
`@admin`. This uses an existing admin, or creates a development admin in an
empty database. It leaves existing passwords unchanged. Shortcut sessions
expire after one hour and are rejected outside Development.

## Checks

```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

## Cleanup

Remove regenerable build output only:

```bash
pnpm clean:build
```

This clears Next.js and Turbo output plus the API, test and spike `bin`/`obj`
folders. It preserves dependencies, mailbox data, attachments, keys and project
notes. Stop running builds and servers first. After cleanup, restore the backend
before building it:

```bash
dotnet restore Kompanion.slnx
dotnet build Kompanion.slnx --no-restore
```
