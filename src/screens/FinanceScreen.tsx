import {
  ArrowLeft,
  ArrowRight,
  Edit3,
  FileSpreadsheet,
  IndianRupee,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { downloadCsvFile } from '../data/db';
import {
  addDaysIso,
  calculateProfitSummary,
  formatIndianDate,
  formatINR,
  getTodayIso,
} from '../domain/calculations';
import {
  ExpenseCategory,
  ExpenseRecord,
  IncomeCategory,
  IncomeRecord,
} from '../types/models';

const INCOME_CATEGORIES: IncomeCategory[] = [
  'MILK_SALES',
  'ANIMAL_SALES',
  'CALF_SALES',
  'MANURE',
  'OTHER',
];

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'FEED',
  'MEDICINES',
  'VETERINARY',
  'BREEDING',
  'LABOUR',
  'EQUIPMENT',
  'ANIMAL_PURCHASE',
  'MAINTENANCE',
  'OTHER',
];

export const FinanceScreen: React.FC<{
  initialTab?: 'summary' | 'income' | 'expenses' | 'staff';
}> = ({ initialTab = 'summary' }) => {
  const {
    animals,
    milkSales,
    incomeRecords,
    expenseRecords,
    employees,
    syncState,
    upsertIncome,
    upsertExpense,
    deleteFinanceEntry,
    upsertEmployee,
    navigate,
    notify,
  } = useFarm();

  const [tab, setTab] = useState<'summary' | 'income' | 'expenses' | 'staff'>(initialTab);
  const today = getTodayIso();
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);

  // Income Form (Add + Edit)
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [incDate, setIncDate] = useState(today);
  const [incCat, setIncCat] = useState<IncomeCategory>('MILK_SALES');
  const [incAmount, setIncAmount] = useState('');
  const [incAnimalId, setIncAnimalId] = useState('');
  const [incDesc, setIncDesc] = useState('');
  const [incNotes, setIncNotes] = useState('');

  // Expense Form (Add + Edit)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expDate, setExpDate] = useState(today);
  const [expCat, setExpCat] = useState<ExpenseCategory>('FEED');
  const [expAmount, setExpAmount] = useState('');
  const [expAnimalId, setExpAnimalId] = useState('');
  const [expEmpId, setExpEmpId] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expNotes, setExpNotes] = useState('');

  // Staff Register Form
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empRole, setEmpRole] = useState('Milker / Barn Helper');
  const [empJoinDate, setEmpJoinDate] = useState(today);
  const [empNotes, setEmpNotes] = useState('');

  const summary = useMemo(
    () => calculateProfitSummary(incomeRecords, expenseRecords, startDate, endDate),
    [incomeRecords, expenseRecords, startDate, endDate]
  );

  const unpaidReceivables = useMemo(() => {
    const unpaid = milkSales.filter((s) => s.paymentStatus !== 'PAID');
    return {
      count: unpaid.length,
      total: unpaid.reduce((sum, s) => sum + s.totalAmount, 0),
    };
  }, [milkSales]);

  const applyPeriodPreset = (preset: 'today' | 'month' | 'year' | '30d' | 'all') => {
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'month') {
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
    } else if (preset === 'year') {
      setStartDate(`${today.slice(0, 4)}-01-01`);
      setEndDate(today);
    } else if (preset === '30d') {
      setStartDate(addDaysIso(today, -29));
      setEndDate(today);
    } else {
      setStartDate('2000-01-01');
      setEndDate(today);
    }
  };

  const resetIncomeForm = () => {
    setEditingIncomeId(null);
    setIncDate(today);
    setIncCat('MILK_SALES');
    setIncAmount('');
    setIncAnimalId('');
    setIncDesc('');
    setIncNotes('');
  };

  const startEditIncome = (inc: IncomeRecord) => {
    setEditingIncomeId(inc.id);
    setIncDate(inc.date);
    setIncCat(inc.category);
    setIncAmount(String(inc.amount));
    setIncAnimalId(inc.animalId || '');
    setIncDesc(inc.description);
    setIncNotes(inc.notes || '');
    setTab('income');
  };

  const resetExpenseForm = () => {
    setEditingExpenseId(null);
    setExpDate(today);
    setExpCat('FEED');
    setExpAmount('');
    setExpAnimalId('');
    setExpEmpId('');
    setExpDesc('');
    setExpNotes('');
  };

  const startEditExpense = (exp: ExpenseRecord) => {
    setEditingExpenseId(exp.id);
    setExpDate(exp.date);
    setExpCat(exp.category);
    setExpAmount(String(exp.amount));
    setExpAnimalId(exp.animalId || '');
    setExpEmpId(exp.employeeId || '');
    setExpDesc(exp.description);
    setExpNotes(exp.notes || '');
    setTab('expenses');
  };

  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(incAmount);
    if (!amt || amt <= 0 || !incDesc.trim()) {
      notify('Enter a positive amount and description.', 'error');
      return;
    }
    const wasEditing = !!editingIncomeId;
    await upsertIncome({
      id: editingIncomeId || undefined,
      date: incDate,
      category: incCat,
      amount: amt,
      animalId: incAnimalId || undefined,
      description: incDesc.trim(),
      notes: incNotes.trim() || undefined,
    });
    resetIncomeForm();
    notify(
      wasEditing
        ? `Updated income record (${formatINR(amt)}).`
        : `Recorded income of ${formatINR(amt)}.`,
      'success'
    );
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expAmount);
    if (!amt || amt <= 0 || !expDesc.trim()) {
      notify('Enter a positive amount and description.', 'error');
      return;
    }
    const wasEditing = !!editingExpenseId;
    await upsertExpense({
      id: editingExpenseId || undefined,
      date: expDate,
      category: expCat,
      amount: amt,
      animalId: expAnimalId || undefined,
      employeeId: expEmpId || undefined,
      description: expDesc.trim(),
      notes: expNotes.trim() || undefined,
    });
    resetExpenseForm();
    notify(
      wasEditing
        ? `Updated expense record (${formatINR(amt)}).`
        : `Recorded expense of ${formatINR(amt)}.`,
      'success'
    );
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) {
      notify('Worker name is required.', 'error');
      return;
    }
    await upsertEmployee({
      name: empName.trim(),
      phone: empPhone.trim(),
      role: empRole.trim() || 'Farm Worker',
      joiningDate: empJoinDate,
      isActive: true,
      notes: empNotes.trim() || undefined,
    });
    setEmpName('');
    setEmpPhone('');
    setEmpNotes('');
    notify('Saved farm worker to register.');
  };

  const handleExportFinanceCsv = () => {
    const filteredInc = incomeRecords.filter(
      (i) => i.date >= startDate && i.date <= endDate
    );
    const filteredExp = expenseRecords.filter(
      (e) => e.date >= startDate && e.date <= endDate
    );
    const rows: Array<Array<string | number>> = [
      ...filteredInc.map((i) => [
        'INCOME',
        i.date,
        i.category,
        i.description,
        i.amount,
        i.updatedByEmail || i.createdByEmail || 'Local',
      ]),
      ...filteredExp.map((e) => [
        'EXPENSE',
        e.date,
        e.category,
        e.description,
        e.amount,
        e.updatedByEmail || e.createdByEmail || 'Local',
      ]),
    ];
    if (rows.length === 0) {
      notify('No financial transactions in the selected period to export.', 'info');
      return;
    }
    downloadCsvFile(
      `DairyTrack_Finance_${startDate}_to_${endDate}.csv`,
      ['Type', 'Date', 'Category', 'Description', 'Amount_INR', 'Recorded_By'],
      rows
    );
    notify(`Exported ${rows.length} financial rows to CSV.`, 'success');
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ name: 'more' })}
            className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-stone-900">
              Farm Finance, Profit &amp; Staff
            </h1>
            <p className="text-sm text-stone-600">
              Shared full financial ledger for Administrator &amp; Uncle ({syncState.role === 'MEMBER' ? 'Full Member Access' : 'Full Manager Access'}) — strictly hidden from Farm Workers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1">
          {(
            [
              { id: 'summary', label: 'Profit & Loss' },
              { id: 'income', label: 'Income' },
              { id: 'expenses', label: 'Expenses' },
              { id: 'staff', label: 'Workers' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[38px] rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
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

      {tab === 'summary' && (
        <div className="space-y-5">
          {/* Date Range Filter & Period Presets (Daily, Monthly, Yearly, 30d, All) */}
          <div className="rounded-2xl border border-stone-200/90 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-stone-800">
                <IndianRupee className="h-4 w-4 text-[#1B4D3E]" />
                Financial Period &amp; Profit Calculator
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="min-h-[40px] rounded-xl border border-stone-300 px-3 font-mono text-xs tabular-nums"
                />
                <span className="text-xs text-stone-500">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="min-h-[40px] rounded-xl border border-stone-300 px-3 font-mono text-xs tabular-nums"
                />
                <button
                  type="button"
                  onClick={handleExportFinanceCsv}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 text-xs font-semibold text-white hover:bg-[#153D31]"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
              {(
                [
                  { id: 'today', label: 'Today (Daily)' },
                  { id: 'month', label: 'This Month (Monthly)' },
                  { id: 'year', label: 'This Year (Yearly)' },
                  { id: '30d', label: 'Last 30 Days' },
                  { id: 'all', label: 'All Time' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPeriodPreset(preset.id)}
                  className="min-h-[36px] rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4-Card Cash Flow, Profit & Outstanding Payments Strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 font-mono tabular-nums">
            <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
              <p className="font-sans text-xs text-stone-500">
                Total Income ({summary.incomeCount})
              </p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                {formatINR(summary.totalIncome)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
              <p className="font-sans text-xs text-stone-500">
                Total Expenses ({summary.expenseCount})
              </p>
              <p className="mt-1 text-2xl font-extrabold text-red-700">
                {formatINR(summary.totalExpenses)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
              <p className="font-sans text-xs text-stone-500">Net Profit (Income − Expenses)</p>
              <p
                className={`mt-1 text-2xl font-extrabold ${
                  summary.netProfit >= 0 ? 'text-[#1B4D3E]' : 'text-red-700'
                }`}
              >
                {formatINR(summary.netProfit)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ name: 'milk', initialTab: 'sales' })}
              className="flex flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-5 text-left hover:border-[#1B4D3E]/50"
            >
              <div>
                <p className="font-sans text-xs text-stone-500">
                  Unpaid Milk Dues ({unpaidReceivables.count})
                </p>
                <p className="mt-1 text-2xl font-extrabold text-amber-800">
                  {formatINR(unpaidReceivables.total)}
                </p>
              </div>
              <span className="mt-2 inline-flex items-center gap-1 font-sans text-xs font-semibold text-[#1B4D3E]">
                Settle Customer Payments <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-stone-900">Income Breakdown</h2>
                <button
                  type="button"
                  onClick={() => setTab('income')}
                  className="text-xs font-semibold text-[#1B4D3E] hover:underline"
                >
                  + Add / Edit Income
                </button>
              </div>
              {Object.keys(summary.incomeByCategory).length === 0 ? (
                <p className="mt-4 text-sm text-stone-500">No income recorded in selected period.</p>
              ) : (
                <ul className="mt-3 divide-y divide-stone-100 text-sm">
                  {Object.entries(summary.incomeByCategory).map(([cat, amt]) => (
                    <li key={cat} className="flex justify-between py-2.5">
                      <span className="text-stone-700">{cat.replace(/_/g, ' ')}</span>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        {formatINR(amt as number)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-stone-200/90 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-stone-900">Expense Breakdown</h2>
                <button
                  type="button"
                  onClick={() => setTab('expenses')}
                  className="text-xs font-semibold text-[#1B4D3E] hover:underline"
                >
                  + Add / Edit Expense
                </button>
              </div>
              {Object.keys(summary.expenseByCategory).length === 0 ? (
                <p className="mt-4 text-sm text-stone-500">
                  No expenses recorded in selected period.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-stone-100 text-sm">
                  {Object.entries(summary.expenseByCategory).map(([cat, amt]) => (
                    <li key={cat} className="flex justify-between py-2.5">
                      <span className="text-stone-700">{cat.replace(/_/g, ' ')}</span>
                      <span className="font-mono font-bold text-red-700 tabular-nums">
                        {formatINR(amt as number)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'income' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveIncome}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900">
                {editingIncomeId ? 'Edit Income Entry' : 'Record Farm Income'}
              </h2>
              {editingIncomeId && (
                <button
                  type="button"
                  onClick={resetIncomeForm}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-900"
                >
                  <X className="h-3.5 w-3.5" /> Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Date *</label>
                <input
                  type="date"
                  value={incDate}
                  onChange={(e) => setIncDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Category *</label>
                <select
                  value={incCat}
                  onChange={(e) => setIncCat(e.target.value as IncomeCategory)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  {INCOME_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="any"
                required
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
                placeholder="e.g. 12500"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Related Animal (For Animal / Calf Sale)
              </label>
              <select
                value={incAnimalId}
                onChange={(e) => setIncAnimalId(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                <option value="">— General Farm Income —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              required
              value={incDesc}
              onChange={(e) => setIncDesc(e.target.value)}
              placeholder="Description (e.g. Dairy society milk bill / Sold male calf) *"
              className="min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <input
              type="text"
              value={incNotes}
              onChange={(e) => setIncNotes(e.target.value)}
              placeholder="Optional payment reference / buyer note..."
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              <Plus className="h-4 w-4" />
              {editingIncomeId ? 'Update Income Entry' : 'Save Income'}
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">
              Income Ledger ({incomeRecords.length})
            </h2>
            {incomeRecords.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No income entries recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...incomeRecords]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((inc) => (
                    <li
                      key={inc.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900">{inc.description}</p>
                        <p className="text-xs text-stone-500">
                          {formatIndianDate(inc.date)} · {inc.category.replace(/_/g, ' ')}
                          {inc.updatedByEmail || inc.createdByEmail
                            ? ` · By ${inc.updatedByEmail || inc.createdByEmail}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-700 tabular-nums">
                          +{formatINR(inc.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditIncome(inc)}
                          aria-label="Edit income entry"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFinanceEntry('income', inc.id)}
                          aria-label="Delete income entry"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveExpense}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900">
                {editingExpenseId ? 'Edit Expense Entry' : 'Record Farm Expense'}
              </h2>
              {editingExpenseId && (
                <button
                  type="button"
                  onClick={resetExpenseForm}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-900"
                >
                  <X className="h-3.5 w-3.5" /> Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Date *</label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Category *</label>
                <select
                  value={expCat}
                  onChange={(e) => setExpCat(e.target.value as ExpenseCategory)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="any"
                required
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="e.g. 4200"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm"
              />
            </div>

            {expCat === 'LABOUR' && employees.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Associate Farm Worker (Optional)
                </label>
                <select
                  value={expEmpId}
                  onChange={(e) => setExpEmpId(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="">— Select Worker —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Related Animal (For Animal Purchase / Vet / Medicine)
              </label>
              <select
                value={expAnimalId}
                onChange={(e) => setExpAnimalId(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              >
                <option value="">— General Farm Overhead —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              required
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              placeholder="Description (e.g. Cottonseed cake / Vet visit / Cow purchase) *"
              className="min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <input
              type="text"
              value={expNotes}
              onChange={(e) => setExpNotes(e.target.value)}
              placeholder="Optional vendor or bill number..."
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              <Plus className="h-4 w-4" />
              {editingExpenseId ? 'Update Expense Entry' : 'Save Expense'}
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">
              Expense Ledger ({expenseRecords.length})
            </h2>
            {expenseRecords.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No expenses recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...expenseRecords]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((exp) => (
                    <li
                      key={exp.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900">{exp.description}</p>
                        <p className="text-xs text-stone-500">
                          {formatIndianDate(exp.date)} · {exp.category.replace(/_/g, ' ')}
                          {exp.updatedByEmail || exp.createdByEmail
                            ? ` · By ${exp.updatedByEmail || exp.createdByEmail}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-red-700 tabular-nums">
                          −{formatINR(exp.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditExpense(exp)}
                          aria-label="Edit expense entry"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFinanceEntry('expense', exp.id)}
                          aria-label="Delete expense entry"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'staff' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveEmployee}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">Add Farm Worker (Payroll Register)</h2>
            </div>

            <input
              type="text"
              required
              value={empName}
              onChange={(e) => setEmpName(e.target.value)}
              placeholder="Worker Name *"
              className="min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="tel"
                value={empPhone}
                onChange={(e) => setEmpPhone(e.target.value)}
                placeholder="Phone Number"
                className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-sm"
              />
              <input
                type="date"
                value={empJoinDate}
                onChange={(e) => setEmpJoinDate(e.target.value)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-xs"
              />
            </div>
            <input
              type="text"
              value={empRole}
              onChange={(e) => setEmpRole(e.target.value)}
              placeholder="Role (e.g. Milker, Fodder Cutter)"
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />
            <input
              type="text"
              value={empNotes}
              onChange={(e) => setEmpNotes(e.target.value)}
              placeholder="Notes"
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Save Worker
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">
              Farm Staff Register ({employees.length})
            </h2>
            {employees.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">
                No workers added yet. Use this lightweight register to list helpers and associate labour expenses.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {employees.map((emp) => {
                  const totalPaid = expenseRecords
                    .filter((e) => e.employeeId === emp.id)
                    .reduce((s, e) => s + e.amount, 0);
                  return (
                    <li key={emp.id} className="flex items-center justify-between py-3.5 text-sm">
                      <div>
                        <p className="font-semibold text-stone-900">{emp.name}</p>
                        <p className="text-xs text-stone-500">
                          {emp.role} · Joined {formatIndianDate(emp.joiningDate)}
                          {emp.phone ? ` · ${emp.phone}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-stone-600 tabular-nums">
                          Paid {formatINR(totalPaid)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            resetExpenseForm();
                            setExpCat('LABOUR');
                            setExpEmpId(emp.id);
                            setExpDesc(`Labour wage: ${emp.name}`);
                            setTab('expenses');
                          }}
                          className="min-h-[36px] rounded-lg border border-stone-300 px-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
                        >
                          + Log Wage
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
