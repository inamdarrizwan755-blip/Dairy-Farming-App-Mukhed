/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BarChart3,
  CheckSquare,
  DatabaseBackup,
  Droplets,
  Heart,
  Home,
  IndianRupee,
  LayoutGrid,
  LogOut,
  Package,
  PawPrint,
  QrCode,
  Settings,
  Smartphone,
  Stethoscope,
  WifiOff,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { PinLockScreen } from './components/PinLockScreen';
import { QrScannerModal } from './components/QrModalAndScanner';
import { SyncStatusBadge } from './components/SyncStatusBadge';
import { FarmProvider, useFarm } from './context/FarmContext';
import { t } from './domain/i18n';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWA';
import { AnimalProfileScreen } from './screens/AnimalProfileScreen';
import { AnimalsScreen } from './screens/AnimalsScreen';
import { BreedingCalvingScreen } from './screens/BreedingCalvingScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { FeedScreen } from './screens/FeedScreen';
import { FinanceScreen } from './screens/FinanceScreen';
import { HealthVetScreen } from './screens/HealthVetScreen';
import { MilkScreen } from './screens/MilkScreen';
import { MoreScreen } from './screens/MoreScreen';
import {
  BackupRestoreScreen,
  ReportsScreen,
  SettingsScreen,
} from './screens/ReportsBackupSettingsScreen';
import { TasksRemindersScreen } from './screens/TasksRemindersScreen';
import { WorkerWorkspaceScreen } from './screens/WorkerWorkspaceScreen';
import { ActiveRoute } from './types/models';

