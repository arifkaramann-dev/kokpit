// Tüm tRPC router'larının bileşimi. Uygulama mantığı server/modules/ altında
// domain dosyalarındadır (urun/satis/finans/pazarlama/sistem); burada yalnızca
// appRouter bileşimi ve dışa açılan tipler durur. (Sprint 2 / V2 Faz 0.4)
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { materialsRouter, productsRouter, productionRouter, formulaRouter, seriesRouter } from "./modules/urun";
import { crmRouter, ordersRouter, quotesRouter } from "./modules/satis";
import {
  purchasesRouter, reportRouter, customersRouter, chequesRouter, accountsRouter, transactionsRouter, expensesRouter, suppliersRouter, invoicesRouter, kargoRouter, reconcileRouter,
} from "./modules/finans";
import {
  devRouter, questionsRouter, templatesRouter, campaignsRouter, marketingRouter, storefrontRouter, couponsRouter,
} from "./modules/pazarlama";
import {
  authRouter, assistantRouter, settingsRouter, notificationsRouter, tasksRouter, dashboardRouter, whatsappRouter, hbTestRouter,
} from "./modules/sistem";

// Eski dışa aktarım korunur (testler ve olası tüketiciler için).
export { itemsTotal, summarizeItems } from "./orderUtils";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  materials: materialsRouter,
  products: productsRouter,
  production: productionRouter,
  formula: formulaRouter,
  series: seriesRouter,
  orders: ordersRouter,
  quotes: quotesRouter,
  crm: crmRouter,
  dev: devRouter,
  assistant: assistantRouter,
  settings: settingsRouter,
  notifications: notificationsRouter,
  questions: questionsRouter,
  tasks: tasksRouter,
  templates: templatesRouter,
  purchases: purchasesRouter,
  report: reportRouter,
  customers: customersRouter,
  cheques: chequesRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  expenses: expensesRouter,
  suppliers: suppliersRouter,
  campaigns: campaignsRouter,
  marketing: marketingRouter,
  dashboard: dashboardRouter,
  storefront: storefrontRouter,
  coupons: couponsRouter,
  whatsapp: whatsappRouter,
  hbTest: hbTestRouter,
  invoices: invoicesRouter,
  kargo: kargoRouter,
  reconcile: reconcileRouter,
});

export type AppRouter = typeof appRouter;
