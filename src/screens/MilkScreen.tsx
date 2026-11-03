import {
  Check,
  CheckCircle2,
  Droplets,
  Edit3,
  History,
  Moon,
  Plus,
  Sun,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import {
  calculateComprehensiveMilkAnalytics,
  calculateDailyMilkSummary,
  calculateMilkValue,
  formatDateTimeIndian,
  formatIndianDate,
  formatINR,
  getCurrentTimeHm,
  getTodayIso,
  isCombinedMilkRecord,
  validateMilkEntry,
} from '../domain/calculations';
import { AnimalStatus, Gender, MilkRecord, MilkSession } from '../types/models';

export const MilkScreen: React.FC<{
  initialTab?: 'combined' | 'production' | 'batch' | 'sales' | 'customers';
}> = ({ initialTab = 'combined' }) => {
  const {
    animals,
    settings,
    milkRecords,
    milkSales,
    customers,
    syncState,
    canReviewWorkerEntries,
    submitCombinedMilkSession,
    applyAuditedCorrection,
    markWorkerEntryVerified,
    upsertMilkRecord,
    saveBatchMilkRecords,
    deleteMilkRecord,
    upsertCustomer,
    recordMilkSale,
    updateMilkSalePaymentStatus,
    notify,
  } = useFarm();

  const [tab, setTab] = useState<'combined' | 'production' | 'batch' | 'sales' | 'customers'>(
    initialTab
  );
  const today = getTodayIso();

  const defaultOperatorName =
    syncState.currentUser?.displayName ||
    syncState.currentUser?.email?.split('@')[0] ||
    (syncState.role === 'ADMIN' ? 'Administrator' : syncState.role === 'MEMBER' ? 'Uncle' : 'Owner');

  // Shared Date Selector for Combined & Individual Milk
  const [selectedDate, setSelectedDate] = useState(today);

  // Combined Morning Session State
  const [cMorningLitres, setCMorningLitres] = useState('');
  const [cMorningTime, setCMorningTime] = useState(getCurrentTimeHm());
  const [cMorningOperator, setCMorningOperator] = useState(defaultOperatorName);
  const [cMorningFat, setCMorningFat] = useState('');
  const [cMorningSnf, setCMorningSnf] = useState('');
  const [cMorningNotes, setCMorningNotes] = useState('');

  // Combined Evening Session State
  const [cEveningLitres, setCEveningLitres] = useState('');
  const [cEveningTime, setCEveningTime] = useState(getCurrentTimeHm());
  const [cEveningOperator, setCEveningOperator] = useState(defaultOperatorName);
  const [cEveningFat, setCEveningFat] = useState('');
  const [cEveningSnf, setCEveningSnf] = useState('');
  const [cEveningNotes, setCEveningNotes] = useState('');

  // Audited Correction Modal State (Admin & Uncle)
  const [correctingRecord, setCorrectingRecord] = useState<MilkRecord | null>(null);
  const [corrLitres, setCorrLitres] = useState('');
  const [corrTime, setCorrTime] = useState('');
  const [corrFat, setCorrFat] = useState('');
  const [corrSnf, setCorrSnf] = useState('');
  const [corrNotes, setCorrNotes] = useState('');
  const [corrReason, setCorrReason] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Optional Individual Cow Entry State
  const [animalId, setAnimalId] = useState('');
  const [session, setSession] = useState<MilkSession>(MilkSession.MORNING);
  const [litres, setLitres] = useState('');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [quality, setQuality] = useState<'A' | 'B' | 'C'>('A');
  const [rate, setRate] = useState(String(settings.defaultMilkRatePerLitre));
  const [notes, setNotes] = useState('');

  // Fast Batch Entry State
  const [batchDate, setBatchDate] = useState(today);
  const [batchSession, setBatchSession] = useState<MilkSession>(MilkSession.MORNING);
  const [batchRate, setBatchRate] = useState(String(settings.defaultMilkRatePerLitre));
  const [includeAllFemales, setIncludeAllFemales] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<
    Record<string, { qty: string; fat: string; snf: string }>
  >({});

  // Milk Sale State
  const [saleDate, setSaleDate] = useState(today);
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleCustomerName, setSaleCustomerName] = useState('');
  const [saleSession, setSaleSession] = useState<MilkSession | 'BULK'>(MilkSession.MORNING);
  const [saleLitres, setSaleLitres] = useState('');
  const [salePrice, setSalePrice] = useState(String(settings.defaultMilkRatePerLitre));
  const [saleStatus, setSaleStatus] = useState<'PAID' | 'PENDING' | 'PARTIAL'>('PAID');
  const [saleNotes, setSaleNotes] = useState('');
  const [postSaleToIncome, setPostSaleToIncome] = useState(true);
  const [salesFilter, setSalesFilter] = useState<'ALL' | 'UNPAID'>('ALL');

  // Customer State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custRate, setCustRate] = useState(String(settings.defaultMilkRatePerLitre));

  const animalMap = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  const milkingAnimals = useMemo(() => {
    const females = animals.filter(
      (a) =>
        a.gender === Gender.FEMALE &&
        a.status !== AnimalStatus.SOLD &&
        a.status !== AnimalStatus.DECEASED
    );
    if (includeAllFemales) return females;
    return females.filter((a) => a.status === AnimalStatus.LACTATING);
  }, [animals, includeAllFemales]);

  // Comprehensive Farm-Wide Production Analytics (Today, Weekly, Monthly, Yearly, Avg Daily, M vs E, 14d Trend)
  const analytics = useMemo(
    () => calculateComprehensiveMilkAnalytics(milkRecords, today),
    [milkRecords, today]
  );

  const daySummary = useMemo(
    () => calculateDailyMilkSummary(milkRecords, selectedDate),
    [milkRecords, selectedDate]
  );

  const combinedMorningForSelected = useMemo(
    () =>
      milkRecords.find(
        (r) =>
          !r.isDeleted &&
          r.date === selectedDate &&
          r.session === MilkSession.MORNING &&
          isCombinedMilkRecord(r)
      ),
    [milkRecords, selectedDate]
  );

  const combinedEveningForSelected = useMemo(
    () =>
      milkRecords.find(
        (r) =>
          !r.isDeleted &&
          r.date === selectedDate &&
          r.session === MilkSession.EVENING &&
          isCombinedMilkRecord(r)
      ),
    [milkRecords, selectedDate]
  );

  const combinedHistory = useMemo(
    () =>
      milkRecords
        .filter((r) => !r.isDeleted && isCombinedMilkRecord(r))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [milkRecords]
  );

  const recordsForSelectedDate = useMemo(
    () =>
      milkRecords
        .filter((r) => !r.isDeleted && r.date === selectedDate)
        .sort((a, b) => b.createdAt - a.createdAt),
    [milkRecords, selectedDate]
  );

  const maxTrend14d = useMemo(
    () => Math.max(10, ...analytics.trend14d.map((p) => p.total)),
    [analytics.trend14d]
  );

  const unpaidSalesSummary = useMemo(() => {
    const unpaid = milkSales.filter((s) => s.paymentStatus !== 'PAID');
    return {
      count: unpaid.length,
      amount: unpaid.reduce((sum, s) => sum + s.totalAmount, 0),
    };
  }, [milkSales]);

  const handleSaveCombinedSession = async (
    targetSession: MilkSession.MORNING | MilkSession.EVENING,
    e: React.FormEvent
  ) => {
    e.preventDefault();
    const isMorning = targetSession === MilkSession.MORNING;
    const qty = Number(isMorning ? cMorningLitres : cEveningLitres);
    const fatVal = (isMorning ? cMorningFat : cEveningFat).trim();
    const snfVal = (isMorning ? cMorningSnf : cEveningSnf).trim();

    try {
      await submitCombinedMilkSession({
        date: selectedDate,
        session: targetSession,
        quantityLitres: qty,
        entryTime: (isMorning ? cMorningTime : cEveningTime) || getCurrentTimeHm(),
        workerName: (isMorning ? cMorningOperator : cEveningOperator).trim() || defaultOperatorName,
        fatPercentage: fatVal ? Number(fatVal) : undefined,
        snfPercentage: snfVal ? Number(snfVal) : undefined,
        notes: (isMorning ? cMorningNotes : cEveningNotes).trim() || undefined,
      });

      if (isMorning) {
        setCMorningLitres('');
        setCMorningFat('');
        setCMorningSnf('');
        setCMorningNotes('');
      } else {
        setCEveningLitres('');
        setCEveningFat('');
        setCEveningSnf('');
        setCEveningNotes('');
      }
      notify(`Saved combined ${targetSession.toLowerCase()} milk (${qty} L).`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save milk session.', 'error');
    }
  };

  const openCorrectionModal = (record: MilkRecord) => {
    setCorrectingRecord(record);
    setCorrLitres(String(record.quantityLitres));
    setCorrTime(record.entryTime || getCurrentTimeHm());
    setCorrFat(record.fatPercentage !== undefined ? String(record.fatPercentage) : '');
    setCorrSnf(record.snfPercentage !== undefined ? String(record.snfPercentage) : '');
    setCorrNotes(record.notes || '');
    setCorrReason('');
  };

  const handleSubmitAuditedCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingRecord) return;
    const nextQty = Number(corrLitres);
    const nextFat = corrFat.trim() ? Number(corrFat) : undefined;
    const nextSnf = corrSnf.trim() ? Number(corrSnf) : undefined;

    const err = validateMilkEntry({
      animalId: correctingRecord.animalId,
      date: correctingRecord.date,
      quantityLitres: nextQty,
      fatPercentage: nextFat,
      snfPercentage: nextSnf,
      isCombined: isCombinedMilkRecord(correctingRecord),
    });
    if (err) {
      notify(err, 'error');
      return;
    }

    const effRate = correctingRecord.pricePerLitre ?? settings.defaultMilkRatePerLitre;
    const summaryText = `Quantity ${correctingRecord.quantityLitres} L → ${nextQty} L${
      corrTime && corrTime !== correctingRecord.entryTime ? `, Time → ${corrTime}` : ''
    }`;

    try {
      await applyAuditedCorrection({
        storeName: 'milk_records',
        recordId: correctingRecord.id,
        updates: {
          quantityLitres: Math.round(nextQty * 100) / 100,
          entryTime: corrTime || correctingRecord.entryTime,
          fatPercentage: nextFat,
          snfPercentage: nextSnf,
          pricePerLitre: effRate,
          totalValue: calculateMilkValue(nextQty, effRate),
          notes: corrNotes.trim() || undefined,
        },
        summary: summaryText,
        reason: corrReason,
      });
      setCorrectingRecord(null);
      notify('Applied audited milk correction and preserved original history.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Correction failed.', 'error');
    }
  };

  const handleSaveSingleMilk = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(litres);
    const fatNum = fat.trim() ? Number(fat) : undefined;
    const snfNum = snf.trim() ? Number(snf) : undefined;
    const rateNum = rate.trim() ? Number(rate) : undefined;

    const err = validateMilkEntry({
      animalId,
      date: selectedDate,
      quantityLitres: qty,
      fatPercentage: fatNum,
      snfPercentage: snfNum,
      pricePerLitre: rateNum,
    });
    if (err) {
      notify(err, 'error');
      return;
    }

    await upsertMilkRecord({
      animalId,
      entryType: 'INDIVIDUAL',
      date: selectedDate,
      session,
      entryTime: getCurrentTimeHm(),
      quantityLitres: qty,
      fatPercentage: fatNum,
      snfPercentage: snfNum,
      qualityGrade: quality,
      pricePerLitre: rateNum,
      totalValue: calculateMilkValue(qty, rateNum),
      notes: notes.trim() || undefined,
    });
    setLitres('');
    setFat('');
    setSnf('');
    setNotes('');
    notify('Saved individual animal milk record.');
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = batchRate.trim() ? Number(batchRate) : undefined;
    const entries: Array<Parameters<typeof upsertMilkRecord>[0]> = [];

    for (const animal of milkingAnimals) {
      const row = batchDrafts[animal.id];
      if (!row || !row.qty.trim()) continue;
      const qty = Number(row.qty);
      const fatNum = row.fat.trim() ? Number(row.fat) : undefined;
      const snfNum = row.snf.trim() ? Number(row.snf) : undefined;
      const err = validateMilkEntry({
        animalId: animal.id,
        date: batchDate,
        quantityLitres: qty,
        fatPercentage: fatNum,
        snfPercentage: snfNum,
        pricePerLitre: rateNum,
      });
      if (err) {
        notify(`Tag #${animal.tagNumber}: ${err}`, 'error');
        return;
      }
      entries.push({
        animalId: animal.id,
        entryType: 'INDIVIDUAL',
        date: batchDate,
        session: batchSession,
        quantityLitres: qty,
        fatPercentage: fatNum,
        snfPercentage: snfNum,
        qualityGrade: 'A',
        pricePerLitre: rateNum,
        totalValue: calculateMilkValue(qty, rateNum),
      });
    }

    if (entries.length === 0) {
      notify('Enter milk quantity for at least one animal.', 'error');
      return;
    }

    const count = await saveBatchMilkRecords(entries);
    setBatchDrafts({});
    setSelectedDate(batchDate);
    setTab('production');
    notify(`Saved ${count} individual milk records for ${batchSession}.`);
  };

  const handleSaveMilkSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(saleLitres);
    const prc = Number(salePrice);
    const matchedCust = customers.find((c) => c.id === saleCustomerId);
    const buyerName = matchedCust ? matchedCust.name : saleCustomerName.trim();

    if (!buyerName) {
      notify('Select a customer or type buyer name.', 'error');
      return;
    }
    if (!qty || qty <= 0) {
      notify('Sale quantity must be greater than 0 L.', 'error');
      return;
    }
    if (Number.isNaN(prc) || prc < 0) {
      notify('Price per litre cannot be negative.', 'error');
      return;
    }

    const totalAmount = Math.round(qty * prc * 100) / 100;
    await recordMilkSale(
      {
        customerId: matchedCust?.id,
        customerName: buyerName,
        date: saleDate,
        session: saleSession,
        quantityLitres: qty,
        pricePerLitre: prc,
        totalAmount,
        paymentStatus: saleStatus,
        notes: saleNotes.trim() || undefined,
      },
      postSaleToIncome
    );

    setSaleLitres('');
    setSaleNotes('');
    notify(`Recorded milk sale of ${qty} L (${formatINR(totalAmount)}).`);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      notify('Customer name is required.', 'error');
      return;
    }
    const defaultPrice = Number(custRate) || settings.defaultMilkRatePerLitre;
    await upsertCustomer({
      name: custName.trim(),
      phone: custPhone.trim(),
      address: custAddress.trim() || undefined,
      defaultPricePerLitre: defaultPrice,
      isActive: true,
    });
    setCustName('');
    setCustPhone('');
    setCustAddress('');
    notify('Added milk buyer to Customers directory.');
  };

  const filteredSales = useMemo(() => {
    const sorted = [...milkSales].sort((a, b) => b.date.localeCompare(a.date));
    return salesFilter === 'UNPAID'
      ? sorted.filter((s) => s.paymentStatus !== 'PAID')
      : sorted;
  }, [milkSales, salesFilter]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">Milk Collection &amp; Sales</h1>
          <p className="text-sm text-stone-600">
            Combined farm-wide Morning &amp; Evening collection (`Daily = Morning + Evening`), audited worker entries, and customer milk sales.
          </p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1">
          {(
            [
              { id: 'combined', label: 'Combined Collection' },
              { id: 'production', label: 'Individual Cow' },
              { id: 'batch', label: 'Fast Batch' },
              { id: 'sales', label: 'Milk Sales' },
              { id: 'customers', label: 'Customers' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[38px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-[#1B4D3E] text-white'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comprehensive Farm-Wide Production Analytics Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-stone-200/90 bg-white p-3.5">
          <span className="text-[11px] font-medium text-stone-500">
            {selectedDate === today ? 'Today Combined' : formatIndianDate(selectedDate)}
          </span>
          <p className="mt-1 font-mono text-xl font-extrabold text-[#1B4D3E] tabular-nums">
            {daySummary.total.toFixed(1)} L
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-stone-500 tabular-nums">
            M {daySummary.morning.toFixed(1)} + E {daySummary.evening.toFixed(1)}
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-white p-3.5">
          <span className="text-[11px] font-medium text-stone-500">Weekly (7 Days)</span>
          <p className="mt-1 font-mono text-xl font-bold text-stone-900 tabular-nums">
            {analytics.weeklyTotal.toFixed(1)} L
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Rolling 7-day yield</p>
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-white p-3.5">
          <span className="text-[11px] font-medium text-stone-500">This Month</span>
          <p className="mt-1 font-mono text-xl font-bold text-stone-900 tabular-nums">
            {analytics.monthlyTotal.toFixed(1)} L
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-stone-500 tabular-nums">
            Avg {analytics.averageDaily30d.toFixed(1)} L/d
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-white p-3.5">
          <span className="text-[11px] font-medium text-stone-500">This Year</span>
          <p className="mt-1 font-mono text-xl font-bold text-stone-900 tabular-nums">
            {analytics.yearlyTotal.toFixed(1)} L
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Annual farm yield</p>
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-white p-3.5">
          <span className="text-[11px] font-medium text-stone-500">M vs E Split (30d)</span>
          <p className="mt-1 font-mono text-xl font-bold text-stone-900 tabular-nums">
            {analytics.morningSharePct}% / {analytics.eveningSharePct}%
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-stone-500 tabular-nums">
            M {analytics.morningTotal30d.toFixed(0)}L · E {analytics.eveningTotal30d.toFixed(0)}L
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-white p-3.5">
          <span className="text-[11px] font-medium text-stone-500">Milk Sales</span>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
            {formatINR(milkSales.reduce((s, x) => s + x.totalAmount, 0))}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-amber-800 tabular-nums">
            Due: {formatINR(unpaidSalesSummary.amount)}
          </p>
        </div>
      </div>

      {/* TAB 0: COMBINED FARM-WIDE COLLECTION (PRIMARY WORKFLOW) */}
      {tab === 'combined' && (
        <div className="space-y-5">
          {/* Date Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/90 bg-white p-4">
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                Combined Farm Milk Sessions — {formatIndianDate(selectedDate)}
              </h2>
              <p className="text-xs text-stone-600">
                Record whole-farm Morning and Evening totals independently without requiring cow-by-cow entry.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="min-h-[42px] rounded-xl border border-stone-300 px-3 font-mono text-xs tabular-nums"
              />
              {selectedDate !== today && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(today)}
                  className="min-h-[42px] rounded-xl border border-stone-300 bg-stone-50 px-3 text-xs font-semibold text-stone-800 hover:bg-stone-100"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Separate Morning & Evening Session Cards */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Morning Collection Card */}
            <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-[#1B4D3E]" />
                  <h3 className="text-base font-bold text-stone-900">Morning Milk Collection</h3>
                </div>
                <span className="font-mono text-xs text-stone-500 tabular-nums">
                  {formatIndianDate(selectedDate)}
                </span>
              </div>

              {combinedMorningForSelected ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between rounded-xl border border-[#1B4D3E]/25 bg-[#1B4D3E]/5 p-4">
                    <div>
                      <span className="text-xs font-semibold text-[#1B4D3E]">
                        Recorded Morning Total
                      </span>
                      <p className="mt-0.5 font-mono text-3xl font-extrabold text-[#1B4D3E] tabular-nums">
                        {combinedMorningForSelected.quantityLitres.toFixed(1)} L
                      </p>
                      <p className="mt-1 font-mono text-xs text-stone-600 tabular-nums">
                        Time: {combinedMorningForSelected.entryTime || '—'} · By{' '}
                        {combinedMorningForSelected.workerName ||
                          combinedMorningForSelected.createdByEmail ||
                          'Team'}
                        {combinedMorningForSelected.createdByRole
                          ? ` (${combinedMorningForSelected.createdByRole})`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <span className="font-semibold text-stone-800">
                        {combinedMorningForSelected.reviewStatus?.replace(/_/g, ' ') || 'VERIFIED'}
                      </span>
                      {combinedMorningForSelected.totalValue !== undefined && (
                        <p className="mt-1 font-mono text-stone-600 tabular-nums">
                          {formatINR(combinedMorningForSelected.totalValue)}
                        </p>
                      )}
                    </div>
                  </div>

                  {combinedMorningForSelected.notes && (
                    <p className="text-xs text-stone-600">
                      Notes: {combinedMorningForSelected.notes}
                    </p>
                  )}

                  {canReviewWorkerEntries && (
                    <div className="flex flex-wrap items-center gap-2">
                      {combinedMorningForSelected.reviewStatus === 'PENDING_REVIEW' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await markWorkerEntryVerified(
                              'milk_records',
                              combinedMorningForSelected.id
                            );
                            notify('Marked Morning milk entry as Verified.', 'success');
                          }}
                          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white hover:bg-[#153D31]"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Verify Worker Entry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openCorrectionModal(combinedMorningForSelected)}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-[#1B4D3E]" />
                        Correct Entry (Audited)
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={(e) => handleSaveCombinedSession(MilkSession.MORNING, e)}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700">
                        Total Morning Milk (L) *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        required
                        value={cMorningLitres}
                        onChange={(e) => setCMorningLitres(e.target.value)}
                        placeholder="e.g. 68.5"
                        className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-base font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700">
                        Entry Time *
                      </label>
                      <input
                        type="time"
                        required
                        value={cMorningTime}
                        onChange={(e) => setCMorningTime(e.target.value)}
                        className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700">
                        Operator Name
                      </label>
                      <input
                        type="text"
                        value={cMorningOperator}
                        onChange={(e) => setCMorningOperator(e.target.value)}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700">Fat %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={cMorningFat}
                          onChange={(e) => setCMorningFat(e.target.value)}
                          placeholder="—"
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-2.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-stone-700">SNF %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={cMorningSnf}
                          onChange={(e) => setCMorningSnf(e.target.value)}
                          placeholder="—"
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-2.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={cMorningNotes}
                    onChange={(e) => setCMorningNotes(e.target.value)}
                    placeholder="Optional morning collection notes..."
                    className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
                  >
                    <Plus className="h-4 w-4" />
                    Save Morning Milk Collection
                  </button>
                </form>
              )}
            </div>

            {/* Evening Collection Card */}
            <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <Moon className="h-5 w-5 text-[#1B4D3E]" />
                  <h3 className="text-base font-bold text-stone-900">Evening Milk Collection</h3>
                </div>
                <span className="font-mono text-xs text-stone-500 tabular-nums">
                  {formatIndianDate(selectedDate)}
                </span>
              </div>

              {combinedEveningForSelected ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between rounded-xl border border-[#1B4D3E]/25 bg-[#1B4D3E]/5 p-4">
                    <div>
                      <span className="text-xs font-semibold text-[#1B4D3E]">
                        Recorded Evening Total
                      </span>
                      <p className="mt-0.5 font-mono text-3xl font-extrabold text-[#1B4D3E] tabular-nums">
                        {combinedEveningForSelected.quantityLitres.toFixed(1)} L
                      </p>
                      <p className="mt-1 font-mono text-xs text-stone-600 tabular-nums">
                        Time: {combinedEveningForSelected.entryTime || '—'} · By{' '}
                        {combinedEveningForSelected.workerName ||
                          combinedEveningForSelected.createdByEmail ||
                          'Team'}
                        {combinedEveningForSelected.createdByRole
                          ? ` (${combinedEveningForSelected.createdByRole})`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <span className="font-semibold text-stone-800">
                        {combinedEveningForSelected.reviewStatus?.replace(/_/g, ' ') || 'VERIFIED'}
                      </span>
                      {combinedEveningForSelected.totalValue !== undefined && (
                        <p className="mt-1 font-mono text-stone-600 tabular-nums">
                          {formatINR(combinedEveningForSelected.totalValue)}
                        </p>
                      )}
                    </div>
                  </div>

                  {combinedEveningForSelected.notes && (
                    <p className="text-xs text-stone-600">
                      Notes: {combinedEveningForSelected.notes}
                    </p>
                  )}

                  {canReviewWorkerEntries && (
                    <div className="flex flex-wrap items-center gap-2">
                      {combinedEveningForSelected.reviewStatus === 'PENDING_REVIEW' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await markWorkerEntryVerified(
                              'milk_records',
                              combinedEveningForSelected.id
                            );
                            notify('Marked Evening milk entry as Verified.', 'success');
                          }}
                          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white hover:bg-[#153D31]"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Verify Worker Entry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openCorrectionModal(combinedEveningForSelected)}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-[#1B4D3E]" />
                        Correct Entry (Audited)
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={(e) => handleSaveCombinedSession(MilkSession.EVENING, e)}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700">
                        Total Evening Milk (L) *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        required
                        value={cEveningLitres}
                        onChange={(e) => setCEveningLitres(e.target.value)}
                        placeholder="e.g. 54.0"
                        className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-base font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700">
                        Entry Time *
                      </label>
                      <input
                        type="time"
                        required
                        value={cEveningTime}
                        onChange={(e) => setCEveningTime(e.target.value)}
                        className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700">
                        Operator Name
                      </label>
                      <input
                        type="text"
                        value={cEveningOperator}
                        onChange={(e) => setCEveningOperator(e.target.value)}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700">Fat %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={cEveningFat}
                          onChange={(e) => setCEveningFat(e.target.value)}
                          placeholder="—"
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-2.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-stone-700">SNF %</label>
                        <input
                          type="number"
                          step="0.1"
                          value={cEveningSnf}
                          onChange={(e) => setCEveningSnf(e.target.value)}
                          placeholder="—"
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-2.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={cEveningNotes}
                    onChange={(e) => setCEveningNotes(e.target.value)}
                    placeholder="Optional evening collection notes..."
                    className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
                  >
                    <Plus className="h-4 w-4" />
                    Save Evening Milk Collection
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* 14-Day Farm Production Trend & Morning-vs-Evening Comparison */}
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  14-Day Farm Milk Trend &amp; Session Comparison
                </h3>
                <p className="text-xs text-stone-500">
                  30-Day Morning ({analytics.morningTotal30d.toFixed(1)} L · {analytics.morningSharePct}%) vs Evening ({analytics.eveningTotal30d.toFixed(1)} L · {analytics.eveningSharePct}%)
                </p>
              </div>
              <span className="font-mono text-xs font-semibold text-[#1B4D3E] tabular-nums">
                30d Avg: {analytics.averageDaily30d.toFixed(1)} L/day
              </span>
            </div>

            {/* Morning vs Evening Horizontal Split Bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-md bg-stone-100">
              <div
                style={{ width: `${analytics.morningSharePct}%` }}
                className="bg-[#1B4D3E] transition-all"
                title={`Morning ${analytics.morningSharePct}%`}
              />
              <div
                style={{ width: `${analytics.eveningSharePct}%` }}
                className="bg-amber-600/80 transition-all"
                title={`Evening ${analytics.eveningSharePct}%`}
              />
            </div>

            {milkRecords.length > 0 && (
              <div className="grid grid-cols-7 gap-2 pt-3 sm:grid-cols-14 h-32 items-end">
                {analytics.trend14d.map((pt) => {
                  const pct = Math.max(6, Math.round((pt.total / maxTrend14d) * 100));
                  const [, mm, dd] = pt.date.split('-');
                  const isSel = pt.date === selectedDate;
                  return (
                    <div
                      key={pt.date}
                      className="flex h-full flex-col items-center justify-end gap-1"
                    >
                      <span className="font-mono text-[10px] text-stone-600 tabular-nums">
                        {pt.total > 0 ? pt.total.toFixed(0) : '0'}
                      </span>
                      <div className="flex w-full flex-1 items-end justify-center">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full max-w-[24px] rounded-t-md ${
                            isSel ? 'bg-[#1B4D3E]' : 'bg-[#1B4D3E]/35'
                          }`}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-stone-500 tabular-nums">
                        {dd}/{mm}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Combined Collection Ledger & Audit Trail */}
          <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
            <h3 className="text-base font-bold text-stone-900">
              Combined Milk Ledger &amp; Correction Audit History ({combinedHistory.length})
            </h3>
            {combinedHistory.length === 0 ? (
              <p className="mt-4 text-sm text-stone-500">
                No combined farm-wide milk sessions logged yet. Submit Morning or Evening milk above.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 text-xs text-stone-500">
                    <tr>
                      <th className="py-2 pr-3">Date &amp; Time</th>
                      <th className="py-2 pr-3">Session</th>
                      <th className="py-2 pr-3">Submitted By</th>
                      <th className="py-2 pr-3 text-right">Litres</th>
                      <th className="py-2 pr-3">Review / Audit</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-xs">
                    {combinedHistory.slice(0, 30).map((r) => {
                      const hasCorrections =
                        r.correctionHistory && r.correctionHistory.length > 0;
                      const isExpanded = expandedHistoryId === r.id;
                      return (
                        <React.Fragment key={r.id}>
                          <tr>
                            <td className="py-3 pr-3 font-mono tabular-nums">
                              {formatIndianDate(r.date)}
                              {r.entryTime ? ` · ${r.entryTime}` : ''}
                            </td>
                            <td className="py-3 pr-3 font-semibold text-stone-900">
                              {r.session}
                            </td>
                            <td className="py-3 pr-3 text-stone-700">
                              {r.workerName || r.createdByEmail || 'Local'}
                              {r.createdByRole ? ` (${r.createdByRole})` : ''}
                            </td>
                            <td className="py-3 pr-3 text-right font-mono font-bold text-[#1B4D3E] tabular-nums">
                              {r.quantityLitres.toFixed(1)} L
                            </td>
                            <td className="py-3 pr-3">
                              <span
                                className={`font-semibold ${
                                  r.reviewStatus === 'PENDING_REVIEW'
                                    ? 'text-amber-800'
                                    : 'text-[#1B4D3E]'
                                }`}
                              >
                                {(r.reviewStatus || 'VERIFIED').replace(/_/g, ' ')}
                              </span>
                              {hasCorrections && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedHistoryId(isExpanded ? null : r.id)
                                  }
                                  className="ml-2 inline-flex items-center gap-1 font-semibold text-stone-600 underline hover:text-stone-900"
                                >
                                  <History className="h-3 w-3" />
                                  {r.correctionHistory!.length} edit(s)
                                </button>
                              )}
                            </td>
                            <td className="py-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {canReviewWorkerEntries &&
                                  r.reviewStatus === 'PENDING_REVIEW' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        markWorkerEntryVerified('milk_records', r.id)
                                      }
                                      className="min-h-[34px] rounded-lg border border-[#1B4D3E]/30 px-2.5 font-semibold text-[#1B4D3E] hover:bg-[#1B4D3E]/10"
                                    >
                                      Verify
                                    </button>
                                  )}
                                {canReviewWorkerEntries && (
                                  <button
                                    type="button"
                                    onClick={() => openCorrectionModal(r)}
                                    className="min-h-[34px] rounded-lg border border-stone-300 px-2.5 font-semibold text-stone-800 hover:bg-stone-50"
                                  >
                                    Correct
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {hasCorrections && isExpanded && (
                            <tr className="bg-stone-50/80">
                              <td colSpan={6} className="px-3 py-2.5">
                                <p className="text-[11px] font-bold text-stone-700">
                                  Correction Audit Log:
                                </p>
                                <ul className="mt-1 space-y-1 text-[11px] text-stone-600">
                                  {r.correctionHistory!.map((entry, idx) => (
                                    <li key={idx} className="font-mono tabular-nums">
                                      {formatDateTimeIndian(entry.timestamp)} · {entry.byEmail} (
                                      {entry.byRole}): <strong>{entry.summary}</strong> — Reason:{' '}
                                      {entry.reason}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: OPTIONAL INDIVIDUAL COW PRODUCTION */}
      {tab === 'production' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveSingleMilk}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">
                Record Individual Cow Milk (Optional)
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-stone-700">Animal *</label>
                <select
                  required
                  value={animalId}
                  onChange={(e) => setAnimalId(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
                >
                  <option value="">— Select Female Animal —</option>
                  {animals
                    .filter((a) => a.gender === Gender.FEMALE)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''} · {a.status}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Date *</label>
                <input
                  type="date"
                  required
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Session *</label>
                <select
                  value={session}
                  onChange={(e) => setSession(e.target.value as MilkSession)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value={MilkSession.MORNING}>Morning</option>
                  {settings.enableAfternoonSession && (
                    <option value={MilkSession.AFTERNOON}>Afternoon</option>
                  )}
                  <option value={MilkSession.EVENING}>Evening</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Quantity (Litres) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={litres}
                  onChange={(e) => setLitres(e.target.value)}
                  placeholder="e.g. 7.5"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Price / Litre (₹)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Fat %</label>
                <input
                  type="number"
                  step="0.1"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  placeholder="e.g. 4.2"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">SNF %</label>
                <input
                  type="number"
                  step="0.1"
                  value={snf}
                  onChange={(e) => setSnf(e.target.value)}
                  placeholder="e.g. 8.5"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Quality</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as 'A' | 'B' | 'C')}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="A">Grade A (Clean/Normal)</option>
                  <option value="B">Grade B (Low Solids)</option>
                  <option value="C">Grade C (Colostrum/Hold)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Calculated Value
                </label>
                <div className="mt-1 flex min-h-[46px] items-center rounded-xl border border-stone-200 bg-stone-50 px-3 font-mono text-sm font-bold text-[#1B4D3E] tabular-nums">
                  {formatINR(calculateMilkValue(Number(litres) || 0, Number(rate)))}
                </div>
              </div>
            </div>

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              <Plus className="h-4 w-4" />
              Save Milk Entry
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-stone-900">
                Entries for {formatIndianDate(selectedDate)}
              </h2>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="min-h-[38px] rounded-lg border border-stone-300 px-2.5 font-mono text-xs"
              />
            </div>

            {recordsForSelectedDate.length === 0 ? (
              <div className="mt-8 text-center py-8">
                <p className="text-sm text-stone-500">
                  No milk entries logged on {formatIndianDate(selectedDate)}.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('combined')}
                  className="mt-3 min-h-[40px] rounded-xl border border-stone-300 px-4 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                >
                  Open Combined Farm Collection
                </button>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 text-xs text-stone-500">
                    <tr>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Session</th>
                      <th className="py-2 pr-3 text-right">Litres</th>
                      <th className="py-2 pr-3 text-right">Fat / SNF</th>
                      <th className="py-2 pr-3 text-right">Value</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-mono text-xs tabular-nums">
                    {recordsForSelectedDate.map((r) => {
                      const a = animalMap.get(r.animalId);
                      const label = isCombinedMilkRecord(r)
                        ? `Combined Farm (${r.workerName || 'Team'})`
                        : a
                        ? `#${a.tagNumber}${a.name ? ` (${a.name})` : ''}`
                        : 'Animal';
                      return (
                        <tr key={r.id}>
                          <td className="py-2.5 pr-3 font-sans font-semibold text-stone-900">
                            {label}
                          </td>
                          <td className="py-2.5 pr-3 font-sans">{r.session}</td>
                          <td className="py-2.5 pr-3 text-right font-bold text-[#1B4D3E]">
                            {r.quantityLitres.toFixed(1)} L
                          </td>
                          <td className="py-2.5 pr-3 text-right text-stone-600">
                            {r.fatPercentage ?? '—'} / {r.snfPercentage ?? '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right">{formatINR(r.totalValue)}</td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => deleteMilkRecord(r.id)}
                              aria-label="Delete milk record"
                              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: FAST MULTI-ANIMAL BATCH ENTRY */}
      {tab === 'batch' && (
        <form
          onSubmit={handleSaveBatch}
          className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-stone-900">Fast Herd Batch Milk Sheet</h2>
              <p className="text-xs text-stone-500">
                Optional cow-by-cow sheet when evaluating individual lactation performance.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-stone-700">
              <input
                type="checkbox"
                checked={includeAllFemales}
                onChange={(e) => setIncludeAllFemales(e.target.checked)}
                className="h-4 w-4 accent-[#1B4D3E]"
              />
              Show all female cattle (not only Lactating)
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700">Date</label>
              <input
                type="date"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Session</label>
              <select
                value={batchSession}
                onChange={(e) => setBatchSession(e.target.value as MilkSession)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                <option value={MilkSession.MORNING}>Morning</option>
                {settings.enableAfternoonSession && (
                  <option value={MilkSession.AFTERNOON}>Afternoon</option>
                )}
                <option value={MilkSession.EVENING}>Evening</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Default Price / Litre (₹)
              </label>
              <input
                type="number"
                step="0.5"
                value={batchRate}
                onChange={(e) => setBatchRate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
            </div>
          </div>

          {milkingAnimals.length === 0 ? (
            <div className="rounded-xl bg-stone-50 p-6 text-center text-sm text-stone-600">
              No lactating animals found. Register animals with status LACTATING or tick &ldquo;Show all female cattle&rdquo; above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-xs text-stone-500">
                  <tr>
                    <th className="py-2 pr-4">Animal</th>
                    <th className="py-2 pr-3 w-32">Litres (L)</th>
                    <th className="py-2 pr-3 w-28">Fat %</th>
                    <th className="py-2 w-28">SNF %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {milkingAnimals.map((a) => {
                    const row = batchDrafts[a.id] || { qty: '', fat: '', snf: '' };
                    return (
                      <tr key={a.id}>
                        <td className="py-2.5 pr-4">
                          <p className="font-mono font-bold text-stone-900">Tag #{a.tagNumber}</p>
                          <p className="text-xs text-stone-500">
                            {a.name ? `${a.name} · ` : ''}
                            {a.species} · {a.status}
                          </p>
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={row.qty}
                            onChange={(e) =>
                              setBatchDrafts((prev) => ({
                                ...prev,
                                [a.id]: { ...row, qty: e.target.value },
                              }))
                            }
                            placeholder="0.0"
                            className="min-h-[42px] w-full rounded-lg border border-stone-300 px-2.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            step="0.1"
                            value={row.fat}
                            onChange={(e) =>
                              setBatchDrafts((prev) => ({
                                ...prev,
                                [a.id]: { ...row, fat: e.target.value },
                              }))
                            }
                            placeholder="—"
                            className="min-h-[42px] w-full rounded-lg border border-stone-300 px-2.5 font-mono text-sm"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            step="0.1"
                            value={row.snf}
                            onChange={(e) =>
                              setBatchDrafts((prev) => ({
                                ...prev,
                                [a.id]: { ...row, snf: e.target.value },
                              }))
                            }
                            placeholder="—"
                            className="min-h-[42px] w-full rounded-lg border border-stone-300 px-2.5 font-mono text-sm"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {milkingAnimals.length > 0 && (
            <div className="flex items-center justify-between border-t border-stone-100 pt-4">
              <span className="font-mono text-sm font-bold text-stone-800 tabular-nums">
                Batch Total:{' '}
                {Object.values(batchDrafts)
                  .reduce<number>(
                    (sum, item) => sum + (Number((item as { qty: string }).qty) || 0),
                    0
                  )
                  .toFixed(1)}{' '}
                L
              </span>
              <button
                type="submit"
                className="flex min-h-[48px] items-center gap-2 rounded-xl bg-[#1B4D3E] px-6 text-sm font-semibold text-white hover:bg-[#153D31]"
              >
                <Check className="h-4 w-4" />
                Save Batch Records
              </button>
            </div>
          )}
        </form>
      )}

      {/* TAB 3: MILK SALES & CUSTOMER PAYMENTS (FULL ACCESS FOR ADMIN & UNCLE) */}
      {tab === 'sales' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveMilkSale}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <h2 className="text-base font-bold text-stone-900">Record Milk Sale</h2>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Select Registered Customer
              </label>
              <select
                value={saleCustomerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSaleCustomerId(id);
                  const found = customers.find((c) => c.id === id);
                  if (found) {
                    setSaleCustomerName(found.name);
                    setSalePrice(String(found.defaultPricePerLitre));
                  }
                }}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Walk-in / Enter Buyer Name Below —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({formatINR(c.defaultPricePerLitre)}/L)
                  </option>
                ))}
              </select>
            </div>

            {!saleCustomerId && (
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Buyer / Dairy Name *
                </label>
                <input
                  type="text"
                  required
                  value={saleCustomerName}
                  onChange={(e) => setSaleCustomerName(e.target.value)}
                  placeholder="e.g. Gokul Cooperative Sangh"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Date *</label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Session</label>
                <select
                  value={saleSession}
                  onChange={(e) => setSaleSession(e.target.value as MilkSession | 'BULK')}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value={MilkSession.MORNING}>Morning</option>
                  <option value={MilkSession.EVENING}>Evening</option>
                  <option value="BULK">Full Day Bulk</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Quantity Sold (L) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={saleLitres}
                  onChange={(e) => setSaleLitres(e.target.value)}
                  placeholder="e.g. 24.0"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Rate (₹/L) *</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Payment Status
                </label>
                <select
                  value={saleStatus}
                  onChange={(e) =>
                    setSaleStatus(e.target.value as 'PAID' | 'PENDING' | 'PARTIAL')
                  }
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending (Credit)</option>
                  <option value="PARTIAL">Partial</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Total Sale</label>
                <div className="mt-1 flex min-h-[46px] items-center rounded-xl border border-stone-200 bg-stone-50 px-3 font-mono text-sm font-bold text-emerald-700 tabular-nums">
                  {formatINR((Number(saleLitres) || 0) * (Number(salePrice) || 0))}
                </div>
              </div>
            </div>

            {saleStatus === 'PAID' && (
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={postSaleToIncome}
                  onChange={(e) => setPostSaleToIncome(e.target.checked)}
                  className="h-4 w-4 accent-[#1B4D3E]"
                />
                Automatically record in Farm Income ledger
              </label>
            )}

            <input
              type="text"
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              placeholder="Receipt number or fat bonus notes..."
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Record Milk Sale
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Milk Sales &amp; Customer Settlements
                </h2>
                <p className="text-xs text-stone-500">
                  Outstanding receivables:{' '}
                  <strong className="font-mono text-amber-800 tabular-nums">
                    {formatINR(unpaidSalesSummary.amount)}
                  </strong>{' '}
                  across {unpaidSalesSummary.count} unpaid sale(s)
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1">
                <button
                  type="button"
                  onClick={() => setSalesFilter('ALL')}
                  className={`min-h-[32px] rounded-md px-2.5 text-xs font-semibold ${
                    salesFilter === 'ALL'
                      ? 'bg-white text-stone-900 shadow-2xs'
                      : 'text-stone-600'
                  }`}
                >
                  All ({milkSales.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSalesFilter('UNPAID')}
                  className={`min-h-[32px] rounded-md px-2.5 text-xs font-semibold ${
                    salesFilter === 'UNPAID'
                      ? 'bg-white text-amber-900 shadow-2xs'
                      : 'text-stone-600'
                  }`}
                >
                  Unpaid ({unpaidSalesSummary.count})
                </button>
              </div>
            </div>

            {filteredSales.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">
                {salesFilter === 'UNPAID'
                  ? 'All customer milk sales are settled!'
                  : 'No milk sales recorded yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 text-xs text-stone-500">
                    <tr>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Buyer</th>
                      <th className="py-2 pr-3 text-right">Litres</th>
                      <th className="py-2 pr-3 text-right">Total</th>
                      <th className="py-2 pr-3 text-right">Status</th>
                      <th className="py-2 text-right">Settle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-mono text-xs tabular-nums">
                    {filteredSales.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-3">{formatIndianDate(s.date)}</td>
                        <td className="py-2.5 pr-3 font-sans font-semibold text-stone-900">
                          {s.customerName}
                        </td>
                        <td className="py-2.5 pr-3 text-right">{s.quantityLitres.toFixed(1)} L</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-emerald-700">
                          {formatINR(s.totalAmount)}
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right font-sans font-semibold ${
                            s.paymentStatus === 'PAID' ? 'text-[#1B4D3E]' : 'text-amber-800'
                          }`}
                        >
                          {s.paymentStatus}
                        </td>
                        <td className="py-2 text-right font-sans">
                          {s.paymentStatus !== 'PAID' ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await updateMilkSalePaymentStatus(s.id, 'PAID', true);
                                notify(
                                  `Marked ${s.customerName} (${formatINR(s.totalAmount)}) as Paid and posted to Income.`,
                                  'success'
                                );
                              }}
                              className="min-h-[34px] rounded-lg bg-[#1B4D3E] px-2.5 text-xs font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
                            >
                              Mark Paid
                            </button>
                          ) : (
                            <span className="text-stone-400">Settled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CUSTOMERS */}
      {tab === 'customers' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveCustomer}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">Add Milk Buyer / Customer</h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Customer / Dairy Name *
              </label>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="e.g. Patil Hotel / Sharma Family"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Phone</label>
                <input
                  type="tel"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  placeholder="98XXXXXXXX"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Default Rate (₹/L)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={custRate}
                  onChange={(e) => setCustRate(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Address</label>
              <input
                type="text"
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="Delivery route or address"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
            </div>

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Save Customer
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">
              Registered Customers ({customers.length})
            </h2>
            {customers.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">
                No customers added yet. Add regular households, hotels, or dairy collection centers.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {customers.map((c) => {
                  const buyerSales = milkSales.filter((s) => s.customerId === c.id);
                  const pendingDue = buyerSales
                    .filter((s) => s.paymentStatus !== 'PAID')
                    .reduce((sum, s) => sum + s.totalAmount, 0);
                  return (
                    <li key={c.id} className="flex items-center justify-between py-3.5 text-sm">
                      <div>
                        <p className="font-semibold text-stone-900">{c.name}</p>
                        <p className="text-xs text-stone-500">
                          {c.phone || 'No phone'}
                          {c.address ? ` · ${c.address}` : ''}
                        </p>
                      </div>
                      <div className="text-right font-mono text-xs tabular-nums">
                        <p className="font-bold text-stone-900">
                          {formatINR(c.defaultPricePerLitre)}/L
                        </p>
                        {pendingDue > 0 && (
                          <p className="font-semibold text-amber-800">
                            Due: {formatINR(pendingDue)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Audited Milk Correction Modal */}
      {correctingRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Audited Milk Record Correction"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4"
        >
          <form
            onSubmit={handleSubmitAuditedCorrection}
            className="w-full max-w-md space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Audited Milk Correction ({correctingRecord.session})
                </h2>
                <p className="text-xs text-stone-600">
                  Date {formatIndianDate(correctingRecord.date)} · Original submitted by{' '}
                  {correctingRecord.workerName || correctingRecord.createdByEmail || 'Team'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectingRecord(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Corrected Litres (L) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={corrLitres}
                  onChange={(e) => setCorrLitres(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Entry Time</label>
                <input
                  type="time"
                  value={corrTime}
                  onChange={(e) => setCorrTime(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Fat %</label>
                <input
                  type="number"
                  step="0.1"
                  value={corrFat}
                  onChange={(e) => setCorrFat(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">SNF %</label>
                <input
                  type="number"
                  step="0.1"
                  value={corrSnf}
                  onChange={(e) => setCorrSnf(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Notes</label>
              <input
                type="text"
                value={corrNotes}
                onChange={(e) => setCorrNotes(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Reason for Correction (Saved in Audit Trail) *
              </label>
              <input
                type="text"
                required
                value={corrReason}
                onChange={(e) => setCorrReason(e.target.value)}
                placeholder="e.g. Dairy society slip weighed 69.2 L instead of 68 L"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCorrectingRecord(null)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-4 text-xs font-semibold text-stone-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-[#1B4D3E] px-5 text-xs font-semibold text-white hover:bg-[#153D31]"
              >
                Save Audited Correction
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
