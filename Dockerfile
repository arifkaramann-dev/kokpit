# Kokpit — tek kaplama (container) içinde uygulama.
#
# ── Neden tek aşama, neden dev bağımlılıkları da duruyor ────────────────────
# Açılışta `pnpm db:migrate` koşuyor ve o komut `drizzle-kit`'i çağırıyor;
# drizzle-kit ise devDependencies altında. Üretim bağımlılıklarına indirmek
# (`pnpm prune --prod`) imajı küçültürdü ama migration'ı çalıştıramaz hale
# getirirdi — yani ilk açılışta veritabanı hiç kurulmazdı. Render'da da aynı
# sebeple tüm bağımlılıklar kurulu; buradaki kurulumun oradan sapmaması,
# "yerelde çalışıyor, canlıda çalışmıyor" farkını baştan engelliyor.

# Sürüm Render'daki NODE_VERSION ile aynı: "yerelde çalışıyor, canlıda
# çalışmıyor" farkının en sık sebebi sürüm kayması.
FROM node:22.16.0-slim

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Bağımlılıklar ÖNCE: kaynak dosya değişince bu katman yeniden kurulmasın.
# Kod değişikliğinde imaj yeniden derlenirken pnpm install atlanıyor, yani
# "değişikliği gör" turu dakikalar değil saniyeler sürüyor.
#
# `patches/` de bu adımda lazım: package.json bir pakete yama uyguluyor
# (`pnpm.patchedDependencies` → wouter). Yama dosyası ortada yoksa pnpm
# kurulumun ORTASINDA ENOENT ile düşüyor ve hata "paket bulunamadı" gibi
# değil, okunması zor bir yığın izi olarak çıkıyor.
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000

# Render'daki startCommand ile AYNI: önce migration, sonra sunucu.
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
