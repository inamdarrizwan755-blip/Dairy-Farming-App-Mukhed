import { Fingerprint, Lock, Delete } from 'lucide-react';
import React, { useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { authenticatePlatformBiometric, verifyPinPBKDF2 } from '../services/security';

export const PinLockScreen: React.FC = () => {
  const { preferences, settings, unlockApp } = useFarm();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const attemptVerify = async (candidate: string) => {
    if (!preferences.pinHash || !preferences.pinSalt) {
      unlockApp();
      return;
    }
    setVerifying(true);
    setError(null);
    const ok = await verifyPinPBKDF2(candidate, preferences.pinHash, preferences.pinSalt);
    setVerifying(false);
    if (ok) {
      setPin('');
      unlockApp();
    } else {
      setError('Incorrect PIN. Try again.');
      setPin('');
    }
  };

  const handleDigit = (digit: string) => {
    if (verifying || pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      // Auto-check at 4 digits if it matches, else user can type up to 6 and press Unlock
      verifyPinPBKDF2(next, preferences.pinHash || '', preferences.pinSalt || '').then((ok) => {
        if (ok) {
          setPin('');
          unlockApp();
        }
      });
    }
  };

  const handleBiometric = async () => {
    if (!preferences.biometricCredentialId) return;
    const ok = await authenticatePlatformBiometric(preferences.biometricCredentialId);
    if (ok) {
      unlockApp();
    } else {
      setError('Biometric verification cancelled or failed. Enter PIN.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F7F3] px-6 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1B4D3E]/10 text-[#1B4D3E]">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-stone-900">{settings.farmName}</h1>
          <p className="mt-1 text-sm text-stone-600">
            Enter your offline farm PIN to unlock DairyTrack
          </p>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`h-4 w-4 rounded-full border transition-colors ${
                pin.length > idx
                  ? 'border-[#1B4D3E] bg-[#1B4D3E]'
                  : 'border-stone-300 bg-stone-100'
              }`}
            />
          ))}
          {pin.length > 4 &&
            [4, 5].slice(0, pin.length - 4).map((idx) => (
              <div
                key={idx}
                className="h-4 w-4 rounded-full border border-[#1B4D3E] bg-[#1B4D3E]"
              />
            ))}
        </div>

        {error && (
          <p className="mt-3 text-center text-xs font-medium text-red-700">{error}</p>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="flex min-h-[54px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 font-mono text-xl font-bold text-stone-900 active:bg-stone-200"
            >
              {d}
            </button>
          ))}
          {preferences.biometricEnabled && preferences.biometricCredentialId ? (
            <button
              type="button"
              onClick={handleBiometric}
              aria-label="Unlock with device biometric"
              className="flex min-h-[54px] items-center justify-center rounded-2xl border border-stone-200 bg-[#1B4D3E]/10 text-[#1B4D3E]"
            >
              <Fingerprint className="h-6 w-6" />
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="flex min-h-[54px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 font-mono text-xl font-bold text-stone-900 active:bg-stone-200"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            aria-label="Delete digit"
            className="flex min-h-[54px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-stone-700 active:bg-stone-200"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        {pin.length >= 4 && (
          <button
            type="button"
            onClick={() => attemptVerify(pin)}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white hover:bg-[#153D31]"
          >
            Unlock Farm Vault
          </button>
        )}
      </div>
    </div>
  );
};
