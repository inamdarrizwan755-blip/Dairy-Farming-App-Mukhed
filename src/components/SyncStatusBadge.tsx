import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudOff,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { useFarm } from '../context/FarmContext';

export const SyncStatusBadge: React.FC = () => {
  const { syncState, triggerCloudSync } = useFarm();

  const badge = useMemo(() => {
    switch (syncState.status) {
      case 'SYNCED':
        return {
          label: 'Synced',
          detail: 'All farm changes synchronized with shared cloud',
          Icon: CheckCircle2,
          containerClass:
            'border-[#1B4D3E]/25 bg-[#1B4D3E]/8 text-[#1B4D3E] hover:bg-[#1B4D3E]/15',
          iconClass: 'text-[#1B4D3E]',
        };
      case 'SYNCING':
        return {
          label: 'Pending',
          count: syncState.pendingCount > 0 ? syncState.pendingCount : undefined,
          detail: 'Synchronizing local changes with Cloud Firestore...',
          Icon: RefreshCw,
          containerClass:
            'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100/80',
          iconClass: 'text-amber-800 animate-spin',
        };
      case 'PENDING':
        return {
          label: 'Pending',
          count: syncState.pendingCount > 0 ? syncState.pendingCount : undefined,
          detail: `${syncState.pendingCount} local change(s) queued for cloud sync`,
          Icon: Clock,
          containerClass:
            'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100/80',
          iconClass: 'text-amber-800',
        };
      case 'CONFLICT':
        return {
          label: 'Pending',
          count: syncState.openConflictCount,
          detail: `${syncState.openConflictCount} simultaneous offline edit(s) awaiting Admin review`,
          Icon: AlertTriangle,
          containerClass:
            'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100/80',
          iconClass: 'text-amber-800',
        };
      case 'ERROR':
        return {
          label: 'Error',
          detail: syncState.lastSyncError || 'Cloud sync error — local phone data is safe',
          Icon: AlertCircle,
          containerClass:
            'border-red-300 bg-red-50 text-red-900 hover:bg-red-100/80',
          iconClass: 'text-red-700',
        };
      case 'OFFLINE':
        if (syncState.pendingCount > 0) {
          return {
            label: 'Pending',
            count: syncState.pendingCount,
            detail: `Phone offline — ${syncState.pendingCount} change(s) saved locally and queued`,
            Icon: WifiOff,
            containerClass:
              'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100/80',
            iconClass: 'text-amber-800',
          };
        }
        return {
          label: 'Offline',
          detail: 'Offline mode — working from local phone database',
          Icon: WifiOff,
          containerClass:
            'border-stone-300 bg-stone-100 text-stone-700 hover:bg-stone-200/70',
          iconClass: 'text-stone-600',
        };
      case 'LOCAL_ONLY':
      default:
        return {
          label: syncState.pendingCount > 0 ? 'Pending' : 'Local',
          count: syncState.pendingCount > 0 ? syncState.pendingCount : undefined,
          detail: 'Local phone database active — sign in under Settings for 3-phone sync',
          Icon: CloudOff,
          containerClass:
            'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100',
          iconClass: 'text-stone-500',
        };
    }
  }, [
    syncState.lastSyncError,
    syncState.openConflictCount,
    syncState.pendingCount,
    syncState.status,
  ]);

  const { Icon } = badge;

  return (
    <button
      type="button"
      onClick={() => void triggerCloudSync()}
      title={badge.detail}
      aria-label={`Synchronization status: ${badge.label}. ${badge.detail}`}
      className={`inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${badge.containerClass}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${badge.iconClass}`} />
      <span>{badge.label}</span>
      {badge.count !== undefined && (
        <span className="font-mono text-[11px] font-bold tabular-nums">
          ({badge.count})
        </span>
      )}
    </button>
  );
};
