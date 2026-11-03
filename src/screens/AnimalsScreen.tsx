import {
  Camera,
  ChevronRight,
  Edit3,
  Plus,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { AnimalQrModal } from '../components/QrModalAndScanner';
import { useFarm } from '../context/FarmContext';
import {
  BUFFALO_BREEDS,
  calculateAge,
  COW_BREEDS,
  formatINR,
  generateQrIdentifier,
  validateAnimalForm,
} from '../domain/calculations';
import {
  Animal,
  AnimalStatus,
  Gender,
  Species,
} from '../types/models';

async function compressPhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 480;
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const AnimalFormModal: React.FC<{
  initialAnimal?: Animal | null;
  onClose: () => void;
  onSaved?: (saved: Animal) => void;
}> = ({ initialAnimal, onClose, onSaved }) => {
  const { animals, upsertAnimal, addExpense, notify } = useFarm();
  const isEdit = !!initialAnimal;

  const [draftUuid] = useState(() => initialAnimal?.id || crypto.randomUUID());
  const [tagNumber, setTagNumber] = useState(initialAnimal?.tagNumber || '');
  const [name, setName] = useState(initialAnimal?.name || '');
  const [qrIdentifier, setQrIdentifier] = useState(
    initialAnimal?.qrIdentifier || ''
  );
  const [qrManuallyEdited, setQrManuallyEdited] = useState(!!initialAnimal);
  const [rfidTag, setRfidTag] = useState(initialAnimal?.rfidTag || '');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(
    initialAnimal?.photoDataUrl
  );
  const [species, setSpecies] = useState<Species>(
    initialAnimal?.species || Species.COW
  );
  const [breed, setBreed] = useState(
    initialAnimal?.breed || COW_BREEDS[0]
  );
  const [gender, setGender] = useState<Gender>(
    initialAnimal?.gender || Gender.FEMALE
  );
  const [color, setColor] = useState(initialAnimal?.color || '');
  const [dateOfBirth, setDateOfBirth] = useState(initialAnimal?.dateOfBirth || '');
  const [purchaseDate, setPurchaseDate] = useState(initialAnimal?.purchaseDate || '');
  const [purchasePrice, setPurchasePrice] = useState(
    initialAnimal?.purchasePrice !== undefined ? String(initialAnimal.purchasePrice) : ''
  );
  const [logPurchaseExpense, setLogPurchaseExpense] = useState(!isEdit);
  const [sellerInfo, setSellerInfo] = useState(initialAnimal?.sellerInfo || '');
  const [shedLocation, setShedLocation] = useState(initialAnimal?.shedLocation || '');
  const [status, setStatus] = useState<AnimalStatus>(
    initialAnimal?.status || AnimalStatus.LACTATING
  );
  const [damId, setDamId] = useState(initialAnimal?.damId || '');
  const [sireId, setSireId] = useState(initialAnimal?.sireId || '');
  const [notes, setNotes] = useState(initialAnimal?.notes || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!qrManuallyEdited) {
      setQrIdentifier(generateQrIdentifier(tagNumber, draftUuid));
    }
  }, [tagNumber, draftUuid, qrManuallyEdited]);

  const breedOptions = species === Species.COW ? COW_BREEDS : BUFFALO_BREEDS;
  const eligibleDams = useMemo(
    () => animals.filter((a) => a.gender === Gender.FEMALE && a.id !== initialAnimal?.id),
    [animals, initialAnimal?.id]
  );
  const eligibleSires = useMemo(
    () => animals.filter((a) => a.gender === Gender.MALE && a.id !== initialAnimal?.id),
    [animals, initialAnimal?.id]
  );

  const handleSpeciesChange = (sp: Species) => {
    setSpecies(sp);
    const list = sp === Species.COW ? COW_BREEDS : BUFFALO_BREEDS;
    if (!list.includes(breed)) {
      setBreed(list[0]);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPhotoFile(file);
      setPhotoDataUrl(compressed);
    } catch {
      notify('Could not process photo file.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = purchasePrice.trim() ? Number(purchasePrice) : undefined;
    const validationErr = validateAnimalForm(
      {
        id: initialAnimal?.id,
        tagNumber,
        qrIdentifier,
        dateOfBirth: dateOfBirth || undefined,
        purchasePrice: parsedPrice,
        damId: damId || undefined,
        sireId: sireId || undefined,
      },
      animals
    );
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await upsertAnimal({
        id: initialAnimal?.id || draftUuid,
        tagNumber: tagNumber.trim(),
        name: name.trim() || undefined,
        qrIdentifier: qrIdentifier.trim(),
        rfidTag: rfidTag.trim() || undefined,
        photoDataUrl,
        species,
        breed: breed.trim() || breedOptions[0],
        gender,
        color: color.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        purchaseDate: purchaseDate || undefined,
        purchasePrice: parsedPrice,
        sellerInfo: sellerInfo.trim() || undefined,
        shedLocation: shedLocation.trim() || undefined,
        status,
        damId: damId || undefined,
        sireId: sireId || undefined,
        notes: notes.trim() || undefined,
      });

      if (!isEdit && logPurchaseExpense && parsedPrice && parsedPrice > 0) {
        await addExpense({
          date: purchaseDate || new Date().toISOString().slice(0, 10),
          category: 'ANIMAL_PURCHASE',
          amount: parsedPrice,
          animalId: saved.id,
          description: `Purchased ${species} Tag #${saved.tagNumber}`,
          notes: sellerInfo.trim() ? `Seller: ${sellerInfo.trim()}` : undefined,
        });
      }

      notify(
        isEdit ? `Updated Tag #${saved.tagNumber}` : `Registered Tag #${saved.tagNumber}`,
        'success'
      );
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save animal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl border border-stone-200 bg-white sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="text-lg font-bold text-stone-900">
            {isEdit ? `Edit Animal · Tag #${initialAnimal?.tagNumber}` : 'Register New Animal'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close animal form"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-800">
              {error}
            </div>
          )}

          {/* Photo Capture */}
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
              {photoDataUrl ? (
                <img
                  src={photoDataUrl}
                  alt="Animal preview"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Camera className="h-7 w-7 text-stone-400" />
              )}
            </div>
            <div>
              <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-xs font-semibold text-stone-800 hover:bg-stone-50">
                <Camera className="h-4 w-4 text-[#1B4D3E]" />
                {photoDataUrl ? 'Change Photo' : 'Capture / Choose Photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl(undefined)}
                  className="ml-3 text-xs font-medium text-red-700 hover:underline"
                >
                  Remove
                </button>
              )}
              <p className="mt-1 text-xs text-stone-500">Stored offline on device</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Ear Tag Number *
              </label>
              <input
                type="text"
                required
                value={tagNumber}
                onChange={(e) => setTagNumber(e.target.value)}
                placeholder="e.g. 104 or MH-12-088"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Animal Name (Optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ganga, Lakshmi, Kali"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Species *</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {([Species.COW, Species.BUFFALO] as const).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => handleSpeciesChange(sp)}
                    className={`min-h-[46px] rounded-xl border text-sm font-semibold transition-colors ${
                      species === sp
                        ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                        : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {sp === Species.COW ? 'Cow' : 'Buffalo'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Gender *</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {([Gender.FEMALE, Gender.MALE] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`min-h-[46px] rounded-xl border text-sm font-semibold transition-colors ${
                      gender === g
                        ? 'border-[#1B4D3E] bg-[#1B4D3E] text-white'
                        : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {g === Gender.FEMALE ? 'Female' : 'Male'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Breed *</label>
              <select
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              >
                {breedOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Current Status *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AnimalStatus)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              >
                {Object.values(AnimalStatus).map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Shed / Barn Location
              </label>
              <input
                type="text"
                value={shedLocation}
                onChange={(e) => setShedLocation(e.target.value)}
                placeholder="e.g. Shed A, Milking Line 1"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Coat Colour</label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g. Black & White, Jet Black, Red"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Optional RFID Number
              </label>
              <input
                type="text"
                value={rfidTag}
                onChange={(e) => setRfidTag(e.target.value)}
                placeholder="Optional electronic tag"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Mother (Dam) in Herd
              </label>
              <select
                value={damId}
                onChange={(e) => setDamId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              >
                <option value="">— Unknown / Outside Herd —</option>
                {eligibleDams.map((d) => (
                  <option key={d.id} value={d.id}>
                    Tag #{d.tagNumber} {d.name ? `(${d.name})` : ''} · {d.breed}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Father (Sire) in Herd
              </label>
              <select
                value={sireId}
                onChange={(e) => setSireId(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              >
                <option value="">— Unknown / AI Semen Bull —</option>
                {eligibleSires.map((s) => (
                  <option key={s.id} value={s.id}>
                    Tag #{s.tagNumber} {s.name ? `(${s.name})` : ''} · {s.breed}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Purchase Date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Purchase Price (₹)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="e.g. 65000"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Seller / Source
              </label>
              <input
                type="text"
                value={sellerInfo}
                onChange={(e) => setSellerInfo(e.target.value)}
                placeholder="e.g. Born on farm, Baramati Cattle Market"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Unique QR Identifier *
              </label>
              <input
                type="text"
                required
                value={qrIdentifier}
                onChange={(e) => {
                  setQrManuallyEdited(true);
                  setQrIdentifier(e.target.value);
                }}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-stone-300 px-3.5 font-mono text-xs focus:border-[#1B4D3E] focus:outline-none"
              />
            </div>
          </div>

          {!isEdit && Number(purchasePrice) > 0 && (
            <label className="flex min-h-[44px] items-center gap-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={logPurchaseExpense}
                onChange={(e) => setLogPurchaseExpense(e.target.checked)}
                className="h-4 w-4 accent-[#1B4D3E]"
              />
              Also record {formatINR(Number(purchasePrice))} in Farm Expenses (Animal Purchase)
            </label>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Physical markings, horn shape, temperament, or history..."
              className="mt-1 w-full rounded-xl border border-stone-300 p-3 text-sm focus:border-[#1B4D3E] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-xl border border-stone-300 px-5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] rounded-xl bg-[#1B4D3E] px-6 text-sm font-semibold text-white hover:bg-[#153D31] disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Register Animal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AnimalsScreen: React.FC<{
  initialStatusFilter?: AnimalStatus | 'ALL';
  initialOpenAdd?: boolean;
  onOpenScanner: () => void;
}> = ({ initialStatusFilter = 'ALL', initialOpenAdd = false, onOpenScanner }) => {
  const { animals, settings, navigate } = useFarm();
  const [query, setQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<'ALL' | Species>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AnimalStatus>(initialStatusFilter);
  const [editingAnimal, setEditingAnimal] = useState<Animal | null | undefined>(
    initialOpenAdd ? null : undefined
  );
  const [qrModalAnimal, setQrModalAnimal] = useState<Animal | null>(null);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  const filteredAnimals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return animals
      .filter((a) => {
        if (speciesFilter !== 'ALL' && a.species !== speciesFilter) return false;
        if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
        if (!q) return true;
        return (
          a.tagNumber.toLowerCase().includes(q) ||
          (a.name?.toLowerCase().includes(q) ?? false) ||
          a.breed.toLowerCase().includes(q) ||
          (a.shedLocation?.toLowerCase().includes(q) ?? false) ||
          a.qrIdentifier.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.tagNumber.localeCompare(b.tagNumber, undefined, { numeric: true }));
  }, [animals, query, speciesFilter, statusFilter]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">
            Herd Animals{' '}
            <span className="font-mono text-lg font-semibold text-stone-500 tabular-nums">
              ({filteredAnimals.length})
            </span>
          </h1>
          <p className="text-sm text-stone-600">
            Tap any animal to open its complete milk, health, breeding, and lineage profile.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenScanner}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50 whitespace-nowrap"
          >
            <QrCode className="h-4 w-4 text-[#1B4D3E]" />
            Scan QR
          </button>
          <button
            type="button"
            onClick={() => setEditingAnimal(null)}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Register Animal
          </button>
        </div>
      </div>

      {/* Search & Segmented Filters */}
      <div className="space-y-3 rounded-2xl border border-stone-200/90 bg-white p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ear tag, name, breed, shed, or QR ID..."
            className="min-h-[46px] w-full rounded-xl border border-stone-300 pl-10 pr-10 text-sm focus:border-[#1B4D3E] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 p-2 text-stone-400 hover:text-stone-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1">
            {(['ALL', Species.COW, Species.BUFFALO] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSpeciesFilter(sp)}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  speciesFilter === sp
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {sp === 'ALL' ? 'All Species' : sp === Species.COW ? 'Cows' : 'Buffaloes'}
              </button>
            ))}
          </div>

          <div className="flex flex-1 items-center gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1">
            {(['ALL', ...Object.values(AnimalStatus)] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`min-h-[36px] shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {st === 'ALL' ? 'All Statuses' : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Animal Registry List */}
      {filteredAnimals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200/90 bg-white px-6 py-14 text-center">
          <h3 className="text-base font-bold text-stone-900">
            {animals.length === 0
              ? 'No Animals Registered Yet'
              : 'No Animals Match Current Filters'}
          </h3>
          <p className="mt-1 max-w-md text-sm text-stone-600">
            {animals.length === 0
              ? 'Start by adding your cows, buffaloes, heifers, and calves. Every animal automatically receives an offline QR ear-tag.'
              : 'Try clearing your search query or switching the status filter back to All Statuses.'}
          </p>
          {animals.length === 0 ? (
            <button
              type="button"
              onClick={() => setEditingAnimal(null)}
              className="mt-5 flex min-h-[46px] items-center gap-2 rounded-xl bg-[#1B4D3E] px-5 text-sm font-semibold text-white hover:bg-[#153D31]"
            >
              <Plus className="h-4 w-4" />
              Register First Animal
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSpeciesFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="mt-5 min-h-[44px] rounded-xl border border-stone-300 px-4 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200/90 bg-white">
          {filteredAnimals.map((animal) => (
            <div
              key={animal.id}
              className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-stone-50/80 sm:px-5"
            >
              <button
                type="button"
                onClick={() => navigate({ name: 'animal-profile', animalId: animal.id })}
                className="flex min-h-[54px] flex-1 items-center gap-3.5 text-left min-w-0"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-[#1B4D3E]/10 font-mono text-sm font-bold text-[#1B4D3E]">
                  {animal.photoDataUrl ? (
                    <img
                      src={animal.photoDataUrl}
                      alt={`Tag ${animal.tagNumber}`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    animal.species.slice(0, 1)
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-base font-bold text-stone-900 tabular-nums">
                      Tag #{animal.tagNumber}
                    </span>
                    {animal.name && (
                      <span className="text-sm font-semibold text-stone-700">{animal.name}</span>
                    )}
                  </div>
                  {/* Clean unboxed metadata per Zero-Pill Discipline */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                    <span className="font-semibold text-[#1B4D3E]">{animal.status}</span>
                    <span aria-hidden="true">·</span>
                    <span>{animal.species}</span>
                    <span aria-hidden="true">·</span>
                    <span>{animal.breed}</span>
                    <span aria-hidden="true">·</span>
                    <span>{calculateAge(animal.dateOfBirth)}</span>
                    {animal.shedLocation && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{animal.shedLocation}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQrModalAnimal(animal)}
                  aria-label={`Show QR tag for ${animal.tagNumber}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-[#1B4D3E]"
                >
                  <QrCode className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAnimal(animal)}
                  aria-label={`Edit ${animal.tagNumber}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'animal-profile', animalId: animal.id })}
                  aria-label={`Open profile for ${animal.tagNumber}`}
                  className="flex min-h-[44px] min-w-[36px] items-center justify-center text-stone-400"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingAnimal !== undefined && (
        <AnimalFormModal
          initialAnimal={editingAnimal}
          onClose={() => setEditingAnimal(undefined)}
        />
      )}

      {qrModalAnimal && (
        <AnimalQrModal
          animal={qrModalAnimal}
          farmName={settings.farmName}
          onClose={() => setQrModalAnimal(null)}
        />
      )}
    </div>
  );
};
