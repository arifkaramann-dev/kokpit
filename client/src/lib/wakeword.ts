import {
  BuiltInKeyword,
  PorcupineWorker,
  type PorcupineDetection,
  type PorcupineKeyword,
} from "@picovoice/porcupine-web";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";

/**
 * Picovoice Porcupine ile cihaz-üstü (on-device) sesli uyandırma denetleyicisi.
 * Ses buluta gönderilmez; motor tarayıcıda WASM olarak çalışır.
 *
 * Kullanım: AccessKey ve (opsiyonel) özel kelime/model yolu ile `start()`.
 * Kelime yolu boşsa hazır İngilizce "Jarvis" + gömülü İngilizce model kullanılır;
 * özel "Hey Kokpit" için Picovoice Console'da eğitilen `.ppn` + Türkçe `.pv` verilir.
 *
 * Not: Porcupine yalnızca uyandırma kelimesini algılar (tam konuşma tanıma değil);
 * uyandıktan sonra komut metni ayrı bir tanımayla (Web Speech) alınır.
 */

export type WakeConfig = {
  accessKey: string;
  /** Özel `.ppn` public yolu (ör. "/wake/hey-kokpit.ppn"). Boşsa hazır kelime. */
  keywordPath: string;
  /** Özel kelime etiketi (ör. "Hey Kokpit"). */
  keywordLabel: string;
  /** Özel `.pv` model yolu (ör. "/wake/porcupine_params_tr.pv"). Boşsa İngilizce model. */
  modelPath: string;
};

/** Repoda gömülü İngilizce model (hazır kelimeler için). */
const DEFAULT_MODEL_PATH = "/wake/porcupine_params.pv";
/** Hazır kelime yokken kullanılan İngilizce uyandırma kelimesi. */
const DEFAULT_BUILTIN = BuiltInKeyword.Jarvis;

export class WakeWord {
  private worker: PorcupineWorker | null = null;
  private subscribed = false;

  /** Motoru başlatır ve mikrofona abone olur; kelime algılanınca `onWake` çağrılır. */
  async start(cfg: WakeConfig, onWake: (detection: PorcupineDetection) => void): Promise<void> {
    if (!cfg.accessKey) throw new Error("Picovoice AccessKey tanımlı değil.");

    const keyword: PorcupineKeyword | BuiltInKeyword = cfg.keywordPath
      ? { publicPath: cfg.keywordPath, label: cfg.keywordLabel || "Hey Kokpit" }
      : { builtin: DEFAULT_BUILTIN };
    const model = { publicPath: cfg.modelPath || DEFAULT_MODEL_PATH };

    this.worker = await PorcupineWorker.create(cfg.accessKey, keyword, onWake, model);
    await WebVoiceProcessor.subscribe(this.worker);
    this.subscribed = true;
  }

  /** Mikrofonu geçici bırakır (komut tanıma sırasında çakışmayı önler). */
  async pause(): Promise<void> {
    if (this.worker && this.subscribed) {
      await WebVoiceProcessor.unsubscribe(this.worker);
      this.subscribed = false;
    }
  }

  /** Duraklatılmış motoru tekrar mikrofona abone eder. */
  async resume(): Promise<void> {
    if (this.worker && !this.subscribed) {
      await WebVoiceProcessor.subscribe(this.worker);
      this.subscribed = true;
    }
  }

  /** Motoru tamamen durdurur ve kaynakları bırakır. */
  async stop(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    try {
      if (this.subscribed) await WebVoiceProcessor.unsubscribe(worker);
    } catch {
      /* yoksay */
    }
    this.subscribed = false;
    worker.terminate();
  }

  get active(): boolean {
    return this.worker !== null;
  }

  /** Tarayıcı desteği (WebAssembly + AudioWorklet/getUserMedia). */
  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof WebAssembly !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }
}
