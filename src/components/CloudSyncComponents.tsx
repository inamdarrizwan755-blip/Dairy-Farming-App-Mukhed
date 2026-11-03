import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  LogIn,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { formatDateTimeIndian, isCombinedMilkRecord } from '../domain/calculations';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../services/cloudSync';
import { OperationalStoreName, SyncConflictItem, SyncStatus } from '../types/models';

export const ADDITIVE_CONFLICT_STORES = new Set<OperationalStoreName>([
  'milk_records',
  'milk_sales',
  'feed_stock_transactions',
  'feed_records',
  'health_records',
  'medicine_usages',
  'veterinary_visits',
  'vaccination_records',
  'breeding_records',
  'pregnancy_records',
  'calving_records',
  'weight_records',
  'income_records',
  'expense_records',
  'farm_tasks',
]);

const STORE_LABELS: Record<OperationalStoreName, string> = {
  animals: 'Animal Profile',
  milk_records: 'Milk Production Entry',
  customers: 'Milk Buyer / Customer',
  milk_sales: 'Milk Sale Entry',
  feed_types: 'Feed Inventory Item',
  feed_stock_transactions: 'Feed Purchase / Stock Log',
  feed_records: 'Daily Feed Ration',
  health_records: 'Animal Health Record',
  medicines: 'Medicine Stock Item',
  medicine_usages: 'Medicine Usage Log',
  veterinary_visits: 'Veterinary Visit',
  vaccination_records: 'Vaccination Record',
  breeding_records: 'Heat / Breeding Record',
  pregnancy_records: 'Pregnancy Check',
  calving_records: 'Calving Event',
  weight_records: 'Body Weight Entry',
  lactation_records: 'Lactation Cycle',
  income_records: 'Income Ledger Entry',
  expense_records: 'Expense Ledger Entry',
  employees: 'Farm Worker Profile',
  farm_tasks: 'Farm Task',
  reminders: 'Farm Reminder',
};

