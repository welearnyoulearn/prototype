# Platform Admin Portal

**Status:** 7 Built
**Last updated:** 2026-06-18

---

## Overview

The Platform Admin portal manages all schools on the WLYL platform at `/platform-admin`. Covers school creation, subscriptions, feature gating, and audit logging.

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| School Directory | Built | List all schools (active/inactive/deleted). Search by name, city, code. Filter by tier |
| Create School | Built | Full school creation. Auto-generates school_code and temp admin password. Sends onboarding email |
| Subscription Management | Built | Set tier (none/basic/standard/premium), plan dates, billing amount. Audit logged |
| Platform Statistics | Built | Total schools, teachers, students, subscription tier breakdown |
| Audit Log | Built | Immutable log: create school, update subscription, delete school, reset password. Actor, entity, before/after snapshot |
| Feature Configuration | Built | Enable/disable features per subscription tier. Changes reflect instantly |
| School Admin Password Reset | Built | Reset any school admin's password. Sends email with new temp password |

---

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/schools` | School CRUD |
| `POST /api/schools/[id]/subscription` | Manage subscription |
| `GET /api/platform/stats` | Platform statistics |
| `GET /api/platform/audit-log` | Audit trail |
| `GET/PUT /api/platform/features` | Feature configuration |
| `POST /api/schools/[id]/reset-password` | Password reset |
