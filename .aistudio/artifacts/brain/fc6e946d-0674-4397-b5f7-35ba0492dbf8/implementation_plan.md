# DairyTrack — Two-User Shared Farm Synchronization Plan

Upgrade the existing offline-first **DairyTrack** application so **two authorized Android phones** — **Farm Administrator** (you) and **Farm Member** (your uncle) — share one unified dairy farm database with automatic two-way Cloud Firestore synchronization whenever internet is available, while preserving 100% offline local operation.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Choices & Free-Tier Cloud Approval Gate**
> - **Confirmed — Separate Google Sign-In**: You (`inamdarrizwan755@gmail.com`) and your uncle will each sign in with your own separate Google account on your respective Android phones — zero password sharing and verified email identities out of the box.
> - **Confirmed — Admin Email Allowlist**: Only your Administrator account and the single Gmail address you allowlist for your uncle can ever access the shared farm. Public sign-ups and any third account are blocked both in the interface and in Cloud Firestore security rules.
> - **Confirmed — Non-Destructive Conflict Review**: If both phones edit the exact same record while offline, neither edit overwrites the other silently; both versions are preserved in an Administrator Conflict Review queue.
> - **No Billing / Free Spark Tier Only**: Provisioning uses Firebase Authentication and Cloud Firestore on Google's **free Spark tier** ($0 cost; no paid billing enabled). Once you click **Proceed** on this plan, AI Studio will show a one-time Firebase setup prompt so you can explicitly approve creating the free database before any cloud setup runs.
> - **Runtime Architecture Continuity**: To remain directly installable from this environment onto both Android phones without Play Store publishing, DairyTrack preserves its standalone offline Android PWA + local IndexedDB relational database architecture (mirroring Room/SQLite local-first semantics, background reconnection queues, and real-time Firestore `onSnapshot` listeners) without removing any existing feature.

---

## 1. Overview & Core Concept

- **What It Does**: Connects two separate Android phones to a single shared dairy farm (`farmId`) through Cloud Firestore while keeping each phone's local database as the immediate offline read/write source of truth.
- **Target Personas**:
  - **User 1 — Farm Administrator (You)**: Full operational read/write access plus exclusive authority over Farm Settings, Uncle's account allowlisting/revocation, Sync Conflict resolution, and JSON Backup Restore.
  - **User 2 — Farm Member (Your Uncle)**: Full operational read/write access across animals, milk yields, milk sales, customers, feed, health, medicines, vet visits, vaccinations, breeding, pregnancy, calving, weight, lactation, income/expenses, tasks, reminders, and reports — with administrative settings and destructive restore locked.
- **Key Value**: Either of you can record morning milk in the shed with mobile data turned off, and as soon as connectivity returns, both phones converge automatically without duplicate entries, lost edits, or shared passwords.

### Audit of Existing Codebase vs. Planned Upgrades

- **Already Built & Preserved Untouched**:
  - Local 24-table relational database (`dairytrack_db`) with atomic multi-table transactions (calving + calf creation, feed stock/ration deduction, health + medicine stock deduction, milk sales + income posting).
  - Stable UUIDs (`id`), `createdAt`, `updatedAt`, monotonic `version`, soft-delete tombstones (`isDeleted`), and `syncStatus` (`LOCAL_ONLY`, `PENDING_SYNC`, `SYNCED`, `CONFLICT`) across domain entities.
  - Printable QR ear-tags, live offline camera QR scanner, 18 CSV-exportable farm reports, SHA-256 verified local JSON backup/restore, offline PBKDF2 PIN + fingerprint lock, and English/Marathi (`मराठी`) switching.