const HIDDEN_DIFF_KEYS = new Set([
  'id',
  'farmId',
  'createdAt',
  'updatedAt',
  'updatedBy',
  'updatedByEmail',
  'version',
  'baseVersion',
  'syncStatus',
  'photoDataUrl',
]);

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function humanizeFieldKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export const SyncStatusBanner: React.FC<{
  onOpenConflicts: () => void;
}> = ({ onOpenConflicts }) => {
  const {
    syncState,
    signInToSharedFarm,
    triggerCloudSync,
    navigate,
  } = useFarm();

  const [busyAction, setBusyAction] = useState<'signin' | 'sync' | null>(null);

  const handleSignIn = async () => {
    try {
      setBusyAction('signin');
      await signInToSharedFarm();
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncNow = async () => {
    try {
      setBusyAction('sync');
      await triggerCloudSync();
    } finally {
      setBusyAction(null);
    }
  };

  const statusConfig = useMemo(() => {
    switch (syncState.status) {
      case 'SYNCED':
        return {
          title: 'Synced Across Shared Farm',
          icon: CheckCircle2,
          toneClass: 'border-stone-200/90 bg-white',
          iconClass: 'text-[#1B4D3E]',
          titleClass: 'text-stone-900',
        };
      case 'SYNCING':
        return {
          title: 'Synchronizing Farm Records...',
          icon: RefreshCw,
          toneClass: 'border-stone-200/90 bg-white',
          iconClass: 'text-[#1B4D3E] animate-spin',
          titleClass: 'text-stone-900',
        };
      case 'PENDING':
        return {
          title: `Pending Sync · ${syncState.pendingCount} ${
            syncState.pendingCount === 1 ? 'change' : 'changes'
          } queued`,
          icon: Clock,
          toneClass: 'border-amber-300/80 bg-amber-50/50',
          iconClass: 'text-amber-800',
          titleClass: 'text-stone-900',
        };
      case 'CONFLICT':
        return {
          title: `Simultaneous Offline Edit Saved · ${syncState.openConflictCount} for review`,
          icon: AlertTriangle,
          toneClass: 'border-amber-300 bg-amber-50/70',
          iconClass: 'text-amber-800',
          titleClass: 'text-amber-950',
        };
      case 'ERROR':
        return {
          title: 'Sync Error — Local Data Safe on Phone',
          icon: ShieldAlert,
          toneClass: 'border-red-200 bg-red-50/50',
          iconClass: 'text-red-700',
          titleClass: 'text-red-950',
        };
      case 'OFFLINE':
        return {
          title:
            syncState.pendingCount > 0
              ? `Offline · ${syncState.pendingCount} ${
                  syncState.pendingCount === 1 ? 'change' : 'changes'
                } queued locally`
              : 'Offline Mode · Working from Phone Database',
          icon: WifiOff,
          toneClass: 'border-stone-200/90 bg-white',
          iconClass: 'text-stone-600',
          titleClass: 'text-stone-900',
        };
      case 'LOCAL_ONLY':
      default:
        return {
          title: 'Local Phone Mode · Connect Google Account for 3-User Farm Sync',
          icon: Users,
          toneClass: 'border-stone-200/90 bg-white',
          iconClass: 'text-[#1B4D3E]',
          titleClass: 'text-stone-900',
        };
    }
  }, [syncState.openConflictCount, syncState.pendingCount, syncState.status]);

  const Icon = statusConfig.icon;
  const isManagerSession = syncState.role === 'ADMIN' || syncState.role === 'MEMBER';

  const roleLabel =
    syncState.role === 'ADMIN'
      ? `Administrator (${syncState.currentUser?.email})`
      : syncState.role === 'MEMBER'
      ? `Farm Member — Full Finance & Herd (${syncState.currentUser?.email})`
      : syncState.role === 'WORKER'
      ? `Farm Worker (${syncState.currentUser?.email})`
      : syncState.role === 'UNAUTHORIZED'
      ? 'Unauthorized Google Account'
      : 'Offline-first local storage active';

  const teamSummary = useMemo(() => {
    if (!isManagerSession || !syncState.farmAccess) return '';
    const parts: string[] = [];
    if (syncState.farmAccess.memberEmail) {
      parts.push(`Uncle: ${syncState.farmAccess.memberEmail}`);
    }
    if (syncState.farmAccess.workerEmail) {
      parts.push(
        `Worker: ${syncState.farmAccess.workerEmail}${
          syncState.farmAccess.workerActive ? '' : ' (Suspended)'
        }`
      );
    }
    return parts.join(' · ');
  }, [isManagerSession, syncState.farmAccess]);

  return (
    <section
      aria-label="Cloud Synchronization Status"
      className={`rounded-2xl border p-4 ${statusConfig.toneClass}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${statusConfig.iconClass}`} />
          <div className="min-w-0">
            <p className={`text-sm font-bold ${statusConfig.titleClass}`}>
              {statusConfig.title}
            </p>
            <p className="mt-0.5 text-xs text-stone-600">
              <span>{roleLabel}</span>
              {syncState.lastSyncedAt && (
                <span className="font-mono tabular-nums">
                  {' '}
                  · Last synced {formatDateTimeIndian(syncState.lastSyncedAt)}
                </span>
              )}
              {teamSummary && <span> · {teamSummary}</span>}
            </p>
            {(syncState.lastSyncError || syncState.unauthorizedReason) && (
              <p className="mt-1 text-xs font-medium text-red-700">
                {syncState.unauthorizedReason || syncState.lastSyncError}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {syncState.openConflictCount > 0 && isManagerSession && (
            <button
              type="button"
              onClick={onOpenConflicts}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-800 px-3.5 text-xs font-semibold text-white hover:bg-amber-900 whitespace-nowrap"
            >
              <AlertTriangle className="h-4 w-4" />
              Review Conflicts (
              <span className="font-mono tabular-nums">{syncState.openConflictCount}</span>)
            </button>
          )}

          {isManagerSession ? (
            <>
              <button
                type="button"
                disabled={busyAction === 'sync' || syncState.status === 'SYNCING'}
                onClick={handleSyncNow}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-[#1B4D3E] ${
                    busyAction === 'sync' || syncState.status === 'SYNCING' ? 'animate-spin' : ''
                  }`}
                />
                Sync Now
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'settings' })}
                className="flex min-h-[44px] items-center rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 whitespace-nowrap"
              >
                3-User Access
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!syncState.authReady || busyAction === 'signin'}
              onClick={handleSignIn}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-4 text-xs font-semibold text-white hover:bg-[#153D31] disabled:opacity-50 whitespace-nowrap"
            >
              <LogIn className="h-4 w-4" />
              {busyAction === 'signin' ? 'Signing in...' : 'Sign in with Google'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export const TeamCloudAccessCard: React.FC<{
  onOpenConflicts?: () => void;
}> = ({ onOpenConflicts }) => {
  const {
    syncState,
    milkRecords,
    breedingRecords,
    calvingRecords,
    incomeRecords,
    expenseRecords,
    animals,
    signInToSharedFarm,
    signOutFromSharedFarm,
    triggerCloudSync,
    updateTeamAccess,
    notify,
  } = useFarm();

  const [memberEmailDraft, setMemberEmailDraft] = useState(
    syncState.farmAccess?.memberEmail || ''
  );
  const [workerEmailDraft, setWorkerEmailDraft] = useState(
    syncState.farmAccess?.workerEmail || ''
  );
  const [workerActiveDraft, setWorkerActiveDraft] = useState<boolean>(
    syncState.farmAccess?.workerActive ?? true
  );
  const [confirmRevokeSlot, setConfirmRevokeSlot] = useState<'member' | 'worker' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMemberEmailDraft(syncState.farmAccess?.memberEmail || '');
    setWorkerEmailDraft(syncState.farmAccess?.workerEmail || '');
    setWorkerActiveDraft(syncState.farmAccess?.workerActive ?? true);
    setConfirmRevokeSlot(null);
  }, [
    syncState.farmAccess?.memberEmail,
    syncState.farmAccess?.workerActive,
    syncState.farmAccess?.workerEmail,
  ]);

  const isAuthorized =
    syncState.role === 'ADMIN' || syncState.role === 'MEMBER' || syncState.role === 'WORKER';

  const validateEmailFormat = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleSaveTeamEmails = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMember = memberEmailDraft.trim().toLowerCase();
    const cleanWorker = workerEmailDraft.trim().toLowerCase();

    if (cleanMember && !validateEmailFormat(cleanMember)) {
      notify('Enter a valid Google email address for Uncle (Farm Member).', 'error');
      return;
    }
    if (cleanWorker && !validateEmailFormat(cleanWorker)) {
      notify('Enter a valid Google email address for the Farm Worker.', 'error');
      return;
    }
    if (cleanMember === BOOTSTRAPPED_ADMIN_EMAIL || cleanWorker === BOOTSTRAPPED_ADMIN_EMAIL) {
      notify('Each person must use a separate Google account (do not enter Admin email).', 'error');
      return;
    }
    if (cleanMember && cleanWorker && cleanMember === cleanWorker) {
      notify('Uncle and the Farm Worker must have separate Google email addresses.', 'error');
      return;
    }

    try {
      setBusy(true);
      await updateTeamAccess({
        memberEmail: cleanMember,
        workerEmail: cleanWorker,
        workerActive: cleanWorker ? workerActiveDraft : false,
      });
      notify('Updated 3-user team permissions and Firestore access rules.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update team access.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleWorkerActive = async () => {
    if (!syncState.farmAccess?.workerEmail) return;
    const nextActive = !syncState.farmAccess.workerActive;
    try {
      setBusy(true);
      await updateTeamAccess({
        memberEmail: syncState.farmAccess.memberEmail,
        workerEmail: syncState.farmAccess.workerEmail,
        workerActive: nextActive,
      });
      notify(
        nextActive
          ? `Activated Farm Worker (${syncState.farmAccess.workerEmail}).`
          : `Suspended Farm Worker (${syncState.farmAccess.workerEmail}).`,
        'info'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not change worker status.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRevoke = async (slot: 'member' | 'worker') => {
    if (!syncState.farmAccess) return;
    try {
      setBusy(true);
      if (slot === 'member') {
        await updateTeamAccess({
          memberEmail: '',
          workerEmail: syncState.farmAccess.workerEmail,
          workerActive: syncState.farmAccess.workerActive,
        });
        setMemberEmailDraft('');
        notify('Revoked Uncle (Farm Member) cloud access.', 'info');
      } else {
        await updateTeamAccess({
          memberEmail: syncState.farmAccess.memberEmail,
          workerEmail: '',
          workerActive: false,
        });
        setWorkerEmailDraft('');
        setWorkerActiveDraft(false);
        notify('Revoked Farm Worker cloud access.', 'info');
      }
      setConfirmRevokeSlot(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not revoke access.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const statusText = useMemo(() => {
    switch (syncState.status) {
      case 'SYNCED':
        return 'Synced';
      case 'SYNCING':
        return 'Syncing...';
      case 'PENDING':
        return `Pending (${syncState.pendingCount})`;
      case 'CONFLICT':
        return `Conflict Review (${syncState.openConflictCount})`;
      case 'ERROR':
        return 'Error';
      case 'OFFLINE':
        return 'Offline Queue';
      default:
        return 'Local Only';
    }
  }, [syncState.openConflictCount, syncState.pendingCount, syncState.status]);

  // Recent Team Activity Feed for Admin & Uncle auditability
  const recentActivity = useMemo(() => {
    const animalMap = new Map(animals.map((a) => [a.id, a]));
    const rows: Array<{
      id: string;
      summary: string;
      actor: string;
      role: string;
      updatedAt: number;
      syncStatus: SyncStatus;
    }> = [];

    for (const m of milkRecords.slice(0, 25)) {
      if (m.isDeleted) continue;
      const target = isCombinedMilkRecord(m)
        ? `Combined ${m.session} Milk (${m.quantityLitres.toFixed(1)} L)`
        : `Cow Milk ${m.session} (${m.quantityLitres.toFixed(1)} L)`;
      rows.push({
        id: `m_${m.id}`,
        summary: `${target} on ${m.date}`,
        actor: m.updatedByEmail || m.createdByEmail || m.workerName || 'Local Phone',
        role: m.updatedByRole || m.createdByRole || 'LOCAL',
        updatedAt: m.updatedAt,
        syncStatus: m.syncStatus,
      });
    }

    for (const b of breedingRecords.slice(0, 15)) {
      if (b.isDeleted) continue;
      const tag = animalMap.get(b.animalId)?.tagNumber;
      rows.push({
        id: `b_${b.id}`,
        summary: `AI / Breeding (${b.semenOrBullId})${tag ? ` · Tag #${tag}` : ''}`,
        actor: b.updatedByEmail || b.createdByEmail || 'Local Phone',
        role: b.updatedByRole || b.createdByRole || 'LOCAL',
        updatedAt: b.updatedAt,
        syncStatus: b.syncStatus,
      });
    }

    for (const c of calvingRecords.slice(0, 15)) {
      if (c.isDeleted) continue;
      const tag = animalMap.get(c.motherId)?.tagNumber;
      rows.push({
        id: `c_${c.id}`,
        summary: `Calving (${c.calfCount} calf)${tag ? ` · Mother #${tag}` : ''}`,
        actor: c.updatedByEmail || c.createdByEmail || 'Local Phone',
        role: c.updatedByRole || c.createdByRole || 'LOCAL',
        updatedAt: c.updatedAt,
        syncStatus: c.syncStatus,
      });
    }

    for (const inc of incomeRecords.slice(0, 10)) {
      if (inc.isDeleted) continue;
      rows.push({
        id: `i_${inc.id}`,
        summary: `Income: ${inc.description}`,
        actor: inc.updatedByEmail || inc.createdByEmail || 'Local Phone',
        role: inc.updatedByRole || inc.createdByRole || 'LOCAL',
        updatedAt: inc.updatedAt,
        syncStatus: inc.syncStatus,
      });
    }

    for (const exp of expenseRecords.slice(0, 10)) {
      if (exp.isDeleted) continue;
      rows.push({
        id: `e_${exp.id}`,
        summary: `Expense: ${exp.description}`,
        actor: exp.updatedByEmail || exp.createdByEmail || 'Local Phone',
        role: exp.updatedByRole || exp.createdByRole || 'LOCAL',
        updatedAt: exp.updatedAt,
        syncStatus: exp.syncStatus,
      });
    }

    return rows.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  }, [animals, breedingRecords, calvingRecords, expenseRecords, incomeRecords, milkRecords]);

  return (
    <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-3.5">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-[#1B4D3E]" />
          <div>
            <h2 className="text-base font-bold text-stone-900">
              Three-User Shared Farm & Cloud Synchronization
            </h2>
            <p className="mt-0.5 text-xs text-stone-600">
              Private 3-account Google Sign-In & Cloud Firestore sync (Administrator, Uncle & Farm Worker) · Public signup disabled
            </p>
          </div>
        </div>

        <div className="text-xs font-medium text-stone-600 font-mono tabular-nums">
          Status: <span className="font-bold text-stone-900">{statusText}</span>
          {syncState.lastSyncedAt
            ? ` · ${formatDateTimeIndian(syncState.lastSyncedAt)}`
            : ''}
        </div>
      </div>

      {/* Three Authorized Role Cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-900">
              Role 1 · Farm Administrator
            </span>
            <ShieldCheck className="h-4 w-4 text-[#1B4D3E]" />
          </div>
          <p className="mt-1 font-mono text-xs font-semibold text-stone-800 break-all">
            {BOOTSTRAPPED_ADMIN_EMAIL}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone-600">
            Full control: all herd, milk, breeding & financial records, 3-user authorization, worker suspension, farm settings, conflict resolution & backup restore.
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-900">
              Role 2 · Farm Member (Uncle)
            </span>
            <UserCheck className="h-4 w-4 text-[#1B4D3E]" />
          </div>
          <p className="mt-1 font-mono text-xs font-semibold text-stone-800 break-all">
            {syncState.farmAccess?.memberEmail || 'Not authorized yet'}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone-600">
            Broad farm management + <strong>Full Financial Access</strong> (income, expenses, milk sales, customer payments, P&amp;L reports &amp; worker review). Cannot alter user roles or restore backups.
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-900">
              Role 3 · Farm Worker (Operator)
            </span>
            <ClipboardCheck className="h-4 w-4 text-stone-600" />
          </div>
          <p className="mt-1 font-mono text-xs font-semibold text-stone-800 break-all">
            {syncState.farmAccess?.workerEmail
              ? `${syncState.farmAccess.workerEmail} (${
                  syncState.farmAccess.workerActive ? 'Active' : 'Suspended'
                })`
              : 'Not authorized yet'}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone-600">
            Restricted strictly to Morning Milk, Evening Milk, Semen Insertion (AI), and Calving. Zero access to finances, customer payments, settings, or record deletion.
          </p>
        </div>
      </div>

      {/* Error or Unauthorized Notice */}
      {(syncState.unauthorizedReason || syncState.lastSyncError) && (
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-900">
          <p className="font-semibold">
            {syncState.unauthorizedReason ? 'Access Restricted' : 'Synchronization Notice'}
          </p>
          <p className="mt-0.5">
            {syncState.unauthorizedReason || syncState.lastSyncError}
          </p>
        </div>
      )}

      {/* Signed-Out State */}
      {!isAuthorized && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-[#F8F7F3] p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold text-stone-900">
              Sign in on each Android phone with its separate Google account
            </p>
            <p className="mt-0.5 text-xs text-stone-600">
              Never share passwords. Offline records remain safe on this phone and synchronize automatically after signing in.
            </p>
          </div>
          <button
            type="button"
            disabled={!syncState.authReady || busy}
            onClick={async () => {
              try {
                setBusy(true);
                await signInToSharedFarm();
              } finally {
                setBusy(false);
              }
            }}
            className="flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white hover:bg-[#153D31] disabled:opacity-50 whitespace-nowrap"
          >
            <LogIn className="h-4 w-4" />
            Sign in with Google
          </button>
        </div>
      )}

      {/* Signed-In Administrator Team Access Controls */}
      {syncState.role === 'ADMIN' && (
        <form
          onSubmit={handleSaveTeamEmails}
          className="space-y-4 border-t border-stone-100 pt-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-stone-800">
                Uncle&apos;s Google Email (Role 2 · Full Farm &amp; Finance)
              </label>
              <input
                type="email"
                value={memberEmailDraft}
                onChange={(e) => setMemberEmailDraft(e.target.value)}
                placeholder="uncle.account@gmail.com"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-800">
                Farm Worker&apos;s Google Email (Role 3 · Restricted Entry Only)
              </label>
              <input
                type="email"
                value={workerEmailDraft}
                onChange={(e) => {
                  setWorkerEmailDraft(e.target.value);
                  if (e.target.value.trim() && !syncState.farmAccess?.workerEmail) {
                    setWorkerActiveDraft(true);
                  }
                }}
                placeholder="worker.operator@gmail.com"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 text-xs font-medium text-stone-700">
              <input
                type="checkbox"
                checked={workerActiveDraft}
                onChange={(e) => setWorkerActiveDraft(e.target.checked)}
                className="h-4 w-4 accent-[#1B4D3E]"
              />
              <span>Farm Worker login enabled (uncheck to suspend worker immediately)</span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="min-h-[46px] rounded-xl bg-[#1B4D3E] px-5 text-sm font-semibold text-white hover:bg-[#153D31] disabled:opacity-50 whitespace-nowrap"
            >
              {busy ? 'Updating Cloud Rules...' : 'Save 3-User Access Permissions'}
            </button>
          </div>

          {/* Quick Suspend / Revoke Controls */}
          {(syncState.farmAccess?.memberEmail || syncState.farmAccess?.workerEmail) && (
            <div className="space-y-2 pt-1">
              {syncState.farmAccess?.memberEmail && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5">
                  <span className="text-xs text-stone-700">
                    Uncle (Member):{' '}
                    <strong className="font-mono">{syncState.farmAccess.memberEmail}</strong> · Active (Full Finance)
                  </span>
                  {confirmRevokeSlot !== 'member' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmRevokeSlot('member')}
                      className="min-h-[38px] rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Revoke Uncle
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleConfirmRevoke('member')}
                        className="min-h-[38px] rounded-lg bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800"
                      >
                        Confirm Revoke
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmRevokeSlot(null)}
                        className="min-h-[38px] rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {syncState.farmAccess?.workerEmail && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5">
                  <span className="text-xs text-stone-700">
                    Farm Worker:{' '}
                    <strong className="font-mono">{syncState.farmAccess.workerEmail}</strong> ·{' '}
                    <span
                      className={
                        syncState.farmAccess.workerActive
                          ? 'font-semibold text-[#1B4D3E]'
                          : 'font-semibold text-amber-800'
                      }
                    >
                      {syncState.farmAccess.workerActive ? 'Active' : 'Suspended'}
                    </span>
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleToggleWorkerActive}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 hover:bg-stone-100"
                    >
                      {syncState.farmAccess.workerActive ? (
                        <>
                          <PauseCircle className="h-3.5 w-3.5 text-amber-800" />
                          Suspend Worker
                        </>
                      ) : (
                        <>
                          <PlayCircle className="h-3.5 w-3.5 text-[#1B4D3E]" />
                          Activate Worker
                        </>
                      )}
                    </button>

                    {confirmRevokeSlot !== 'worker' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmRevokeSlot('worker')}
                        className="min-h-[38px] rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Revoke Worker
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleConfirmRevoke('worker')}
                          className="min-h-[38px] rounded-lg bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800"
                        >
                          Confirm Revoke
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmRevokeSlot(null)}
                          className="min-h-[38px] rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {/* Signed-In Farm Member (Uncle) Confirmation */}
      {syncState.role === 'MEMBER' && (
        <div className="rounded-xl border border-[#1B4D3E]/25 bg-[#1B4D3E]/5 p-3.5 text-xs text-stone-800">
          <p className="font-semibold text-[#1B4D3E]">
            Connected as Authorized Farm Member ({syncState.currentUser?.email})
          </p>
          <p className="mt-0.5 text-stone-700">
            You have full operational and financial access: manage animals, milk collection, milk sales, customer payments, income, expenses, profit &amp; loss reports, CSV exports, and worker entry reviews. User account changes, farm defaults, and database restore are reserved for the Administrator.
          </p>
        </div>
      )}

      {/* Recent Team Account Activity Log (Admin & Uncle) */}
      {(syncState.role === 'ADMIN' || syncState.role === 'MEMBER') &&
        recentActivity.length > 0 && (
          <div className="border-t border-stone-100 pt-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#1B4D3E]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                Recent Shared Account Activity
              </h3>
            </div>
            <ul className="mt-2.5 divide-y divide-stone-100 text-xs">
              {recentActivity.map((act) => (
                <li
                  key={act.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-900">{act.summary}</p>
                    <p className="font-mono text-[11px] text-stone-500 tabular-nums">
                      By {act.actor} ({act.role}) · {formatDateTimeIndian(act.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`font-semibold ${
                      act.syncStatus === SyncStatus.SYNCED
                        ? 'text-[#1B4D3E]'
                        : act.syncStatus === SyncStatus.ERROR
                        ? 'text-red-700'
                        : 'text-amber-800'
                    }`}
                  >
                    {act.syncStatus === SyncStatus.SYNCED
                      ? 'Synced'
                      : act.syncStatus === SyncStatus.ERROR
                      ? 'Error'
                      : 'Pending'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* Active Session Actions */}
      {isAuthorized && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
          <p className="text-xs text-stone-600 font-mono tabular-nums">
            Signed in: {syncState.currentUser?.email} · Pending queue: {syncState.pendingCount} · Open conflicts: {syncState.openConflictCount}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {syncState.openConflictCount > 0 && onOpenConflicts && (
              <button
                type="button"
                onClick={onOpenConflicts}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-800 px-3.5 text-xs font-semibold text-white hover:bg-amber-900"
              >
                <AlertTriangle className="h-4 w-4" />
                Review Conflicts ({syncState.openConflictCount})
              </button>
            )}
            <button
              type="button"
              disabled={busy || syncState.status === 'SYNCING'}
              onClick={async () => {
                try {
                  setBusy(true);
                  await triggerCloudSync();
                } finally {
                  setBusy(false);
                }
              }}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#1B4D3E] ${
                  syncState.status === 'SYNCING' ? 'animate-spin' : ''
                }`}
              />
              Sync Now
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  await signOutFromSharedFarm();
                } finally {
                  setBusy(false);
                }
              }}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-stone-200 px-3.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ConflictReviewModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { syncConflicts, syncState, resolveSyncConflict } = useFarm();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const openConflicts = useMemo(
    () => syncConflicts.filter((c) => c.status === 'OPEN'),
    [syncConflicts]
  );

  if (!open) return null;

  const isAdmin = syncState.role === 'ADMIN';

  const computeDiffRows = (conflict: SyncConflictItem) => {
    const keys = new Set<string>([
      ...Object.keys(conflict.serverData || {}),
      ...Object.keys(conflict.proposedData || {}),
    ]);
    const rows: Array<{
      key: string;
      label: string;
      serverVal: string;
      proposedVal: string;
      changed: boolean;
    }> = [];

    for (const key of Array.from(keys).sort()) {
      if (HIDDEN_DIFF_KEYS.has(key)) continue;
      const serverVal = formatFieldValue(conflict.serverData?.[key]);
      const proposedVal = formatFieldValue(conflict.proposedData?.[key]);
      rows.push({
        key,
        label: humanizeFieldKey(key),
        serverVal,
        proposedVal,
        changed: serverVal !== proposedVal,
      });
    }

    return rows.sort((a, b) => Number(b.changed) - Number(a.changed));
  };

  const handleResolve = async (
    conflict: SyncConflictItem,
    resolution: 'KEEP_SERVER' | 'APPLY_PROPOSED' | 'KEEP_BOTH'
  ) => {
    try {
      setResolvingId(conflict.conflictId);
      await resolveSyncConflict(conflict, resolution);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Simultaneous Offline Edit Review"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-[#F8F7F3] shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              Simultaneous Offline Edits ({openConflicts.length})
            </h2>
            <p className="text-xs text-stone-600">
              Two phones edited the same record offline before syncing. Neither version was overwritten.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Conflict Review"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {openConflicts.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-[#1B4D3E]" />
              <p className="mt-2 text-sm font-bold text-stone-900">
                All synchronization conflicts resolved
              </p>
              <p className="mt-1 text-xs text-stone-600">
                All authorized phones are aligned on the shared farm ledger.
              </p>
            </div>
          ) : (
            openConflicts.map((conflict) => {
              const rows = computeDiffRows(conflict);
              const allowKeepBoth =
                ADDITIVE_CONFLICT_STORES.has(conflict.storeName) &&
                !conflict.proposedData?.isDeleted;
              const isBusy = resolvingId === conflict.conflictId;

              return (
                <div
                  key={conflict.conflictId}
                  className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-100 pb-3">
                    <div>
                      <p className="text-sm font-bold text-stone-900">
                        {STORE_LABELS[conflict.storeName] || conflict.storeName}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-600 font-mono tabular-nums">
                        Detected {formatDateTimeIndian(conflict.createdAtMs)} · Server v
                        {conflict.serverVersion} vs Base v{conflict.proposedBaseVersion}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-stone-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 bg-stone-50 font-semibold text-stone-700">
                          <th className="px-3 py-2.5">Field</th>
                          <th className="px-3 py-2.5">
                            Current Shared ({conflict.serverUpdatedByEmail || 'Cloud'})
                          </th>
                          <th className="px-3 py-2.5">
                            Offline Edit ({conflict.proposedByEmail})
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {rows.map((r) => (
                          <tr
                            key={r.key}
                            className={r.changed ? 'bg-amber-50/70 font-medium' : ''}
                          >
                            <td className="px-3 py-2 text-stone-600 whitespace-nowrap">
                              {r.label}
                            </td>
                            <td className="px-3 py-2 text-stone-900 font-mono tabular-nums">
                              {r.serverVal}
                            </td>
                            <td
                              className={`px-3 py-2 font-mono tabular-nums ${
                                r.changed ? 'font-bold text-amber-950' : 'text-stone-900'
                              }`}
                            >
                              {r.proposedVal}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {isAdmin ? (
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolve(conflict, 'KEEP_SERVER')}
                        className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                      >
                        Keep Current Shared Version
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolve(conflict, 'APPLY_PROPOSED')}
                        className="min-h-[44px] rounded-xl bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white hover:bg-[#153D31] disabled:opacity-50"
                      >
                        Apply Offline Edit
                      </button>
                      {allowKeepBoth && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleResolve(conflict, 'KEEP_BOTH')}
                          className="min-h-[44px] rounded-xl border border-[#1B4D3E] bg-[#1B4D3E]/5 px-3.5 text-xs font-semibold text-[#1B4D3E] hover:bg-[#1B4D3E]/10 disabled:opacity-50"
                        >
                          Save Both as Separate Entries
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-600">
                      Both versions are safely stored. Please ask the Farm Administrator ({BOOTSTRAPPED_ADMIN_EMAIL}) to review and choose which version to apply.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
