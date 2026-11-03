import jsQR from 'jsqr';
import { Camera, Download, QrCode, Search, X } from 'lucide-react';
import QRCode from 'qrcode';
import React, { useEffect, useRef, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { Animal } from '../types/models';

export const AnimalQrModal: React.FC<{
  animal: Animal;
  farmName: string;
  onClose: () => void;
}> = ({ animal, farmName, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(animal.qrIdentifier, {
      width: 480,
      margin: 2,
      color: { dark: '#1B4D3E', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [animal.qrIdentifier]);

  const handleDownloadBadge = () => {
    if (!qrDataUrl) return;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 780;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#1B4D3E';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, 600, 740);

    ctx.fillStyle = '#1B4D3E';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(farmName || 'DairyTrack Smart Farm', 320, 78);

    ctx.fillStyle = '#1C1917';
    ctx.font = 'bold 42px monospace';
    ctx.fillText(`TAG #${animal.tagNumber}`, 320, 134);

    if (animal.name) {
      ctx.fillStyle = '#57534E';
      ctx.font = '24px sans-serif';
      ctx.fillText(`${animal.name} · ${animal.species} · ${animal.breed}`, 320, 174);
    }

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 110, 200, 420, 420);
      ctx.fillStyle = '#44403C';
      ctx.font = '20px monospace';
      ctx.fillText(animal.qrIdentifier, 320, 668);
      ctx.fillStyle = '#78716C';
      ctx.font = '16px sans-serif';
      ctx.fillText('Scan with DairyTrack Offline Scanner', 320, 708);

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `DairyTrack_QR_Tag_${animal.tagNumber}.png`;
      a.click();
    };
    img.src = qrDataUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-stone-900">Animal QR Ear-Tag</h3>
          <button
            onClick={onClose}
            aria-label="Close QR dialog"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center border-y border-stone-100 py-5 text-center">
          <p className="font-mono text-xl font-bold text-[#1B4D3E] tabular-nums">
            Tag #{animal.tagNumber}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {animal.name ? `${animal.name} · ` : ''}
            {animal.species} · {animal.breed}
          </p>

          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for Tag ${animal.tagNumber}`}
              referrerPolicy="no-referrer"
              className="mt-4 h-56 w-56 rounded-xl border border-stone-200 p-2"
            />
          ) : (
            <div className="mt-4 flex h-56 w-56 items-center justify-center rounded-xl border border-stone-200 bg-stone-50">
              <QrCode className="h-12 w-12 text-stone-400" />
            </div>
          )}

          <p className="mt-3 font-mono text-xs text-stone-500 tabular-nums">
            {animal.qrIdentifier}
          </p>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleDownloadBadge}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Save Printable Tag
          </button>
        </div>
      </div>
    </div>
  );
};

export const QrScannerModal: React.FC<{
  onClose: () => void;
  onFoundAnimal: (animalId: string) => void;
}> = ({ onClose, onFoundAnimal }) => {
  const { animals, notify } = useFarm();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [unmatchedCode, setUnmatchedCode] = useState<string | null>(null);

  const resolveCode = (rawCode: string): boolean => {
    const code = rawCode.trim();
    if (!code) return false;
    const match = animals.find(
      (a) =>
        a.qrIdentifier.toLowerCase() === code.toLowerCase() ||
        a.tagNumber.toLowerCase() === code.toLowerCase() ||
        a.id.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      notify(`Identified Tag #${match.tagNumber}${match.name ? ` (${match.name})` : ''}`, 'success');
      onFoundAnimal(match.id);
      return true;
    } else {
      setUnmatchedCode(code);
      return false;
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let active = true;

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera API unavailable in this browser. Use manual tag lookup below.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Support native BarcodeDetector if available, plus pure-JS offline jsQR fallback
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        const nativeDetector = BarcodeDetectorCtor
          ? new BarcodeDetectorCtor({ formats: ['qr_code'] })
          : null;

        const scanFrame = async () => {
          if (!active) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
            if (nativeDetector) {
              try {
                const barcodes = await nativeDetector.detect(video);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  if (resolveCode(barcodes[0].rawValue)) {
                    active = false;
                    return;
                  }
                }
              } catch {
                // fall through to jsQR
              }
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx && canvas.width > 0 && canvas.height > 0) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (decoded && decoded.data) {
                if (resolveCode(decoded.data)) {
                  active = false;
                  return;
                }
              }
            }
          }

          rafId = requestAnimationFrame(scanFrame);
        };

        rafId = requestAnimationFrame(scanFrame);
      } catch {
        setCameraError(
          'Camera permission denied or hardware unavailable. Enter ear tag or QR code manually below.'
        );
      }
    };

    startCamera();

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Camera className="h-5 w-5 text-[#1B4D3E]" />
            <h3 className="text-lg font-bold text-stone-900">Scan Animal QR Tag</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close scanner"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-1 text-xs text-stone-600">
          Point camera at an animal QR ear-tag. Scanning opens existing profiles only and never creates duplicate animals.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-stone-900">
          {cameraError ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center p-6 text-center text-stone-200">
              <QrCode className="h-10 w-10 text-amber-400" />
              <p className="mt-3 text-sm">{cameraError}</p>
            </div>
          ) : (
            <div className="relative aspect-square w-full max-h-[280px]">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/75" />
            </div>
          )}
        </div>

        {unmatchedCode && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            No registered animal found matching code <span className="font-mono font-semibold">{unmatchedCode}</span>. Check the tag number or register the animal first in Animals.
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            resolveCode(manualInput);
          }}
          className="mt-4 flex gap-2"
        >
          <input
            type="text"
            value={manualInput}
            onChange={(e) => {
              setManualInput(e.target.value);
              setUnmatchedCode(null);
            }}
            placeholder="Or enter Tag # / QR ID (e.g. 104)"
            className="min-h-[46px] flex-1 rounded-xl border border-stone-300 px-3.5 text-sm focus:border-[#1B4D3E] focus:outline-none"
          />
          <button
            type="submit"
            className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-[#1B4D3E] px-4 text-sm font-semibold text-white hover:bg-[#153D31] whitespace-nowrap"
          >
            <Search className="h-4 w-4" />
            Open
          </button>
        </form>
      </div>
    </div>
  );
};
