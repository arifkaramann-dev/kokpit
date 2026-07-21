import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanBarcode } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Kamerayla barkod okuma (mobil depo/sayım için): tarayıcının yerleşik
 * BarcodeDetector API'si kullanılır — harici kütüphane yok. Chrome/Android'de
 * çalışır; desteklemeyen tarayıcıda (iOS Safari eski sürümler) buton bilgi verir.
 */

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function BarcodeScanButton({ onScan, title = "Barkod Okut" }: { onScan: (code: string) => void; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        title={title}
        onClick={() => {
          if (!getDetectorCtor()) {
            toast.error("Bu tarayıcı kamerayla barkod okumayı desteklemiyor", {
              description: "Android'de Chrome kullanın; barkodu elle arama kutusuna da yazabilirsiniz.",
            });
            return;
          }
          setOpen(true);
        }}
      >
        <ScanBarcode className="h-4 w-4" />
      </Button>
      {open && (
        <ScannerDialog
          onClose={() => setOpen(false)}
          onScan={code => {
            setOpen(false);
            onScan(code);
          }}
        />
      )}
    </>
  );
}

function ScannerDialog({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  const stop = useCallback(() => {
    stopped.current = true;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => {
    const Ctor = getDetectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"] });
    let raf = 0;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (stopped.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play();

        const scan = async () => {
          if (stopped.current) return;
          if (video.readyState >= 2) {
            try {
              const codes = await detector.detect(video);
              const hit = codes.find(c => c.rawValue?.trim());
              if (hit) {
                if (navigator.vibrate) navigator.vibrate(80);
                stop();
                onScan(hit.rawValue.trim());
                return;
              }
            } catch {
              /* tek kare hatası önemsiz — sonraki karede tekrar denenir */
            }
          }
          raf = requestAnimationFrame(() => void scan());
        };
        raf = requestAnimationFrame(() => void scan());
      })
      .catch(() => setError("Kameraya erişilemedi. Tarayıcı izinlerini kontrol edin."));

    return () => {
      cancelAnimationFrame(raf);
      stop();
    };
  }, [onScan, stop]);

  return (
    <Dialog
      open
      onOpenChange={v => {
        if (!v) {
          stop();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Barkod Okut</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-lg border bg-black aspect-[4/3]">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-rose-500/80" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Barkodu kırmızı çizgiye hizala — okununca otomatik kapanır.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