- **What Needs Modification**:
  - Upgrade local database schema to v2 (non-destructively preserving all existing local records) to track `updatedBy`, `updatedByEmail`, `baseVersion`, `farmId`, and a new `sync_conflicts` table.
  - Replace the dormant `OfflineOnlyCloudAdapter` with a live **Two-Way Firestore Sync Engine** (outbound offline mutation queue + inbound real-time `onSnapshot` listeners across all synced farm collections).
  - Add **Team & Cloud Sync** workspace controls: Google Sign-In card, visible sync state indicator (`Synced`, `Pending`, `Offline`, `Error`, `Conflict`), Administrator allowlist input for your uncle's Gmail address, role-gated UI controls, and a side-by-side **Conflict Review** resolver.
  - Author and deploy zero-trust **Firestore Security Rules** enforcing verified Google emails, exact 2-member cap on the single shared `farmId`, schema validation, and Administrator-only mutations on farm settings and membership.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Offline-First Startup**: Opening DairyTrack on either phone loads the local database immediately — never blocked by a login wall when offline.
  2. **Administrator Cloud Link (Phone 1)**: You open **Settings → Cloud Sync & Team Access**, tap **Sign in with Google** (`inamdarrizwan755@gmail.com`), initialize the shared farm vault, and enter your uncle's Gmail address in the **Authorized Farm Member** slot.
  3. **Uncle's Phone Link (Phone 2)**: Your uncle installs the same DairyTrack link to his Android home screen, opens **Cloud Sync & Team Access**, and taps **Sign in with Google** with his own Gmail account. Firestore verifies his email against your allowlist and streams all shared farm records to his phone automatically.
  4. **Everyday Offline & Online Sync**: Every entry saved offline shows `Pending (N)` in the sync status bar. When internet returns, queued changes push automatically and switch to `Synced` with timestamp and author attribution (`Updated by Uncle · 07:15 AM`).
  5. **Simultaneous Edit Resolution**: If both phones edit the same animal, milk entry, or expense while offline, a calm amber notice (`1 Sync Conflict Needs Review`) appears for the Administrator to compare both versions side-by-side and choose which version to keep without losing historical data.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clean, high-legibility outdoor utilitarian interface tailored for fast one-handed farm use.
  - *Color Palette*: Warm neutral canvas (`#F8F7F3`, 60%), crisp white structural cards with `1px` stone hairline borders (`#FFFFFF` / `stone-200`, 30%), deep forest green primary actions (`#1B4D3E`, 10%), and semantic text+icon indicators for sync states (emerald for `Synced`, amber for `Pending` / `Conflict`, red for `Sync Error`).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` headings, `DM Sans` body prose, and `JetBrains Mono` with `tabular-nums` for all milk litres, INR (`₹`) amounts, weights, versions, and timestamps. Zero static pill badges (`·` inline separators only) and zero thick left borders.
  - *Touch Ergonomics*: Minimum `44px–48px` touch targets across all buttons and rows; compact sticky header + 4-tab mobile bottom bar strictly within the 15% viewport height cap.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Local IndexedDB Remains Primary Source of Truth**
  - *Chosen Approach*: Every create, edit, and soft-delete writes to local IndexedDB first (`syncStatus = PENDING_SYNC`), updating the UI instantaneously, while the background sync engine reconciles with Cloud Firestore asynchronously.
  - *Why*: Guarantees zero data loss when internet drops mid-milking and ensures a cloud error or quota limit never freezes or erases the local phone database.
  - *Alternatives Considered*: Relying solely on Firestore's internal SDK cache — rejected because explicit local IndexedDB tables preserve full offline JSON backup/restore, deterministic conflict inspection, and offline access even before signing in.
- **Decision 2: Base-Version Tracking + Admin Conflict Queue**
  - *Chosen Approach*: Every synced record tracks `version` and `baseVersion` (the cloud version it was last synced from). If a phone tries to push an update whose `baseVersion` is behind the current cloud `version` edited by the other user, the sync engine records a conflict copy in `sync_conflicts` rather than blindly overwriting.
  - *Why*: Protects historical milk, breeding, health, and financial records from silent last-write-wins data loss when both users work offline.
- **Decision 3: Two-Layer Role Enforcement (Firestore Rules + UI Guards)**
  - *Chosen Approach*: Enforce the 2-user verified-email allowlist and Administrator-only permissions (`farm_settings`, `farm_access`, restore batch overwrites, conflict resolution) directly inside `firestore.rules`, mirrored by clear read-only states in the Farm Member UI.
  - *Why*: Hiding buttons in client code alone is never sufficient security; server-enforced Firestore rules guarantee unauthorized accounts cannot read or mutate farm documents even if client code is bypassed.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Synchronization Flow

```text
┌───────────────────────────────┐        ┌───────────────────────────────┐
│   ANDROID PHONE 1 (ADMIN)     │        │  ANDROID PHONE 2 (UNCLE)      │
│  ┌─────────────────────────┐  │        │  ┌─────────────────────────┐  │
│  │ React Screens & Forms   │  │        │  │ React Screens & Forms   │  │
│  │ (Role: ADMIN)           │  │        │  │ (Role: MEMBER)          │  │
│  └───────────┬─────────────┘  │        │  └───────────┬─────────────┘  │
│              ▼                │        │              ▼                │
│  ┌─────────────────────────┐  │        │  ┌─────────────────────────┐  │
│  │ Local IndexedDB (v2)    │  │        │  │ Local IndexedDB (v2)    │  │
│  │ 24 Stores + Conflicts   │  │        │  │ 24 Stores + Conflicts   │  │
│  │ UUID · Version · Author │  │        │  │ UUID · Version · Author │  │
│  └─────┬─────────────▲─────┘  │        │  └─────┬─────────────▲─────┘  │
│        │ Outbound    │ Live   │        │        │ Outbound    │ Live   │
│        │ Queue       │ Listen │        │        │ Queue       │ Listen │
│  ┌─────▼─────────────┴─────┐  │        │  ┌─────▼─────────────┴─────┐  │
│  │ Background Sync Engine  │  │        │  │ Background Sync Engine  │  │
│  │ (Online / Focus / Retry)│  │        │  │ (Online / Focus / Retry)│  │
│  └─────────────┬───────────┘  │        │  └───────────┬─────────────┘  │
└────────────────┼──────────────┘        └──────────────┼────────────────┘
                 │   HTTPS + Verified Google Auth JWT   │
                 ▼                                      ▼
        ┌────────────────────────────────────────────────────────┐
        │          FIREBASE AUTH & CLOUD FIRESTORE               │
        │  ┌──────────────────────────────────────────────────┐  │
        │  │ Zero-Trust Security Rules (firestore.rules)      │  │
        │  │ • email_verified == true                         │  │
        │  │ • Exact 2 Users: Admin Email + Uncle Email       │  │
        │  │ • Shared farmId = "primary_farm"                 │  │
        │  │ • Admin-only: access config, settings, restore   │  │
        │  └──────────────────────────────────────────────────┘  │
        │  /farms/{farmId}         -> Farm metadata & allowlist  │
        │  /farms/{farmId}/settings/config -> Shared FarmSettings│
        │  /farms/{farmId}/records/{recordId} -> Typed entities  │
        └────────────────────────────────────────────────────────┘
