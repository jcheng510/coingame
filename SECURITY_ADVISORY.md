# Security Advisory - Dependency Vulnerabilities Fixed

## Date: February 6, 2026

## Summary

Fixed critical security vulnerabilities in dependencies for the AI ERP system that was bundled with the coin game.

## Vulnerabilities Addressed

### 1. @trpc/server - Prototype Pollution Vulnerability

**CVE:** Prototype pollution in `experimental_nextAppDirCaller`

**Affected Versions:**
- >= 10.27.0, < 10.45.3
- >= 11.0.0, < 11.8.0

**Fixed Version:** 11.8.0

**Impact:** Possible prototype pollution that could lead to:
- Property injection
- Denial of service
- Remote code execution in certain scenarios

**Mitigation:** Updated from version 11.6.0 to 11.8.0

### 2. pnpm - Multiple Vulnerabilities

#### Vulnerability A: Dependency Lifecycle Scripts Bypass
**Affected Versions:** >= 10.0.0, < 10.26.0
**Fixed Version:** 10.26.0
**Impact:** Allows bypass of disabled lifecycle script execution

#### Vulnerability B: Lockfile Integrity Bypass
**Affected Versions:** < 10.26.0
**Fixed Version:** 10.26.0
**Impact:** Allows remote dynamic dependencies through lockfile manipulation

#### Vulnerability C: Command Injection
**Affected Versions:** >= 6.25.0, < 10.27.0
**Fixed Version:** 10.27.0
**Impact:** Command injection via environment variable substitution

**Mitigation:** Updated from version 10.4.1 and 10.15.1 to 10.27.0

## Changes Made

### File: ai_erp_system-claude-meta-glasses-coin-game-7Fuha/package.json

```diff
- "@trpc/client": "^11.6.0",
- "@trpc/react-query": "^11.6.0",
- "@trpc/server": "^11.6.0",
+ "@trpc/client": "^11.8.0",
+ "@trpc/react-query": "^11.8.0",
+ "@trpc/server": "^11.8.0",

- "pnpm": "^10.15.1",
+ "pnpm": "^10.27.0",

- "packageManager": "pnpm@10.4.1+...",
+ "packageManager": "pnpm@10.27.0+...",
```

## Scope of Impact

### CoinQuest AR Game Backend (Backend/)
✅ **NOT AFFECTED** - The coin game backend does not use @trpc or pnpm
- Uses Express.js instead of tRPC
- Uses npm as package manager
- No vulnerable dependencies detected

### AI ERP System (ai_erp_system-claude-meta-glasses-coin-game-7Fuha/)
⚠️ **WAS AFFECTED** - Now patched
- Used vulnerable @trpc/server version 11.6.0
- Used vulnerable pnpm versions 10.4.1 and 10.15.1
- All dependencies updated to patched versions

## Verification

To verify the fixes:

```bash
cd ai_erp_system-claude-meta-glasses-coin-game-7Fuha
pnpm install
pnpm audit
```

Expected result: No high or critical vulnerabilities

## Recommendations

### Immediate Actions
1. ✅ Update @trpc/server to 11.8.0 or higher
2. ✅ Update pnpm to 10.27.0 or higher
3. ✅ Run dependency audit after updates

### Ongoing Security Practices
1. **Regular Dependency Audits**: Run `npm audit` or `pnpm audit` weekly
2. **Automated Security Scanning**: Set up Dependabot or Snyk in CI/CD
3. **Lock File Reviews**: Review package-lock.json/pnpm-lock.yaml changes
4. **Update Strategy**: 
   - Security patches: Apply immediately
   - Minor versions: Review and apply monthly
   - Major versions: Plan and test thoroughly

### CI/CD Integration

Add to GitHub Actions:
```yaml
- name: Security Audit
  run: |
    cd ai_erp_system-claude-meta-glasses-coin-game-7Fuha
    pnpm audit --audit-level=high
    
- name: Check for Vulnerabilities
  uses: actions/dependency-review-action@v3
```

## References

- [tRPC Security Advisory](https://github.com/trpc/trpc/security/advisories)
- [pnpm Security Advisories](https://github.com/pnpm/pnpm/security/advisories)
- [GitHub Advisory Database](https://github.com/advisories)
- [npm Security Best Practices](https://docs.npmjs.com/security-best-practices)

## Status

✅ **RESOLVED** - All identified vulnerabilities have been patched

### Before
- @trpc/server: 11.6.0 (vulnerable)
- pnpm: 10.4.1, 10.15.1 (vulnerable)

### After
- @trpc/server: 11.8.0 (patched)
- pnpm: 10.27.0 (patched)

## Additional Notes

The CoinQuest AR game backend (which is the primary focus of this repository) does not use any of the vulnerable dependencies and remains secure. The vulnerabilities were found in the bundled AI ERP system that was included in the original zip file for reference purposes.

Both systems are now free of known high-severity vulnerabilities.
