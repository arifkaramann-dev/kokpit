import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Lightbulb,
  Target,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

const TABS = [
  { key: "tamamlama", label: "Ürün Tamamlama" },
  { key: "rapor", label: "Durum Raporu" },
  { key: "strateji", label: "Strateji Rehberi" },
] as const;

const num = (v: string | number | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return isNaN(n) ? 0 : n;
};

export default function Strategy() {
  const { data, isLoading } = trpc.report.data.useQuery();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("tamamlama");
  const [, setLocation] = useLocation();

  const model = useMemo(() => {
    if (!data) return null;
    const { products, formulas, marketingTexts, orders, orderItems, materials, campaigns, productImages, expenses } = data;
    const imagedProducts = new Set(productImages.map(i => i.productId));

    // Ürün başına hammadde maliyeti (formülden)
    const matCost = new Map<number, number>();
    for (const f of formulas) {
      matCost.set(f.productId, (matCost.get(f.productId) ?? 0) + num(f.qty) * num(f.unitCost));
    }
    const mktNames = new Set(marketingTexts.map(t => t.productName).filter(Boolean));

    // Satış istatistikleri (kalemlerden, ürün adına göre)
    const soldQty = new Map<string, number>();
    const soldRevenue = new Map<string, number>();
    for (const item of orderItems) {
      soldQty.set(item.productName, (soldQty.get(item.productName) ?? 0) + num(item.quantity));
      soldRevenue.set(
        item.productName,
        (soldRevenue.get(item.productName) ?? 0) + num(item.quantity) * num(item.unitPrice),
      );
    }

    const productRows = products.map(p => {
      const material = matCost.get(p.id) ?? 0;
      const totalCost = material + num(p.packagingCost) + num(p.shippingCost);
      const netPrice = num(p.salePrice) * (1 - num(p.discountPercent) / 100);
      const profit = netPrice - totalCost;
      const margin = netPrice > 0 ? (profit / netPrice) * 100 : 0;
      const checks = [
        { label: "Seri / renk kodu", ok: Boolean(p.series || p.colorCode), fix: "/urunler" },
        { label: "Ürün açıklaması", ok: Boolean(p.description), fix: "/urunler" },
        { label: "Formül kayıtlı", ok: matCost.has(p.id), fix: "/formuller" },
        { label: "Satış fiyatı", ok: num(p.salePrice) > 0, fix: "/maliyet" },
        {
          label: "Maliyet bilgisi",
          ok: matCost.has(p.id) || num(p.packagingCost) > 0 || num(p.shippingCost) > 0,
          fix: "/maliyet",
        },
        {
          label: "Sağlıklı kâr marjı (≥%20)",
          ok: num(p.salePrice) > 0 && totalCost > 0 && margin >= 20,
          fix: "/maliyet",
        },
        { label: "Pazarlama metni", ok: mktNames.has(p.name), fix: "/pazarlama" },
        { label: "Satış görmüş", ok: (soldQty.get(p.name) ?? 0) > 0, fix: "/siparisler" },
        { label: "Etiket bilgisi", ok: Boolean(p.labelSize || p.labelText), fix: "/urunler" },
        { label: "Kullanım kılavuzu", ok: Boolean(p.usageGuide), fix: "/urunler" },
        { label: "Ambalaj bilgisi", ok: Boolean(p.packaging), fix: "/urunler" },
        { label: "Ürün görseli", ok: imagedProducts.has(p.id), fix: "/urunler" },
      ];
      const done = checks.filter(c => c.ok).length;
      return { p, material, totalCost, netPrice, profit, margin, checks, done, total: checks.length };
    });

    // Son 30 gün sipariş istatistikleri
    const cutoff = Date.now() - 30 * 86400000;
    const recent = orders.filter(o => new Date(o.createdAt).getTime() >= cutoff);
    const revenue30 = recent.reduce((s, o) => s + num(o.totalAmount), 0);
    const byChannel = new Map<string, { count: number; revenue: number }>();
    for (const o of recent) {
      const ch = o.channel ?? "diğer";
      const cur = byChannel.get(ch) ?? { count: 0, revenue: 0 };
      byChannel.set(ch, { count: cur.count + 1, revenue: cur.revenue + num(o.totalAmount) });
    }
    // Son 30 gün giderleri + net kâr (ciro − gider) ve bekleyen tahsilat.
    const expense30 = (expenses ?? [])
      .filter(e => new Date(e.expenseDate).getTime() >= cutoff)
      .reduce((s, e) => s + num(e.amount), 0);
    const net30 = revenue30 - expense30;
    const receivables = orders
      .filter(o => o.paymentStatus !== "paid")
      .reduce((s, o) => s + Math.max(0, num(o.totalAmount) - num(o.paidAmount)), 0);

    const critical = materials.filter(m => num(m.stockQty) <= num(m.criticalQty));
    const stockValue = materials.reduce((s, m) => s + num(m.stockQty) * num(m.unitCost), 0);
    const upcomingCampaigns = campaigns.filter(
      c => c.status !== "done" && new Date(c.endDate).getTime() >= Date.now(),
    );
    const topSellers = Array.from(soldQty.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Verilerden üretilen öneriler
    const tips: { severity: "high" | "mid" | "low"; text: string; go?: string }[] = [];
    const losing = productRows.filter(r => num(r.p.salePrice) > 0 && r.totalCost > 0 && r.profit < 0);
    if (losing.length > 0)
      tips.push({
        severity: "high",
        text: `${losing.length} ürün zararına satılıyor: ${losing.map(r => r.p.name).slice(0, 3).join(", ")}${losing.length > 3 ? "..." : ""}. Fiyatı yükselt ya da maliyeti düşür.`,
        go: "/maliyet",
      });
    const lowMargin = productRows.filter(
      r => num(r.p.salePrice) > 0 && r.totalCost > 0 && r.profit >= 0 && r.margin < 20,
    );
    if (lowMargin.length > 0)
      tips.push({
        severity: "mid",
        text: `${lowMargin.length} ürünün kâr marjı %20'nin altında. Kargo/ambalaj maliyetlerini gözden geçir veya fiyat güncelle.`,
        go: "/maliyet",
      });
    if (critical.length > 0)
      tips.push({
        severity: "high",
        text: `${critical.length} hammadde kritik stok seviyesinde — üretim durabilir. Tedarikçilere sipariş ver.`,
        go: "/stok",
      });
    const noFormula = productRows.filter(r => !r.checks[2].ok);
    if (noFormula.length > 0)
      tips.push({
        severity: "mid",
        text: `${noFormula.length} ürünün formülü kayıtlı değil — maliyet hesabı ve tekrar üretim riskte. Reçeteleri Formül Defteri'ne işle.`,
        go: "/formuller",
      });
    const noSale = productRows.filter(r => num(r.p.salePrice) > 0 && !r.checks[7].ok);
    if (noSale.length > 0)
      tips.push({
        severity: "low",
        text: `${noSale.length} ürün hiç satış görmemiş. Pazarlama metni hazırlayıp kampanyaya dahil etmeyi düşün.`,
        go: "/pazarlama",
      });
    if (upcomingCampaigns.length === 0)
      tips.push({
        severity: "mid",
        text: "Planlı kampanya yok. Düzenli kampanya döngüsü (ayda 1) satışları öngörülebilir şekilde artırır.",
        go: "/kampanyalar",
      });
    const totalRecent = recent.length;
    if (totalRecent >= 5) {
      const [topCh, topStats] = Array.from(byChannel.entries()).sort((a, b) => b[1].count - a[1].count)[0];
      if (topStats.count / totalRecent > 0.7)
        tips.push({
          severity: "low",
          text: `Siparişlerin %${Math.round((topStats.count / totalRecent) * 100)}'i tek kanaldan (${topCh}) geliyor. Kanal çeşitlendirmek riski azaltır.`,
        });
    }
    if (net30 < 0 && revenue30 > 0)
      tips.push({
        severity: "high",
        text: `Son 30 günde giderler (${formatTL(expense30)}) ciroyu (${formatTL(revenue30)}) aştı — net zarar ${formatTL(net30)}. Gider kalemlerini gözden geçir veya satışı artır.`,
        go: "/giderler",
      });
    if (receivables > 0)
      tips.push({
        severity: receivables > revenue30 * 0.3 ? "mid" : "low",
        text: `${formatTL(receivables)} tahsilat bekliyor. Ödenmemiş siparişleri takip et; nakit akışını rahatlatır.`,
        go: "/siparisler",
      });
    if (tips.length === 0)
      tips.push({ severity: "low", text: "Şu an kritik bir uyarı yok — veriler gayet sağlıklı görünüyor. 👏" });

    return {
      productRows: productRows.sort((a, b) => a.done / a.total - b.done / b.total),
      revenue30,
      expense30,
      net30,
      receivables,
      recentCount: recent.length,
      byChannel: Array.from(byChannel.entries()).sort((a, b) => b[1].revenue - a[1].revenue),
      critical,
      stockValue,
      upcomingCampaigns,
      topSellers,
      tips,
    };
  }, [data]);

  if (isLoading || !model)
    return <p className="text-sm text-muted-foreground">Yükleniyor...</p>;

  const complete = model.productRows.filter(r => r.done === r.total).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Strateji & Rapor</h1>
        <p className="text-sm text-muted-foreground">
          Ürünlerinin eksikleri, işletmenin durumu ve büyüme stratejileri tek yerde.
        </p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ------- Ürün Tamamlama ------- */}
      {tab === "tamamlama" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Toplam Ürün" value={String(model.productRows.length)} />
            <Stat label="Tamamlanan" value={String(complete)} tone="text-emerald-600" />
            <Stat
              label="Eksiği Olan"
              value={String(model.productRows.length - complete)}
              tone="text-amber-600"
            />
          </div>
          {model.productRows.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Henüz ürün yok — Ürün Geliştirme'den ilk projeni başlat.
            </Card>
          )}
          {model.productRows.map(({ p, checks, done, total, margin }) => (
            <Card key={p.id} className="p-4 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold flex-1 min-w-0 truncate">{p.name}</p>
                {p.series && <Badge variant="outline">{p.series}</Badge>}
                <span
                  className={`text-sm font-bold ${done === total ? "text-emerald-600" : "text-amber-600"}`}
                >
                  {done}/{total}
                </span>
              </div>
              <div className="flex gap-1">
                {checks.map((c, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${c.ok ? "bg-emerald-500" : "bg-muted"}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {checks.map((c, i) =>
                  c.ok ? (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {c.label}
                    </span>
                  ) : (
                    <button
                      key={i}
                      onClick={() => setLocation(c.fix)}
                      className="inline-flex items-center gap-1 text-[11px] text-amber-600 hover:underline"
                    >
                      <Circle className="h-3 w-3" /> {c.label} — tamamla →
                    </button>
                  ),
                )}
              </div>
              {num(p.salePrice) > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Fiyat {formatTL(p.salePrice)} · Marj %{margin.toFixed(0)}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ------- Durum Raporu ------- */}
      {tab === "rapor" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="30 Gün Ciro" value={formatTL(model.revenue30)} />
            <Stat label="30 Gün Gider" value={formatTL(model.expense30)} tone="text-amber-600" />
            <Stat
              label="30 Gün Net"
              value={formatTL(model.net30)}
              tone={model.net30 >= 0 ? "text-emerald-600" : "text-rose-600"}
            />
            <Stat
              label="Tahsil Edilecek"
              value={formatTL(model.receivables)}
              tone={model.receivables > 0 ? "text-rose-600" : "text-emerald-600"}
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="30 Gün Sipariş" value={String(model.recentCount)} />
            <Stat label="Stok Değeri" value={formatTL(model.stockValue)} />
            <Stat
              label="Kritik Stok"
              value={String(model.critical.length)}
              tone={model.critical.length > 0 ? "text-rose-600" : "text-emerald-600"}
            />
            <Stat label="Yaklaşan Kampanya" value={String(model.upcomingCampaigns.length)} />
          </div>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Ürün Kâr/Zarar Tablosu</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-2">Ürün</th>
                    <th className="py-2 pr-2 text-right">Maliyet</th>
                    <th className="py-2 pr-2 text-right">Net Fiyat</th>
                    <th className="py-2 pr-2 text-right">Kâr</th>
                    <th className="py-2 text-right">Marj</th>
                  </tr>
                </thead>
                <tbody>
                  {[...model.productRows]
                    .sort((a, b) => a.margin - b.margin)
                    .map(r => (
                      <tr key={r.p.id} className="border-b last:border-0">
                        <td className="py-2 pr-2 max-w-[220px] truncate">{r.p.name}</td>
                        <td className="py-2 pr-2 text-right">{formatTL(r.totalCost)}</td>
                        <td className="py-2 pr-2 text-right">{formatTL(r.netPrice)}</td>
                        <td
                          className={`py-2 pr-2 text-right font-medium ${r.profit < 0 ? "text-rose-600" : "text-emerald-600"}`}
                        >
                          {formatTL(r.profit)}
                        </td>
                        <td
                          className={`py-2 text-right font-semibold ${r.margin < 0 ? "text-rose-600" : r.margin < 20 ? "text-amber-600" : "text-emerald-600"}`}
                        >
                          %{r.margin.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 space-y-2">
              <h2 className="font-semibold">Kanal Dağılımı (30 gün)</h2>
              {model.byChannel.length === 0 ? (
                <p className="text-sm text-muted-foreground">Son 30 günde sipariş yok.</p>
              ) : (
                model.byChannel.map(([ch, s]) => (
                  <div key={ch} className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">{ch}</Badge>
                    <span className="flex-1" />
                    <span className="text-muted-foreground">{s.count} sipariş</span>
                    <span className="font-medium w-28 text-right">{formatTL(s.revenue)}</span>
                  </div>
                ))
              )}
            </Card>
            <Card className="p-5 space-y-2">
              <h2 className="font-semibold">En Çok Satanlar</h2>
              {model.topSellers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz kalemli satış verisi yok.</p>
              ) : (
                model.topSellers.map(([name, qty]) => (
                  <div key={name} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{name}</span>
                    <span className="font-semibold">{qty} adet</span>
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ------- Strateji Rehberi ------- */}
      {tab === "strateji" && (
        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Verilerinden Çıkan Öneriler
            </h2>
            {model.tips.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    t.severity === "high"
                      ? "text-rose-500"
                      : t.severity === "mid"
                        ? "text-amber-500"
                        : "text-sky-500"
                  }`}
                />
                <span className="flex-1">{t.text}</span>
                {t.go && (
                  <button
                    onClick={() => setLocation(t.go!)}
                    className="text-primary text-xs hover:underline whitespace-nowrap"
                  >
                    Git →
                  </button>
                )}
              </div>
            ))}
          </Card>

          <Accordion type="multiple" className="space-y-2">
            <PlaybookSection
              value="urun"
              icon={<Target className="h-4 w-4 text-primary" />}
              title="Ürün Geliştirme Stratejisi"
              items={[
                ["Seri mantığıyla büyü", "Tek tek ürün yerine seri çıkar (Meteor, Vivid, Candy gibi). Seri; raf düzeni, ambalaj ve pazarlamada tekrar kullanılabilir kimlik demektir. Yeni renk eklemek yeni ürün icat etmekten 10 kat ucuzdur."],
                ["80/20 kuralını uygula", "Cironun çoğunu getiren %20'lik ürün grubunu belirle (Durum Raporu → En Çok Satanlar). Yeni geliştirmeleri önce bu kazanan ailelerin türevlerine harca: yeni hacim (0.5L/1L), yeni yüzey uyumu, yeni efekt."],
                ["Her geliştirmeyi kayıt altına al", "Ürün Geliştirme modülündeki deneme günlüğü senin en değerli varlığın: tutmayan reçete bile bilgidir. 6 ay sonra aynı hatayı tekrar denememek paradan tasarruftur."],
                ["Müşteri talebinden beslen", "Instagram DM'leri ve Trendyol sorularında en çok istenen renk/efekt taleplerini haftalık not et. 3+ kez istenen şey geliştirme projesi olmayı hak eder."],
                ["Küçük parti test satışı", "Yeni ürünü stoklara boğulmadan önce 10-20 adetlik parti ile Instagram'dan ön satışa çıkar. Talep gör, sonra üretimi büyüt."],
                ["Sezonluk planla", "Modifiye/oto boyama ilkbahar-yaz, hobi ürünleri sonbahar-kış güçlenir. Geliştirme takvimini sezonun 2 ay önüne koy."],
              ]}
            />
            <PlaybookSection
              value="marka"
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              title="Marka Geliştirme Stratejisi"
              items={[
                ["Önce/sonra içeriği kral", "Boya görsel bir üründür: her ürün için mutlaka uygulama öncesi/sonrası video çek. 15-30 saniyelik dönüşüm videoları en yüksek etkileşimi alır."],
                ["Haftalık içerik ritmi", "Haftada minimum 3 gönderi: 1 ürün tanıtımı, 1 uygulama/eğitim, 1 müşteri işi paylaşımı. Düzenlilik algoritmalarda erişimden daha önemlidir."],
                ["Müşteri işlerini sergile", "Ürününü kullanan boyacı ve sanatçıların işlerini izinle paylaş, etiketle. Onlar da seni paylaşır — bedava ve en güvenilir reklam budur."],
                ["Ambalaj ve etiket tutarlılığı", "Tüm serilerde aynı logo yerleşimi, aynı yazı tipi, seri başına renk kodu. Rafta ve fotoğrafta tanınırlık marka değerinin yarısıdır."],
                ["Uzmanlığını göster", "1K/2K farkı, bazkat nedir, hangi yüzeye hangi astar gibi eğitici içerikler seni 'satıcı' değil 'usta' konumuna taşır. İnsanlar ustadan alışveriş yapar."],
                ["Yorum ve puan iste", "Her Trendyol teslimatından sonra pakete küçük bir teşekkür kartı koy: 'Sonucu etiketle, yorum bırak'. Yüksek puan sıralamayı, sıralama satışı getirir."],
              ]}
            />
            <PlaybookSection
              value="kar"
              icon={<Target className="h-4 w-4 text-primary" />}
              title="Kâr/Zarar Yönetimi Stratejisi"
              items={[
                ["Marj tabanı belirle", "Her ürün için minimum %30 brüt marj hedefle (butik üretimde %40-50 sağlıklıdır). Durum Raporu tablosunda %20 altındakiler sarı, zarardakiler kırmızı görünür — düzenli kontrol et."],
                ["Maliyeti formülden takip et", "Hammadde fiyatı değişince Stok sayfasında birim maliyeti güncelle — tüm ürünlerin gerçek maliyeti otomatik değişir. Eski maliyetle fiyatlama sessiz zarar üretir."],
                ["Kargoyu fiyata katmayı unutma", "E-ticarette en sık kâr kaçağı kargodur. Kargo maliyetini ürün maliyetine dahil et; 'ücretsiz kargo' veriyorsan bunun fiyat içinde olduğundan emin ol."],
                ["İndirimi marjdan hesapla", "%X indirim cirodan değil kârdan gider: %40 marjlı üründe %20 indirim kârın yarısını götürür. Kampanya indirimini marj tablosuna bakarak belirle."],
                ["Ayda bir kâr turu yap", "Her ay bu sayfadaki Durum Raporu'na 10 dakika ayır: zarardaki ürünler, düşen marjlar, stok değeri. Küçük işletmede aylık ritim yıllık sürprizleri önler."],
                ["Ölü stoğu paraya çevir", "6 aydır satılmayan ürünü kampanyayla erit — raftaki ürün para değil, donmuş maliyettir. Maliyetine satmak bile depoda çürümesinden iyidir."],
              ]}
            />
            <PlaybookSection
              value="satis"
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              title="Satış Arttırma Stratejisi"
              items={[
                ["Set/paket satışı kur", "Boya + vernik + astar setleri sepet tutarını %50-80 artırır. 'Komple Rötuş Seti' gibi hazır paketler karar yorgunluğunu da azaltır — yeni müşteri için en kolay giriş kapısıdır."],
                ["Trendyol listelemeni parlat", "Başlıkta arama kelimeleri (rötuş boyası, bukalemun boya, airbrush), 5+ fotoğraf, video ve dolu özellik tablosu sıralamayı belirler. AI Pazarlama sekmesinden SEO açıklaması üretebilirsin."],
                ["Kampanya döngüsü işlet", "Ayda 1 tema: 'Ayın Rengi', sezon açılışı, özel gün. Kampanya Takvimi'ne işle — düzenli kampanya müşteride 'takip etme' alışkanlığı yaratır."],
                ["Tekrar satın alma tetikle", "Boya biten üründür. Sipariş üzerinden 45-60 gün geçen müşterilere Instagram/WhatsApp'tan nazik hatırlatma + küçük kupon işe yarar."],
                ["Kanal çeşitlendir", "Tek pazaryerine bağımlılık kural değişikliğinde seni savunmasız bırakır. Trendyol + Instagram DM + Hepsiburada üçlüsü sağlıklı dağılımdır (Durum Raporu → Kanal Dağılımı'nı izle)."],
                ["B2B tarafını büyüt", "Oto boyacıları ve kaporta atölyeleri düzenli hacim demektir. 10+ adet alımlara özel toptan fiyat listesi çıkar; tek kurumsal müşteri 50 perakende müşteriye bedeldir."],
              ]}
            />
          </Accordion>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className={`text-xl font-bold leading-none ${tone}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </Card>
  );
}

function PlaybookSection({
  value,
  icon,
  title,
  items,
}: {
  value: string;
  icon: React.ReactNode;
  title: string;
  items: [string, string][];
}) {
  return (
    <AccordionItem value={value} className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 font-semibold text-sm">
          {icon} {title}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-4">
        {items.map(([head, body], i) => (
          <div key={i} className="text-sm">
            <p className="font-medium">{i + 1}. {head}</p>
            <p className="text-muted-foreground">{body}</p>
          </div>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}