```

### Data Model & Sync Metadata

- **Farm Membership & Access Document (`/farms/{farmId}`)**:
  - `farmId`: Stable shared farm identifier (`primary_farm`).
  - `adminUid` & `adminEmail`: Bootstrapped to your verified Google account (`inamdarrizwan755@gmail.com`).
  - `memberEmail`: Your uncle's allowlisted Google email address (set/updated only by Administrator).
  - `memberUid`: Bound automatically when your uncle signs in with that verified email; maximum of 2 users total.
- **Synchronized Farm Records (`/farms/{farmId}/records/{collectionKey}_{recordId}` or domain subcollections)**:
  - Synchronizes all 22 operational stores (`animals`, `milk_records`, `customers`, `milk_sales`, `feed_types`, `feed_stock_transactions`, `feed_records`, `health_records`, `medicines`, `medicine_usages`, `veterinary_visits`, `vaccination_records`, `breeding_records`, `pregnancy_records`, `calving_records`, `weight_records`, `lactation_records`, `income_records`, `expense_records`, `employees`, `farm_tasks`, `reminders`) plus `farm_settings`.
  - Every record carries: `id` (UUID), `farmId`, `createdAt`, `updatedAt`, `updatedBy` (UID), `updatedByName`, `version`, `baseVersion`, `isDeleted` (soft-delete tombstone), and local `syncStatus` (`LOCAL_ONLY | PENDING_SYNC | SYNCED | CONFLICT | ERROR`).
  - Animal photos are compressed below 100 KB so every document stays well within Firestore's 1 MB document limit.
  - Device-specific preferences (`app_preferences`: local PIN hash, fingerprint credential, language choice) stay strictly private per phone so you and your uncle each keep your own independent phone PIN.

### Interactive Component & State Mapping

- **Sync Status Bar (Dashboard & Header Workspace)**: Displays live state (`Synced`, `Pending · N changes`, `Offline — Saved Locally`, `Sync Error — Retry`, or `Conflict Needs Review`) with a manual **Sync Now** button.
- **Team & Cloud Access Panel (Settings)**:
  - Signed-out state: **Sign in with Google** button; offline local app continues working normally if skipped.
  - Signed-in as **Administrator**: Shows both member slots (Admin active + Uncle's Gmail input field with Save/Revoke actions), **Sync All Local Records Now**, and full Farm Settings & Backup Restore access.
  - Signed-in as **Farm Member (Uncle)**: Displays read-only Farm Settings and membership badge (`Signed in as Farm Member`), hides/locks account management and destructive backup overwrite controls, while keeping all daily farm data entry and reports enabled.
  - Unauthorized 3rd Google Account: Immediately signed out with a clear access-denied message; zero cloud reads or writes permitted by Firestore rules.
- **Conflict Resolution Modal (Administrator Only)**: Lists any simultaneous offline edit conflicts showing `Your Version` vs. `Uncle's Version` with field-by-field values, timestamps, and one-tap **Keep Mine** or **Keep Uncle's** actions (plus option to keep both as separate entries for milk/finance logs).

### Phased Delivery & Two-Phone Verification Plan

1. **Phase 1 — Firebase Provisioning & Hardened Security Rules**: Confirm free-tier Firebase setup via AI Studio's interactive prompt, create `firebase-blueprint.json`, write and audit `firestore.rules` (enforcing the 2-account verified-email gate and Admin vs. Member permissions), and deploy rules.
2. **Phase 2 — Local Database v2 Upgrade**: Non-destructively upgrade `dairytrack_db` to v2 with `updatedBy`, `baseVersion`, and `sync_conflicts` while keeping local JSON backup/restore 100% compatible.
3. **Phase 3 — Two-Way Sync Engine & Conflict Queue**: Wire Google Sign-In, initial local-to-cloud merge (so existing offline records on your phone upload cleanly without duplication), real-time `onSnapshot` listeners, automatic online/focus retry queue, and non-destructive conflict capture.
4. **Phase 4 — Role-Gated UI & Two-Device Verification Guide**: Build the Team Access panel, visible sync status badges, and Admin Conflict Resolver, compile and verify locally, and provide a step-by-step two-phone test script (online sync, offline airplane-mode queue test, simultaneous edit test, and member permission test) so synchronization is verified on both your phone and your uncle's phone before sign-off.
