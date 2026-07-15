import { mysqlEnum, mysqlTable, text, timestamp, varchar, date, decimal, boolean, int } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: varchar("id", { length: 36 }).primaryKey().notNull(), // UUID için varchar ve notNull
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const usersRelations = relations(users, ({ many }) => ({
  pdfDocuments: many(pdfDocuments),
  transactions: many(transactions),
  userCategoryCorrections: many(userCategoryCorrections),
}));

export const pdfDocuments = mysqlTable("pdf_documents", {
  id: varchar("id", { length: 36 }).primaryKey().notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  filename: text("filename").notNull(),
  filepath: text("filepath").notNull(),
  uploadDate: timestamp("upload_date").defaultNow().notNull(),
  documentType: mysqlEnum("document_type", ["DAILY_CARD_MOVEMENT", "MONTHLY_STATEMENT"]).notNull(),
  checksum: varchar("checksum", { length: 255 }).notNull().unique(), // Duplicate kontrolü için
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const pdfDocumentsRelations = relations(pdfDocuments, ({ one, many }) => ({
  user: one(users, { fields: [pdfDocuments.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const transactions = mysqlTable("transactions", {
  id: varchar("id", { length: 36 }).primaryKey().notNull(),
  pdfDocumentId: varchar("pdf_document_id", { length: 36 }).notNull().references(() => pdfDocuments.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  transactionDate: date("transaction_date").notNull(),
  transactionTime: timestamp("transaction_time").notNull(), // MySQL TIME tipi için timestamp yeterli
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  last4DigitsOfCard: varchar("last_4_digits_of_card", { length: 4 }),
  isRefund: boolean("is_refund").default(false).notNull(),
  provisionNumber: varchar("provision_number", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  pdfDocument: one(pdfDocuments, { fields: [transactions.pdfDocumentId], references: [pdfDocuments.id] }),
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  aiAnalysis: one(aiAnalyses, { fields: [transactions.id], references: [aiAnalyses.transactionId] }),
  installment: one(installments, { fields: [transactions.id], references: [installments.transactionId] }),
}));

export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 36 }).primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  isPredefined: boolean("is_predefined").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  aiAnalyses: many(aiAnalyses),
  userCategoryCorrections: many(userCategoryCorrections),
}));

export const aiAnalyses = mysqlTable("ai_analyses", {
  id: varchar("id", { length: 36 }).primaryKey().notNull(),
  transactionId: varchar("transaction_id", { length: 36 }).notNull().unique().references(() => transactions.id),
  classification: mysqlEnum("classification", ["BUSINESS", "PERSONAL", "UNCERTAIN"]).notNull(), // İşletme, Kişisel, Belirsiz
  suggestedCategoryId: varchar("suggested_category_id", { length: 36 }).notNull().references(() => categories.id),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).notNull(), // % olarak, örn: 96.00
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const aiAnalysesRelations = relations(aiAnalyses, ({ one }) => ({
  transaction: one(transactions, { fields: [aiAnalyses.transactionId], references: [transactions.id] }),
  suggestedCategory: one(categories, { fields: [aiAnalyses.suggestedCategoryId], references: [categories.id] }),
}));

export const userCategoryCorrections = mysqlTable("user_category_corrections", {
  id: varchar("id", { length: 36 }).primaryKey().notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  correctedCategoryId: varchar("corrected_category_id", { length: 36 }).notNull().references(() => categories.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const userCategoryCorrectionsRelations = relations(userCategoryCorrections, ({ one }) => ({
  user: one(users, { fields: [userCategoryCorrections.userId], references: [users.id] }),
  correctedCategory: one(categories, { fields: [userCategoryCorrections.correctedCategoryId], references: [categories.id] }),
}));

export const installments = mysqlTable("installments", {
  id: varchar("id", { length: 36 }).primaryKey().notNull(),
  transactionId: varchar("transaction_id", { length: 36 }).notNull().unique().references(() => transactions.id),
  totalInstallments: int("total_installments").notNull(),
  remainingInstallments: int("remaining_installments").notNull(),
  monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }).notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const installmentsRelations = relations(installments, ({ one }) => ({
  transaction: one(transactions, { fields: [installments.transactionId], references: [transactions.id] }),
}));