const DairyTrackShell: React.FC = () => {
  const {
    isLoading,
    isLocked,
    isWorker,
    settings,
    preferences,
    route,
    navigate,
    signOutFromSharedFarm,
    toast,
    dismissToast,
    notify,
  } = useFarm();

  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [scannerOpen, setScannerOpen] = useState(false);

  const lang = preferences.language;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7F3] px-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1B4D3E] text-white font-bold text-lg">
            DT
          </div>
          <p className="mt-3 text-sm font-semibold text-stone-800">
            Opening Offline Farm Database...
          </p>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return <PinLockScreen />;
  }

  const isMoreGroup = [
    'more',
    'feed',
    'health',
    'breeding',
    'finance',
    'tasks',
    'reports',
    'backup',
    'settings',
  ].includes(route.name);

  const isAnimalsGroup = route.name === 'animals' || route.name === 'animal-profile';

  const sidebarLinks: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    target: ActiveRoute;
    active: boolean;
  }> = [
    {
      id: 'dashboard',
      label: t(lang, 'dashboard'),
      icon: Home,
      target: { name: 'dashboard' },
      active: route.name === 'dashboard',
    },
    {
      id: 'animals',
      label: t(lang, 'animals'),
      icon: PawPrint,
      target: { name: 'animals' },
      active: isAnimalsGroup,
    },
    {
      id: 'milk',
      label: t(lang, 'milk'),
      icon: Droplets,
      target: { name: 'milk' },
      active: route.name === 'milk',
    },
    {
      id: 'feed',
      label: t(lang, 'feedInventory'),
      icon: Package,
      target: { name: 'feed' },
      active: route.name === 'feed',
    },
    {
      id: 'health',
      label: t(lang, 'healthMedicines'),
      icon: Stethoscope,
      target: { name: 'health' },
      active: route.name === 'health',
    },
    {
      id: 'breeding',
      label: t(lang, 'breedingCalving'),
      icon: Heart,
      target: { name: 'breeding' },
      active: route.name === 'breeding',
    },
    {
      id: 'finance',
      label: t(lang, 'financeProfit'),
      icon: IndianRupee,
      target: { name: 'finance' },
      active: route.name === 'finance',
    },
    {
      id: 'tasks',
      label: t(lang, 'tasksReminders'),
      icon: CheckSquare,
      target: { name: 'tasks' },
      active: route.name === 'tasks',
    },
    {
      id: 'reports',
      label: t(lang, 'reportsAnalytics'),
      icon: BarChart3,
      target: { name: 'reports' },
      active: route.name === 'reports',
    },
    {
      id: 'backup',
      label: t(lang, 'backupRestore'),
      icon: DatabaseBackup,
      target: { name: 'backup' },
      active: route.name === 'backup',
    },
    {
      id: 'settings',
      label: t(lang, 'farmSettings'),
      icon: Settings,
      target: { name: 'settings' },
      active: route.name === 'settings',
    },
  ];

  const renderActiveScreen = () => {
    if (isWorker) {
      return <WorkerWorkspaceScreen />;
    }
    switch (route.name) {
      case 'dashboard':
        return <DashboardScreen onOpenScanner={() => setScannerOpen(true)} />;
      case 'animals':
        return (
          <AnimalsScreen
            initialStatusFilter={route.filterStatus}
            initialOpenAdd={route.openAdd}
            onOpenScanner={() => setScannerOpen(true)}
          />
        );
      case 'animal-profile':
        return (
          <AnimalProfileScreen
            animalId={route.animalId}
            initialTab={route.initialTab}
          />
        );
      case 'milk':
        return <MilkScreen initialTab={route.initialTab} />;
      case 'more':
        return <MoreScreen />;
      case 'feed':
        return <FeedScreen />;
      case 'health':
        return <HealthVetScreen initialTab={route.initialTab} />;
      case 'breeding':
        return <BreedingCalvingScreen initialTab={route.initialTab} />;
      case 'finance':
        return <FinanceScreen initialTab={route.initialTab} />;
      case 'tasks':
        return <TasksRemindersScreen />;
      case 'reports':
        return <ReportsScreen />;
      case 'backup':
        return <BackupRestoreScreen />;
      case 'settings':
        return <SettingsScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F3] text-stone-900">
      {/* Top Bar — 3 Clean Zones on Desktop, Compact Header on Mobile */}
      <header className="sticky top-0 z-30 border-b border-stone-200/90 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:gap-8 sm:px-6">
          {/* Zone 1: Brand Wordmark + SyncStatusBadge */}
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate({ name: 'dashboard' })}
              className="flex min-h-[44px] items-center gap-2.5 text-left whitespace-nowrap"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1B4D3E] font-mono text-xs font-bold text-white">
                DT
              </span>
              <span className="text-base font-bold tracking-tight text-stone-900">
                {t(lang, 'appName')}
              </span>
              <span className="hidden text-xs text-stone-500 md:inline">
                · {settings.farmName}
              </span>
            </button>

            <SyncStatusBadge />
          </div>

          {/* Zone 2: Primary Desktop Navigation Links (Hidden for restricted Worker) */}
          {!isWorker && (
            <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary navigation">
              <button
                type="button"
                onClick={() => navigate({ name: 'dashboard' })}
                className={`min-h-[44px] text-sm font-semibold whitespace-nowrap transition-colors ${
                  route.name === 'dashboard'
                    ? 'text-[#1B4D3E]'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {t(lang, 'dashboard')}
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'animals' })}
                className={`min-h-[44px] text-sm font-semibold whitespace-nowrap transition-colors ${
                  isAnimalsGroup ? 'text-[#1B4D3E]' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {t(lang, 'animals')}
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'milk' })}
                className={`min-h-[44px] text-sm font-semibold whitespace-nowrap transition-colors ${
                  route.name === 'milk' ? 'text-[#1B4D3E]' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {t(lang, 'milk')}
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'reports' })}
                className={`min-h-[44px] text-sm font-semibold whitespace-nowrap transition-colors ${
                  route.name === 'reports'
                    ? 'text-[#1B4D3E]'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {t(lang, 'reportsAnalytics')}
              </button>
            </nav>
          )}

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await install();
                  if (ok) notify('DairyTrack installed to your phone!', 'success');
                }}
                aria-label="Install DairyTrack App"
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
              >
                <Smartphone className="h-4 w-4 text-[#1B4D3E]" />
                <span className="hidden sm:inline">{t(lang, 'installApp')}</span>
              </button>
            )}

            {isWorker ? (
              <button
                type="button"
                onClick={() => void signOutFromSharedFarm()}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
              >
                <LogOut className="h-4 w-4 text-stone-600" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="flex min-h-[40px] items-center gap-2 rounded-xl bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
              >
                <QrCode className="h-4 w-4" />
                <span>{t(lang, 'scanQr')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Subtle Non-Intrusive Offline Status Bar when disconnected */}
        {!isOnline && (
          <div className="border-t border-amber-200/80 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
            <span className="inline-flex items-center gap-1.5">
              <WifiOff className="h-3.5 w-3.5" />
              Offline Mode — All farm entries are saved locally on this device
            </span>
          </div>
        )}
      </header>

      {/* Main Content Layout: Left Desktop Sidebar (Managers only) + Active Workspace */}
      <div className="mx-auto flex max-w-7xl gap-6 px-4 pt-5 pb-24 sm:px-6 lg:pb-10">
        {!isWorker && (
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-20 rounded-2xl border border-stone-200/90 bg-white p-2.5">
              <ul className="space-y-1">
                {sidebarLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => navigate(item.target)}
                        className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors ${
                          item.active
                            ? 'bg-[#1B4D3E] text-white'
                            : 'text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        )}

        {/* Main Screen Container */}
        <main className="min-w-0 flex-1">{renderActiveScreen()}</main>
      </div>

      {/* Mobile 4-Tab Bottom Navigation Bar (Managers only; hidden for restricted Worker) */}
      {!isWorker && (
        <nav
          aria-label="Mobile bottom navigation"
          className="fixed right-0 bottom-0 left-0 z-30 border-t border-stone-200 bg-white/98 pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <div className="mx-auto grid h-15 max-w-lg grid-cols-4">
            <button
              type="button"
              onClick={() => navigate({ name: 'dashboard' })}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                route.name === 'dashboard' ? 'text-[#1B4D3E]' : 'text-stone-500'
              }`}
            >
              <Home className="h-5 w-5" />
              <span>{t(lang, 'dashboard')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate({ name: 'animals' })}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                isAnimalsGroup ? 'text-[#1B4D3E]' : 'text-stone-500'
              }`}
            >
              <PawPrint className="h-5 w-5" />
              <span>{t(lang, 'animals')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate({ name: 'milk' })}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                route.name === 'milk' ? 'text-[#1B4D3E]' : 'text-stone-500'
              }`}
            >
              <Droplets className="h-5 w-5" />
              <span>{t(lang, 'milk')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate({ name: 'more' })}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                isMoreGroup ? 'text-[#1B4D3E]' : 'text-stone-500'
              }`}
            >
              <LayoutGrid className="h-5 w-5" />
              <span>{t(lang, 'more')}</span>
            </button>
          </div>
        </nav>
      )}

      {/* Global Offline Camera QR Scanner Modal (Managers) */}
      {!isWorker && scannerOpen && (
        <QrScannerModal
          onClose={() => setScannerOpen(false)}
          onFoundAnimal={(animalId) => {
            setScannerOpen(false);
            navigate({ name: 'animal-profile', animalId });
          }}
        />
      )}

      {/* Toast Feedback Banner */}
      {toast && (
        <div className="fixed right-4 bottom-20 z-50 max-w-sm lg:bottom-6">
          <div
            role="status"
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === 'error'
                ? 'border-red-200 bg-red-950 text-white'
                : toast.tone === 'info'
                ? 'border-stone-700 bg-stone-900 text-white'
                : 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-white/15"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <FarmProvider>
      <DairyTrackShell />
    </FarmProvider>
  );
}
