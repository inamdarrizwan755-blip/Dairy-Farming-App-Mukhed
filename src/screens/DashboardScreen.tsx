import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Droplets,
  HeartHandshake,
  IndianRupee,
  Package,
  Plus,
  QrCode,
  Settings,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  ConflictReviewModal,
  SyncStatusBanner,
} from '../components/CloudSyncComponents';
import { useFarm } from '../context/FarmContext';
import {
  addDaysIso,
  calculateComprehensiveMilkAnalytics,
  calculateDailyMilkSummary,
  calculateProfitSummary,
  formatIndianDate,
  formatINR,
  getTodayIso,
} from '../domain/calculations';
import { t } from '../domain/i18n';
import { ActiveRoute, AnimalStatus } from '../types/models';

export const DashboardScreen: React.FC<{ onOpenScanner: () => void }> = ({ onOpenScanner }) => {
  const {
    settings,
    preferences,
    savePreferences,
    animals,
    milkRecords,
    feedTypes,
    medicines,
    healthRecords,
    vaccinationRecords,
    breedingRecords,
    pregnancyRecords,
    calvingRecords,
    farmTasks,
    incomeRecords,
    expenseRecords,
    canAdministerFarm,
    canReviewWorkerEntries,
    markWorkerEntryVerified,
    navigate,
    notify,
  } = useFarm();

  const [profitPeriod, setProfitPeriod] = useState<'month' | '30d' | 'all'>('month');
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const lang = preferences.language;
  const today = getTodayIso();

  // Herd counts (excluding Sold & Deceased from active herd count, while keeping status drilldowns accurate)
  const herdStats = useMemo(() => {
    const activeHerd = animals.filter(
      (a) => a.status !== AnimalStatus.SOLD && a.status !== AnimalStatus.DECEASED
    );
    return {
      total: activeHerd.length,
      lactating: animals.filter((a) => a.status === AnimalStatus.LACTATING).length,
      pregnant: animals.filter((a) => a.status === AnimalStatus.PREGNANT).length,
      dry: animals.filter((a) => a.status === AnimalStatus.DRY).length,
    };
  }, [animals]);

  const todayMilk = useMemo(
    () => calculateDailyMilkSummary(milkRecords, today),
    [milkRecords, today]
  );

  // 7-day milk trend (deduplicating combined herd sessions vs optional cow-wise logs)
  const sevenDayTrend = useMemo(() => {
    const analytics = calculateComprehensiveMilkAnalytics(milkRecords, today);
    return analytics.trend14d.slice(-7).map((pt) => {
      const [, mm, dd] = pt.date.split('-');
      return {
        date: pt.date,
        label: `${dd}/${mm}`,
        total: Math.round(pt.total * 10) / 10,
      };
    });
  }, [milkRecords, today]);

  const maxTrendLitres = Math.max(10, ...sevenDayTrend.map((d) => d.total));

  // Financial range calculation
  const financeSummary = useMemo(() => {
    let startIso: string | undefined;
    if (profitPeriod === 'month') {
      startIso = `${today.slice(0, 7)}-01`;
    } else if (profitPeriod === '30d') {
      startIso = addDaysIso(today, -30);
    }
    return calculateProfitSummary(incomeRecords, expenseRecords, startIso, today);
  }, [incomeRecords, expenseRecords, profitPeriod, today]);

  // Real Alerts & Upcoming Schedule
  const lowStockFeeds = useMemo(
    () => feedTypes.filter((f) => f.currentStockKg <= f.lowStockThresholdKg),
    [feedTypes]
  );

  const medicineAlerts = useMemo(() => {
    const in30Days = addDaysIso(today, 30);
    return medicines.filter(
      (m) => m.currentStock <= m.lowStockThreshold || (m.expiryDate && m.expiryDate <= in30Days)
    );
  }, [medicines, today]);

  const activeHealthAlerts = useMemo(
    () => healthRecords.filter((h) => h.status === 'SICK' || h.status === 'RECOVERING'),
    [healthRecords]
  );

  const upcomingVaccinations = useMemo(() => {
    const in14Days = addDaysIso(today, 14);
    return vaccinationRecords
      .filter((v) => v.dueDate && v.dueDate <= in14Days)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [vaccinationRecords, today]);

  const upcomingCalvings = useMemo(() => {
    const in30Days = addDaysIso(today, 30);
    return pregnancyRecords
      .filter((p) => p.status === 'CONFIRMED' && p.expectedCalvingDate <= in30Days)
      .sort((a, b) => a.expectedCalvingDate.localeCompare(b.expectedCalvingDate));
  }, [pregnancyRecords, today]);

  const pendingTasks = useMemo(
    () =>
      farmTasks
        .filter((task) => task.status === 'PENDING')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [farmTasks]
  );

  const recentFinanceTransactions = useMemo(() => {
    const combined = [
      ...incomeRecords.map((i) => ({
        id: i.id,
        type: 'INCOME' as const,
        date: i.date,
        title: i.description,
        category: i.category,
        amount: i.amount,
      })),
      ...expenseRecords.map((e) => ({
        id: e.id,
        type: 'EXPENSE' as const,
        date: e.date,
        title: e.description,
        category: e.category,
        amount: e.amount,
      })),
    ];
    return combined.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [incomeRecords, expenseRecords]);

  const animalById = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  const pendingWorkerEntries = useMemo(() => {
    if (!canReviewWorkerEntries) return [];
    const items: Array<{
      id: string;
      storeName: 'milk_records' | 'breeding_records' | 'calving_records';
      title: string;
      meta: string;
      createdAt: number;
      route: ActiveRoute;
    }> = [];

    for (const m of milkRecords) {
      if (m.reviewStatus === 'PENDING_REVIEW') {
        const who = m.workerName || m.createdByName || m.createdByEmail || 'Farm Worker';
        items.push({
          id: m.id,
          storeName: 'milk_records',
          title: `${m.session === 'MORNING' ? 'Morning' : m.session === 'EVENING' ? 'Evening' : 'Afternoon'} Milk · ${m.quantityLitres.toFixed(1)} L`,
          meta: `${formatIndianDate(m.date)}${m.entryTime ? ` at ${m.entryTime}` : ''} · Logged by ${who}`,
          createdAt: m.createdAt,
          route: { name: 'milk', initialTab: 'combined' },
        });
      }
    }

    for (const b of breedingRecords) {
      if (b.reviewStatus === 'PENDING_REVIEW') {
        const a = animalById.get(b.animalId);
        const who = b.createdByName || b.createdByEmail || 'Farm Worker';
        items.push({
          id: b.id,
          storeName: 'breeding_records',
          title: `Semen / AI · ${a ? `Tag #${a.tagNumber}` : 'Female'} · Straw ${b.semenOrBullId}`,
          meta: `${formatIndianDate(b.breedingDate)}${b.breedingTime ? ` at ${b.breedingTime}` : ''} · Logged by ${who}`,
          createdAt: b.createdAt,
          route: { name: 'breeding', initialTab: 'breeding' },
        });
      }
    }

    for (const c of calvingRecords) {
      if (c.reviewStatus === 'PENDING_REVIEW') {
        const a = animalById.get(c.motherId);
        const who = c.createdByName || c.createdByEmail || 'Farm Worker';
        items.push({
          id: c.id,
          storeName: 'calving_records',
          title: `Calving / Delivery · ${a ? `Tag #${a.tagNumber}` : 'Mother'} · ${c.calfCount} calf${c.calfCount > 1 ? 's' : ''}`,
          meta: `${formatIndianDate(c.calvingDate)}${c.calvingTime ? ` at ${c.calvingTime}` : ''} · ${c.deliveryType || 'NORMAL'} · Logged by ${who}`,
          createdAt: c.createdAt,
          route: { name: 'breeding', initialTab: 'calving' },
        });
      }
    }

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [canReviewWorkerEntries, milkRecords, breedingRecords, calvingRecords, animalById]);

  return (
    <div className="space-y-6 pb-8">
      {/* Farm Welcome & Quick Toolbar */}
      <section className="flex flex-col gap-4 border-b border-stone-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-stone-500">
            {t(lang, 'subtitle')} · {formatIndianDate(today)}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
            {settings.farmName}
          </h1>
          {settings.ownerName && (
            <p className="mt-0.5 text-sm text-stone-600">
              {settings.ownerName}
              {settings.address ? ` · ${settings.address}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center rounded-xl border border-stone-200 bg-white p-1">
            <button
              type="button"
              onClick={() => savePreferences({ language: 'en' })}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                lang === 'en' ? 'bg-[#1B4D3E] text-white' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => savePreferences({ language: 'mr' })}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                lang === 'mr' ? 'bg-[#1B4D3E] text-white' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              मराठी
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenScanner}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
          >
            <QrCode className="h-4 w-4 text-[#1B4D3E]" />
            {t(lang, 'scanQr')}
          </button>

          <button
            type="button"
            onClick={() => navigate({ name: 'milk', initialTab: 'combined' })}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Log Milk
          </button>
        </div>
      </section>

      {/* Three-User Cloud Synchronization Status Strip */}
      <SyncStatusBanner onOpenConflicts={() => setConflictsOpen(true)} />

      {/* Worker Entries Pending Verification (Admin & Uncle) */}
      {canReviewWorkerEntries && pendingWorkerEntries.length > 0 && (
        <section className="rounded-2xl border border-amber-200/90 bg-amber-50/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-amber-800" />
              <h2 className="text-base font-bold text-stone-900">
                Worker Entries Pending Verification
              </h2>
            </div>
            <span className="font-mono text-xs font-semibold text-amber-900 tabular-nums">
              {pendingWorkerEntries.length} awaiting review
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-600">
            Verify daily milk, AI, and calving entries submitted by the Farm Worker, or open the module to record an audited correction.
          </p>

          <ul className="mt-3 divide-y divide-amber-200/60">
            {pendingWorkerEntries.slice(0, 6).map((entry) => (
              <li
                key={`${entry.storeName}:${entry.id}`}
                className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">{entry.title}</p>
                  <p className="mt-0.5 text-xs text-stone-600">{entry.meta}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={verifyingId === entry.id}
                    onClick={async () => {
                      try {
                        setVerifyingId(entry.id);
                        await markWorkerEntryVerified(entry.storeName, entry.id);
                        notify('Worker entry verified', 'success');
                      } finally {
                        setVerifyingId(null);
                      }
                    }}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white hover:bg-[#153D31] disabled:opacity-50 whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(entry.route)}
                    className="flex min-h-[40px] items-center gap-1 rounded-xl border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
                  >
                    Inspect / Correct
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Initial Farm Setup Prompt if unconfigured (Administrator only) */}
      {!settings.setupCompleted && canAdministerFarm && (
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-[#1B4D3E]/25 bg-[#1B4D3E]/5 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-[#1B4D3E]">Complete Your Farm Profile</h2>
            <p className="mt-1 text-sm text-stone-700">
              Set your farm name, owner details, default milk rate (₹/L), cow/buffalo gestation days, and optional 3-user Google sync.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ name: 'settings' })}
            className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
          >
            <Settings className="h-4 w-4" />
            Configure Farm
          </button>
        </section>
      )}

      {/* 4 Herd Strength KPIs (Tappable -> Opens Filtered Animals Screen) */}
      <section aria-label="Herd Strength Metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <button
          type="button"
          onClick={() => navigate({ name: 'animals', filterStatus: 'ALL' })}
          className="flex min-h-[96px] flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-4 text-left transition-colors hover:border-[#1B4D3E]/50"
        >
          <span className="text-xs font-medium text-stone-500">{t(lang, 'totalAnimals')}</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold text-stone-900 tabular-nums">
              {herdStats.total}
            </span>
            <ArrowRight className="h-4 w-4 text-stone-400" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate({ name: 'animals', filterStatus: AnimalStatus.LACTATING })}
          className="flex min-h-[96px] flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-4 text-left transition-colors hover:border-[#1B4D3E]/50"
        >
          <span className="text-xs font-medium text-stone-500">{t(lang, 'lactating')}</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold text-[#1B4D3E] tabular-nums">
              {herdStats.lactating}
            </span>
            <ArrowRight className="h-4 w-4 text-stone-400" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate({ name: 'animals', filterStatus: AnimalStatus.PREGNANT })}
          className="flex min-h-[96px] flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-4 text-left transition-colors hover:border-[#1B4D3E]/50"
        >
          <span className="text-xs font-medium text-stone-500">{t(lang, 'pregnant')}</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold text-amber-700 tabular-nums">
              {herdStats.pregnant}
            </span>
            <ArrowRight className="h-4 w-4 text-stone-400" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate({ name: 'animals', filterStatus: AnimalStatus.DRY })}
          className="flex min-h-[96px] flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-4 text-left transition-colors hover:border-[#1B4D3E]/50"
        >
          <span className="text-xs font-medium text-stone-500">{t(lang, 'dry')}</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold text-stone-700 tabular-nums">
              {herdStats.dry}
            </span>
            <ArrowRight className="h-4 w-4 text-stone-400" />
          </div>
        </button>
      </section>

      {/* Main 2-Column Split: Today's Milk & 7-Day Trend vs Selected-Period Profit */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
        {/* Milk Production Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-stone-600">
                  <Droplets className="h-4 w-4 text-[#1B4D3E]" />
                  <h2 className="text-base font-bold text-stone-900">{t(lang, 'todaysMilk')}</h2>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {t(lang, 'morning')}: <span className="font-mono font-semibold text-stone-800 tabular-nums">{todayMilk.morning.toFixed(1)} L</span>
                  {settings.enableAfternoonSession && (
                    <>
                      {' · '}
                      {t(lang, 'afternoon')}:{' '}
                      <span className="font-mono font-semibold text-stone-800 tabular-nums">
                        {todayMilk.afternoon.toFixed(1)} L
                      </span>
                    </>
                  )}
                  {' · '}
                  {t(lang, 'evening')}: <span className="font-mono font-semibold text-stone-800 tabular-nums">{todayMilk.evening.toFixed(1)} L</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate({ name: 'milk', initialTab: 'combined' })}
                className="text-right group"
              >
                <p className="font-mono text-3xl font-extrabold text-[#1B4D3E] tabular-nums group-hover:underline">
                  {todayMilk.total.toFixed(1)} L
                </p>
                {todayMilk.totalValue > 0 && (
                  <p className="font-mono text-xs text-stone-500 tabular-nums">
                    Valued {formatINR(todayMilk.totalValue)}
                  </p>
                )}
              </button>
            </div>

            {/* 7-Day Milk Trend Bar Chart */}
            <div className="mt-6 border-t border-stone-100 pt-4">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>Last 7 Days Milk Production (Litres)</span>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'milk', initialTab: 'combined' })}
                  className="font-semibold text-[#1B4D3E] hover:underline whitespace-nowrap"
                >
                  Full Milk Report
                </button>
              </div>

              {milkRecords.length === 0 ? (
                <div className="mt-4 flex min-h-[120px] flex-col items-center justify-center rounded-xl bg-stone-50 p-4 text-center">
                  <p className="text-xs text-stone-500">
                    No milk entries recorded yet. Log morning or evening milk to view your 7-day trend.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'milk', initialTab: 'combined' })}
                    className="mt-2.5 min-h-[38px] rounded-lg bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white hover:bg-[#153D31]"
                  >
                    Record First Milk Entry
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-7 items-end gap-2 h-32 pt-4">
                  {sevenDayTrend.map((d) => {
                    const heightPct = Math.max(6, Math.round((d.total / maxTrendLitres) * 100));
                    const isToday = d.date === today;
                    return (
                      <div key={d.date} className="flex h-full flex-col items-center justify-end gap-1.5">
                        <span className="font-mono text-[11px] font-medium text-stone-600 tabular-nums">
                          {d.total > 0 ? d.total.toFixed(1) : '0'}
                        </span>
                        <div className="flex w-full flex-1 items-end justify-center">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full max-w-[34px] rounded-t-md transition-opacity ${
                              isToday ? 'bg-[#1B4D3E]' : 'bg-[#1B4D3E]/35'
                            }`}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-stone-500 tabular-nums">
                          {d.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Financial Profit Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-[#1B4D3E]" />
                <h2 className="text-base font-bold text-stone-900">{t(lang, 'netProfit')}</h2>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1">
                {(['month', '30d', 'all'] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setProfitPeriod(period)}
                    className={`min-h-[30px] rounded-md px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      profitPeriod === period
                        ? 'bg-white text-stone-900 shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {period === 'month' ? 'Month' : period === '30d' ? '30 Days' : 'All'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate({ name: 'finance' })}
              className="mt-4 block w-full text-left group"
            >
              <p
                className={`font-mono text-3xl font-extrabold tabular-nums group-hover:underline ${
                  financeSummary.netProfit >= 0 ? 'text-[#1B4D3E]' : 'text-red-700'
                }`}
              >
                {formatINR(financeSummary.netProfit)}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {t(lang, 'income')}:{' '}
                <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                  {formatINR(financeSummary.totalIncome)}
                </span>
                {' · '}
                {t(lang, 'expenses')}:{' '}
                <span className="font-mono font-semibold text-red-700 tabular-nums">
                  {formatINR(financeSummary.totalExpenses)}
                </span>
              </p>
            </button>

            <div className="mt-4 border-t border-stone-100 pt-3">
              <p className="text-xs font-medium text-stone-500">Recent Income & Expenses</p>
              {recentFinanceTransactions.length === 0 ? (
                <p className="mt-3 text-xs text-stone-500">
                  No financial entries yet. Record milk sales or farm expenses to calculate profit.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-stone-100">
                  {recentFinanceTransactions.slice(0, 3).map((item) => (
                    <li key={item.id} className="flex items-center justify-between py-2 text-xs">
                      <div className="min-w-0 pr-3">
                        <p className="truncate font-medium text-stone-800">{item.title}</p>
                        <p className="text-stone-500">
                          {formatIndianDate(item.date)} · {item.category.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono font-semibold tabular-nums ${
                          item.type === 'INCOME' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {item.type === 'INCOME' ? '+' : '−'}
                        {formatINR(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate({ name: 'finance' })}
            className="mt-4 flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
          >
            Open Finance Ledger
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* Actionable Farm Alerts, Upcoming Calving, Vaccinations & Pending Tasks */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Critical Alerts: Health, Feed Stock, Medicine Expiry */}
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <h2 className="text-base font-bold text-stone-900">Health & Stock Alerts</h2>
            </div>
            <span className="font-mono text-xs text-stone-500 tabular-nums">
              {lowStockFeeds.length + medicineAlerts.length + activeHealthAlerts.length} active
            </span>
          </div>

          {lowStockFeeds.length === 0 &&
          medicineAlerts.length === 0 &&
          activeHealthAlerts.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">
              No low-stock feeds, expiring medicines, or active sick animal alerts right now.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-100">
              {activeHealthAlerts.map((h) => {
                const a = animalById.get(h.animalId);
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'health', initialTab: 'health' })}
                      className="flex min-h-[52px] w-full items-center justify-between py-2.5 text-left hover:bg-stone-50/80"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Stethoscope className="h-4 w-4 shrink-0 text-red-700" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900">
                            {a ? `Tag #${a.tagNumber}` : 'Animal'} · {h.status}
                          </p>
                          <p className="truncate text-xs text-stone-600">{h.symptoms}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
                    </button>
                  </li>
                );
              })}

              {lowStockFeeds.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'feed' })}
                    className="flex min-h-[52px] w-full items-center justify-between py-2.5 text-left hover:bg-stone-50/80"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Package className="h-4 w-4 shrink-0 text-amber-700" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-900">
                          Low Feed Stock: {f.name}
                        </p>
                        <p className="font-mono text-xs text-stone-600 tabular-nums">
                          {f.currentStockKg} kg left · Threshold {f.lowStockThresholdKg} kg
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
                  </button>
                </li>
              ))}

              {medicineAlerts.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'health', initialTab: 'medicines' })}
                    className="flex min-h-[52px] w-full items-center justify-between py-2.5 text-left hover:bg-stone-50/80"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Syringe className="h-4 w-4 shrink-0 text-amber-700" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-900">
                          Medicine Alert: {m.name}
                        </p>
                        <p className="font-mono text-xs text-stone-600 tabular-nums">
                          Stock {m.currentStock} {m.unit}
                          {m.expiryDate ? ` · Exp ${formatIndianDate(m.expiryDate)}` : ''}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming Calving, Vaccinations & Pending Farm Tasks */}
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">
                Upcoming Calving, Vaccines & Tasks
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate({ name: 'tasks' })}
              className="text-xs font-semibold text-[#1B4D3E] hover:underline whitespace-nowrap"
            >
              Manage Tasks ({pendingTasks.length})
            </button>
          </div>

          {upcomingCalvings.length === 0 &&
          upcomingVaccinations.length === 0 &&
          pendingTasks.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">
              No upcoming calvings, due vaccinations, or pending farm tasks scheduled.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-100">
              {upcomingCalvings.slice(0, 3).map((p) => {
                const a = animalById.get(p.animalId);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'breeding', initialTab: 'pregnancy' })}
                      className="flex min-h-[52px] w-full items-center justify-between py-2.5 text-left hover:bg-stone-50/80"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <HeartHandshake className="h-4 w-4 shrink-0 text-[#1B4D3E]" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900">
                            Expected Calving · {a ? `Tag #${a.tagNumber}` : 'Animal'}
                          </p>
                          <p className="font-mono text-xs text-stone-600 tabular-nums">
                            Due {formatIndianDate(p.expectedCalvingDate)}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
                    </button>
                  </li>
                );
              })}

              {upcomingVaccinations.slice(0, 3).map((v) => {
                const a = animalById.get(v.animalId);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'health', initialTab: 'vaccinations' })}
                      className="flex min-h-[52px] w-full items-center justify-between py-2.5 text-left hover:bg-stone-50/80"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Syringe className="h-4 w-4 shrink-0 text-[#1B4D3E]" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900">
                            {v.vaccineName} · {a ? `Tag #${a.tagNumber}` : 'Animal'}
                          </p>
                          <p className="font-mono text-xs text-stone-600 tabular-nums">
                            Due {formatIndianDate(v.dueDate)}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
                    </button>
                  </li>
                );
              })}

              {pendingTasks.slice(0, 4).map((task) => {
                const isOverdue = task.dueDate < today;
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'tasks' })}
                      className="flex min-h-[52px] w-full items-center justify-between py-2.5 text-left hover:bg-stone-50/80"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CheckSquare
                          className={`h-4 w-4 shrink-0 ${
                            isOverdue ? 'text-red-700' : 'text-stone-600'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900">
                            {task.title}
                          </p>
                          <p className="font-mono text-xs text-stone-600 tabular-nums">
                            {isOverdue ? 'Overdue' : 'Due'} {formatIndianDate(task.dueDate)} ·{' '}
                            {task.priority}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <ConflictReviewModal
        open={conflictsOpen}
        onClose={() => setConflictsOpen(false)}
      />
    </div>
  );
};
