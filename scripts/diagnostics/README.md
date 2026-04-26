One-off developer diagnostic helpers used while debugging JSX/div nesting in
the client tree. Run manually, e.g.:

```bash
node scripts/diagnostics/check_div.cjs client/src/pages/operations/EmailInbox.tsx 525
```

Not referenced by any production tooling and safe to delete once they're no
longer useful.
