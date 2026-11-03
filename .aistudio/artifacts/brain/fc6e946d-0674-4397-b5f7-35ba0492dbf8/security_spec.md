# DairyTrack Three-User Firestore Security Specification (Phase 0 TDD)

## 1. Master Source of Truth & Three-Role Hierarchy
- **Root Authority**: `/farms/primary_farm` (`FarmAccess`) is the single relational source of truth for all subcollections (`/settings/config`, `/records/{docId}`, `/conflicts/{conflictId}`, `/backups/{backupId}`).
- **Role 1 — Farm Administrator (`ADMIN`)**:
  - Verified Google email `'inamdarrizwan755@gmail.com'` bound to `adminUid`.
  - Exclusive permission to create/update `/farms/primary_farm` user slots (`memberEmail`, `workerEmail`, `workerActive`), `/settings/config`, and `/backups/{backupId}`.
  - Full read/write/conflict-resolution access across all 22 operational & financial stores.
- **Role 2 — Farm Member (`MEMBER` — Uncle)**:
  - Verified Google email matching `getFarm(farmId).memberEmail` (`!= ''`) bound to `memberUid`.
  - **Full Financial & Operational Access**: Can read, query, create, and sequentially update all 22 operational and financial stores (`income_records`, `expense_records`, `milk_sales`, `customers`, `animals`, `milk_records`, `feed_*`, `medicines`, `health_*`, `breeding_*`, `pregnancy_*`, `calving_*`, `weight_*`, `lactation_*`, `employees`, `farm_tasks`, `reminders`) and create/resolve conflicts.
  - **Admin-Only Restrictions Enforced in Rules**: Cannot modify user accounts/roles on `/farms/primary_farm` (except initial `memberUid` self-binding when empty), cannot modify `/settings/config`, and cannot create/restore `/backups/{backupId}`.
- **Role 3 — Farm Worker (`WORKER` — Restricted Data Entry Operator)**:
  - Verified Google email matching `getFarm(farmId).workerEmail` (`!= ''`) **AND** `getFarm(farmId).workerActive == true`, bound to `workerUid`.
  - **Strict Store Allowlist (`isWorkerAllowedStore`)**: Can ONLY read/create/update documents in `['animals', 'milk_records', 'breeding_records', 'pregnancy_records', 'calving_records', 'lactation_records', 'weight_records']`.
  - **Zero Financial / Sensitive Store Access**: Mathematically blocked from `get`, `list`, `create`, and `update` on `income_records`, `expense_records`, `milk_sales`, `customers`, `medicines`, `medicine_usages`, `feed_types`, `feed_stock_transactions`, `feed_records`, `health_records`, `veterinary_visits`, `vaccination_records`, `employees`, `farm_tasks`, and `reminders`.
  - **Query Isolation Invariant**: Every non-worker store document MUST set `authorizedEmails == getFarm(farmId).managerEmails` (which contains ONLY Admin + Uncle, never `workerEmail`), preventing any `list` query by a Worker from ever matching financial or sensitive documents.
  - **No Deletion Invariant**: Worker writes (`create` and `update`) MUST satisfy `incoming().isDeleted == false`, blocking both hard deletes (`allow delete: if false`) and soft deletes (`isDeleted: true`) by the Worker.
  - **Instant Suspension**: Setting `workerActive = false` on `/farms/primary_farm` immediately revokes `isActiveWorker(farmId)` and removes `workerEmail` from `authorizedEmails`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Admin Spoof**: Token with `email: 'inamdarrizwan755@gmail.com'` and `email_verified: false` attempting `create` on `/farms/primary_farm` -> `PERMISSION_DENIED`.
2. **Fourth Unauthorized Google Account**: Verified user `stranger@gmail.com` attempting `get` on `/farms/primary_farm` or `list` on `/farms/primary_farm/records` -> `PERMISSION_DENIED`.
3. **Uncle Privilege Escalation (Role/User Management)**: Authenticated Uncle (`memberEmail`) attempting to update `workerEmail`, `adminEmail`, or `workerActive` on `/farms/primary_farm` -> `PERMISSION_DENIED`.
4. **Uncle Modifying Critical Cloud Farm Settings**: Authenticated Uncle attempting `update` on `/farms/primary_farm/settings/config` -> `PERMISSION_DENIED`.
5. **Worker Reading Financial Ledger (`income_records` / `expense_records`)**: Active Worker attempting `get` or `list` on `/farms/primary_farm/records/income_records__1` -> `PERMISSION_DENIED`.
6. **Worker Creating Expense or Customer Payment**: Active Worker attempting `create` on `/farms/primary_farm/records/milk_sales__1` -> `PERMISSION_DENIED`.
7. **Worker Soft-Deleting a Milk or Breeding Record**: Active Worker attempting `update` with `isDeleted: true` on `/farms/primary_farm/records/milk_records__1` -> `PERMISSION_DENIED`.
8. **Suspended Worker Attempting Milk Entry**: Worker with `workerActive == false` on `/farms/primary_farm` attempting `create` on `/farms/primary_farm/records/milk_records__2` -> `PERMISSION_DENIED`.
9. **Leaking Financial Record via `authorizedEmails` Poisoning**: Uncle or Admin attempting to create an `income_records` document whose `authorizedEmails` includes `workerEmail` instead of `managerEmails` -> `PERMISSION_DENIED`.
10. **Shadow Field Injection**: Member sending extra field `isSuperAdmin: true` on `/farms/primary_farm/records/{docId}` -> `PERMISSION_DENIED` (`hasOnly` check).
11. **Stale Offline Overwrite (Skipped Version)**: Uncle or Worker attempting `update` with `baseVersion: 1` when `existing().version == 2` -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery / Hard Delete**: Any user sending forged past `updatedAt` timestamp or calling `deleteDoc` on any collection -> `PERMISSION_DENIED`.
