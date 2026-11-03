import { AlertTriangle, ArrowLeft, Package, Plus } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { formatIndianDate, formatINR, getTodayIso } from '../domain/calculations';
import { FeedType } from '../types/models';

export const FeedScreen: React.FC = () => {
  const {
    animals,
    feedTypes,
    feedStockTransactions,
    feedRecords,
    upsertFeedType,
    addFeedStock,
    logFeedConsumption,
    navigate,
    notify,
  } = useFarm();

  const [tab, setTab] = useState<'inventory' | 'stock' | 'consumption'>('inventory');
  const today = getTodayIso();

  // Feed Type Form
  const [feedName, setFeedName] = useState('');
  const [feedCategory, setFeedCategory] =
    useState<FeedType['category']>('CONCENTRATE');
  const [supplier, setSupplier] = useState('');
  const [initialStock, setInitialStock] = useState('0');
  const [threshold, setThreshold] = useState('50');
  const [unitCost, setUnitCost] = useState('');

  // Stock Addition Form
  const [stockFeedId, setStockFeedId] = useState('');
  const [stockDate, setStockDate] = useState(today);
  const [stockTxType, setStockTxType] = useState<
    'PURCHASE' | 'ADJUSTMENT_ADD' | 'ADJUSTMENT_REMOVE'
  >('PURCHASE');
  const [stockQty, setStockQty] = useState('');
  const [stockCostPerKg, setStockCostPerKg] = useState('');
  const [stockSupplier, setStockSupplier] = useState('');
  const [logFeedExpense, setLogFeedExpense] = useState(true);

  // Daily Consumption Form
  const [consFeedId, setConsFeedId] = useState('');
  const [consDate, setConsDate] = useState(today);
  const [consAnimalId, setConsAnimalId] = useState('');
  const [consGroupShed, setConsGroupShed] = useState('All Milking Herd');
  const [consQty, setConsQty] = useState('');
  const [allowOverride, setAllowOverride] = useState(false);

  const feedMap = useMemo(() => new Map(feedTypes.map((f) => [f.id, f])), [feedTypes]);
  const animalMap = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  const handleCreateFeedType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedName.trim()) {
      notify('Feed name is required.', 'error');
      return;
    }
    const stock = Number(initialStock) || 0;
    const low = Number(threshold) || 25;
    const cost = Number(unitCost) || 0;
    if (stock < 0 || low < 0 || cost < 0) {
      notify('Stock and cost values cannot be negative.', 'error');
      return;
    }

    await upsertFeedType({
      name: feedName.trim(),
      category: feedCategory,
      supplier: supplier.trim() || undefined,
      unit: 'kg',
      currentStockKg: stock,
      lowStockThresholdKg: low,
      unitCostPerKg: cost,
    });
    setFeedName('');
    setSupplier('');
    setInitialStock('0');
    setUnitCost('');
    notify('Added feed item to inventory.');
  };

  const handleSaveStockTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(stockQty);
    const rate = Number(stockCostPerKg) || 0;
    if (!stockFeedId) {
      notify('Select a feed item.', 'error');
      return;
    }
    if (!qty || qty <= 0) {
      notify('Quantity must be greater than 0 kg.', 'error');
      return;
    }
    try {
      await addFeedStock({
        feedTypeId: stockFeedId,
        date: stockDate,
        transactionType: stockTxType,
        quantityKg: qty,
        unitCostPerKg: rate,
        supplier: stockSupplier.trim() || undefined,
        logAsExpense: logFeedExpense,
      });
      setStockQty('');
      notify('Updated feed stock balance.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Stock transaction failed.', 'error');
    }
  };

  const handleSaveConsumption = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(consQty);
    if (!consFeedId) {
      notify('Select a feed item.', 'error');
      return;
    }
    if (!qty || qty <= 0) {
      notify('Consumed quantity must be greater than 0 kg.', 'error');
      return;
    }
    try {
      await logFeedConsumption({
        feedTypeId: consFeedId,
        animalId: consAnimalId || undefined,
        groupOrShed: consAnimalId ? undefined : consGroupShed.trim() || 'Herd Group',
        date: consDate,
        quantityKg: qty,
        allowNegativeOverride: allowOverride,
      });
      setConsQty('');
      notify(`Logged ${qty} kg daily ration consumption.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not log consumption.', 'error');
    }
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
            <h1 className="text-2xl font-extrabold text-stone-900">Feed & Ration Inventory</h1>
            <p className="text-sm text-stone-600">
              Manage fodder & concentrate stocks, supplier rates, low-stock alerts, and daily rations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-1">
          {(
            [
              { id: 'inventory', label: 'Feed Catalog' },
              { id: 'stock', label: 'Add Stock' },
              { id: 'consumption', label: 'Daily Feeding' },
            ] as const
          ).map((tItem) => (
            <button
              key={tItem.id}
              type="button"
              onClick={() => setTab(tItem.id)}
              className={`min-h-[38px] rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === tItem.id
                  ? 'bg-[#1B4D3E] text-white'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {tItem.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'inventory' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleCreateFeedType}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-[#1B4D3E]" />
              <h2 className="text-base font-bold text-stone-900">Register Feed / Fodder Type</h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Feed Name *</label>
              <input
                type="text"
                required
                value={feedName}
                onChange={(e) => setFeedName(e.target.value)}
                placeholder="e.g. Cottonseed Cake (Sarki Pend), Maize Silage"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Category</label>
                <select
                  value={feedCategory}
                  onChange={(e) => setFeedCategory(e.target.value as FeedType['category'])}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="GREEN_FODDER">Green Fodder</option>
                  <option value="DRY_FODDER">Dry Fodder</option>
                  <option value="SILAGE">Silage</option>
                  <option value="CONCENTRATE">Concentrate / Pellets</option>
                  <option value="MINERAL_MIX">Mineral Mixture</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Cost per kg (₹)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="e.g. 32"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Opening Stock (kg)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Low-Stock Alert (kg)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Supplier</label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Optional feed supplier or mill"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
              />
            </div>

            <button
              type="submit"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              <Plus className="h-4 w-4" />
              Add Feed Item
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">
              Current Feed Stocks ({feedTypes.length})
            </h2>
            {feedTypes.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">
                No feed items registered yet. Add your green fodder, dry straw, cattle pellets, and mineral mixtures.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {feedTypes.map((f) => {
                  const isLow = f.currentStockKg <= f.lowStockThresholdKg;
                  return (
                    <li key={f.id} className="flex items-center justify-between py-3.5 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-stone-900">{f.name}</span>
                          {isLow && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" /> Low Stock
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500">
                          {f.category.replace(/_/g, ' ')} · Alert ≤ {f.lowStockThresholdKg} kg
                          {f.supplier ? ` · ${f.supplier}` : ''}
                        </p>
                      </div>
                      <div className="text-right font-mono text-xs tabular-nums">
                        <p className={`text-base font-bold ${isLow ? 'text-amber-700' : 'text-stone-900'}`}>
                          {f.currentStockKg} kg
                        </p>
                        <p className="text-stone-500">{formatINR(f.unitCostPerKg)}/kg</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'stock' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveStockTx}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <h2 className="text-base font-bold text-stone-900">Record Feed Purchase / Stock Adjustment</h2>
            <div>
              <label className="block text-xs font-semibold text-stone-700">Feed Type *</label>
              <select
                required
                value={stockFeedId}
                onChange={(e) => {
                  const id = e.target.value;
                  setStockFeedId(id);
                  const found = feedMap.get(id);
                  if (found) setStockCostPerKg(String(found.unitCostPerKg));
                }}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Select Feed —</option>
                {feedTypes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.currentStockKg} kg in stock)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Type</label>
                <select
                  value={stockTxType}
                  onChange={(e) =>
                    setStockTxType(
                      e.target.value as 'PURCHASE' | 'ADJUSTMENT_ADD' | 'ADJUSTMENT_REMOVE'
                    )
                  }
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
                >
                  <option value="PURCHASE">Purchase Inward</option>
                  <option value="ADJUSTMENT_ADD">Harvest / Add</option>
                  <option value="ADJUSTMENT_REMOVE">Spoilage / Deduct</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Date</label>
                <input
                  type="date"
                  value={stockDate}
                  onChange={(e) => setStockDate(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Quantity (kg) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  required
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  placeholder="e.g. 500"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Rate (₹/kg)</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={stockCostPerKg}
                  onChange={(e) => setStockCostPerKg(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <input
              type="text"
              value={stockSupplier}
              onChange={(e) => setStockSupplier(e.target.value)}
              placeholder="Supplier or bill reference..."
              className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
            />

            {stockTxType === 'PURCHASE' && (
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={logFeedExpense}
                  onChange={(e) => setLogFeedExpense(e.target.checked)}
                  className="h-4 w-4 accent-[#1B4D3E]"
                />
                Also record {formatINR((Number(stockQty) || 0) * (Number(stockCostPerKg) || 0))} in Farm Expenses
              </label>
            )}

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Update Stock
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">Stock Transaction Ledger</h2>
            {feedStockTransactions.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No stock purchases or adjustments recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...feedStockTransactions]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <p className="font-semibold text-stone-900">
                          {feedMap.get(tx.feedTypeId)?.name || 'Feed'} · {tx.transactionType}
                        </p>
                        <p className="text-xs text-stone-500">
                          {formatIndianDate(tx.date)}
                          {tx.supplier ? ` · ${tx.supplier}` : ''}
                        </p>
                      </div>
                      <div className="text-right font-mono text-xs tabular-nums">
                        <p className="font-bold text-stone-900">
                          {tx.transactionType === 'ADJUSTMENT_REMOVE' ? '−' : '+'}
                          {tx.quantityKg} kg
                        </p>
                        <p className="text-stone-500">{formatINR(tx.totalCost)}</p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'consumption' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleSaveConsumption}
            className="rounded-2xl border border-stone-200/90 bg-white p-5 space-y-4 lg:col-span-5"
          >
            <h2 className="text-base font-bold text-stone-900">Log Daily Feed Consumption</h2>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Feed Used *</label>
              <select
                required
                value={consFeedId}
                onChange={(e) => setConsFeedId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Select Feed —</option>
                {feedTypes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.currentStockKg} kg left)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Specific Animal (or leave blank for Group/Shed)
              </label>
              <select
                value={consAnimalId}
                onChange={(e) => setConsAnimalId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm"
              >
                <option value="">— Group / Shed Feeding —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag #{a.tagNumber} {a.name ? `(${a.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {!consAnimalId && (
              <div>
                <label className="block text-xs font-semibold text-stone-700">Group / Shed</label>
                <input
                  type="text"
                  value={consGroupShed}
                  onChange={(e) => setConsGroupShed(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Date</label>
                <input
                  type="date"
                  value={consDate}
                  onChange={(e) => setConsDate(e.target.value)}
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Quantity Fed (kg) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  required
                  value={consQty}
                  onChange={(e) => setConsQty(e.target.value)}
                  placeholder="e.g. 25"
                  className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3 font-mono text-sm"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={allowOverride}
                onChange={(e) => setAllowOverride(e.target.checked)}
                className="h-4 w-4 accent-[#1B4D3E]"
              />
              Allow logging even if recorded stock is lower than quantity fed
            </label>

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              Record Ration Fed
            </button>
          </form>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-stone-900">Daily Ration History</h2>
            {feedRecords.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500">No daily feeding entries recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-100">
                {[...feedRecords]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r) => {
                    const a = r.animalId ? animalMap.get(r.animalId) : undefined;
                    return (
                      <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                        <div>
                          <p className="font-semibold text-stone-900">
                            {feedMap.get(r.feedTypeId)?.name || 'Feed'}
                          </p>
                          <p className="text-xs text-stone-500">
                            {formatIndianDate(r.date)} ·{' '}
                            {a ? `Tag #${a.tagNumber}` : r.groupOrShed || 'Herd'}
                          </p>
                        </div>
                        <div className="text-right font-mono text-xs tabular-nums">
                          <p className="font-bold text-stone-900">{r.quantityKg} kg</p>
                          <p className="text-stone-500">Cost {formatINR(r.totalCost)}</p>
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
