import {
  Baby,
  BarChart3,
  CheckSquare,
  ChevronRight,
  DatabaseBackup,
  Heart,
  IndianRupee,
  Lock,
  Package,
  Scale,
  Settings,
  Smartphone,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import React from 'react';
import { useFarm } from '../context/FarmContext';
import { formatDateTimeIndian, formatINR, getTodayIso } from '../domain/calculations';
import { t } from '../domain/i18n';
import { usePWAInstall } from '../hooks/usePWA';
import { ActiveRoute, AnimalStatus } from '../types/models';

export const MoreScreen: React.FC = () => {
  const {
    settings,
    preferences,
    animals,
    feedTypes,
    healthRecords,
    medicines,
    vaccinationRecords,
    pregnancyRecords,
    calvingRecords,
    incomeRecords,
    expenseRecords,
    farmTasks,
    reminders,
    cloudSync,
    lockAppNow,
    navigate,
    notify,
  } = useFarm();

  const { isInstallable, isInstalled, install } = usePWAInstall();
  const lang = preferences.language;
  const today = getTodayIso();

  const lowFeedCount = feedTypes.filter((f) => f.currentStockKg <= f.lowStockThresholdKg).length;
  const activeSickCount = healthRecords.filter((h) => h.status !== 'RESOLVED').length;
  const lowMedCount = medicines.filter((m) => m.currentStock <= m.lowStockThreshold).length;
  const confirmedPregnant = pregnancyRecords.filter((p) => p.status === 'CONFIRMED').length;
  const calvesCount = animals.filter((a) => a.status === AnimalStatus.CALF).length;
  const pendingTasks = farmTasks.filter((tk) => tk.status === 'PENDING').length;
  const totalNet =
    incomeRecords.reduce((s, i) => s + i.amount, 0) -
    expenseRecords.reduce((s, e) => s + e.amount, 0);

  const hubItems: Array<{
    title: string;
    subtitle: string;
    stat: string;
    icon: React.ComponentType<{ className?: string }>;
    route: ActiveRoute;
  }> = [
    {
      title: t(lang, 'feedInventory'),
      subtitle: 'Fodder, silage, concentrates, purchases & daily rations',
      stat:
        lowFeedCount > 0
          ? `${feedTypes.length} feeds · ${lowFeedCount} low stock`
          : `${feedTypes.length} feed types`,
      icon: Package,
      route: { name: 'feed' },
    },
    {
      title: t(lang, 'healthMedicines'),
      subtitle: 'Illness logs, medicine stock/expiry & veterinary visits',
      stat:
        activeSickCount > 0 || lowMedCount > 0
          ? `${activeSickCount} active · ${lowMedCount} low med`
          : `${medicines.length} medicines`,
      icon: Stethoscope,
      route: { name: 'health', initialTab: 'health' },
    },
    {
      title: 'Vaccinations',
      subtitle: 'FMD, HS, BQ, Brucellosis schedules & due dates',
      stat: `${vaccinationRecords.length} doses logged`,
      icon: Syringe,
      route: { name: 'health', initialTab: 'vaccinations' },
    },
    {
      title: 'Heat, AI & Pregnancy',
      subtitle: 'Heat detection, AI straw tracking & gestation calendar',
      stat: `${confirmedPregnant} confirmed pregnant`,
      icon: Heart,
      route: { name: 'breeding', initialTab: 'pregnancy' },
    },
    {
      title: 'Calving & Calves',
      subtitle: 'Delivery wizard, automatic calf tags & dam/sire lineage',
      stat: `${calvingRecords.length} calvings · ${calvesCount} calves`,
      icon: Baby,
      route: { name: 'breeding', initialTab: 'calving' },
    },
    {
      title: 'Weight & Lactation',
      subtitle: 'Growth ADG (g/day), lactation yield & dry periods',
      stat: 'Track growth & peak yield',
      icon: Scale,
      route: { name: 'breeding', initialTab: 'weight-lactation' },
    },
    {
      title: t(lang, 'financeProfit'),
      subtitle: 'Income, expenses, net profit & farm workers register',
      stat: `All-time net: ${formatINR(totalNet)}`,
      icon: IndianRupee,
      route: { name: 'finance', initialTab: 'summary' },
    },
    {
      title: t(lang, 'tasksReminders'),
      subtitle: `Daily chores & local alerts (as of ${today.split('-').reverse().join('/')})`,
      stat: `${pendingTasks} tasks · ${reminders.length} reminders`,
      icon: CheckSquare,
      route: { name: 'tasks' },
    },
    {
      title: t(lang, 'reportsAnalytics'),
      subtitle: '18 filterable farm registers, visual charts & CSV export',
      stat: '18 live reports',
      icon: BarChart3,
      route: { name: 'reports' },
    },
    {
      title: t(lang, 'backupRestore'),
      subtitle: 'SHA-256 verified offline JSON backup, restore & CSV files',
      stat: preferences.lastLocalBackupAt
        ? `Backed up ${formatDateTimeIndian(preferences.lastLocalBackupAt)}`
        : 'No JSON backup yet',
      icon: DatabaseBackup,
      route: { name: 'backup' },
    },
    {
      title: t(lang, 'farmSettings'),
      subtitle: '3-user Google sync, farm details, milk rate, Marathi & PIN lock',
      stat:
        cloudSync.role === 'ADMIN' || cloudSync.role === 'MEMBER'
          ? `${settings.farmName} · ${cloudSync.status}`
          : `${settings.farmName} · Local Offline`,
      icon: Settings,
      route: { name: 'settings' },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Farm Operations & Modules</h1>
          <p className="text-xs text-stone-600">
            {settings.farmName} · All modules run 100% offline on local device storage
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isInstalled && isInstallable && (
            <button
              type="button"
              onClick={async () => {
                const ok = await install();
                if (ok) notify('DairyTrack installed to home screen!', 'success');
              }}
              className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1B4D3E] px-4 text-xs font-semibold text-white hover:bg-[#153D31]"
            >
              <Smartphone className="h-4 w-4" />
              {t(lang, 'installApp')}
            </button>
          )}
          {preferences.pinEnabled && (
            <button
              type="button"
              onClick={lockAppNow}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              <Lock className="h-4 w-4 text-[#1B4D3E]" />
              Lock Vault
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hubItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => navigate(item.route)}
              className="flex min-h-[96px] items-start justify-between gap-3 rounded-2xl border border-stone-200/90 bg-white p-4 text-left transition-colors hover:border-[#1B4D3E]/50 hover:bg-stone-50/60"
            >
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1B4D3E]/10 text-[#1B4D3E]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-900">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-stone-600">{item.subtitle}</p>
                  <p className="mt-2 font-mono text-xs font-medium text-[#1B4D3E] tabular-nums">
                    {item.stat}
                  </p>
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-400" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
