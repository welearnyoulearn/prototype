# #253 — Critical authorization boundaries

## Summary

The pre-market authorization review found API operations whose UI was hidden by role or plan, but whose backend handler did not independently enforce the same boundary. The highest-impact cases included shared platform-catalog writes, notification mutation, school directories, textbook files, upload signatures, plan-gated modules and legacy password endpoints.

## Impact

An unauthenticated or lower-privileged caller could directly invoke affected APIs, bypassing frontend navigation. Depending on the route, this could expose tenant metadata, enumerate people, alter shared curriculum data, mutate notification state, or obtain an upload signature broader than the product workflow intended.

No production exploitation was identified during this review. The issue was found before market launch.

## Root cause

Authorization rules evolved independently in page navigation, individual route handlers and plan configuration. `/api/` is intentionally dispatched to route handlers by the proxy, so hiding a screen or button never protected its API. Several older routes also trusted body/query identifiers such as `school_id`, recipient ids or resource folders instead of deriving authority from the signed session.

## Remediation

- Added role and tenant checks to platform, directory, textbook, material, notification and initialization APIs.
- Added a fail-closed proxy entitlement check backed by the server feature catalog, while retaining route-level identity and ownership checks.
- Restricted upload signatures to explicit role/folder/public-id combinations.
- Retired the unauthenticated parent lookup and protected legacy id-based password changes with a matching live portal identity.
- Revalidate teacher, student and parent tokens against current database account state.
- Reduced the public health response to generic availability state.
- Added regression tests for anonymous calls, role escalation, tenant directory access, upload signing and direct plan bypass.

## Prevention

Every new API must authenticate in the handler, derive tenant and actor identity from the session, authorize the resource relationship, enforce the feature entitlement server-side, and include at least one negative direct-API test. Frontend visibility is not an authorization control.
