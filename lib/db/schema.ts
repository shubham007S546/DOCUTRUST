import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const tenants = pgTable('docutrust_tenants', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  mode: text('mode').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const documents = pgTable('docutrust_documents', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  title: text('title').notNull(),
  sourceType: varchar('source_type', { length: 32 }).notNull(),
  mimeType: text('mime_type').notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  sha256: text('sha256').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const queryRuns = pgTable('docutrust_query_runs', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: text('actor_id'),
  question: text('question').notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  answer: text('answer'),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  evidence: jsonb('evidence').notNull().default([]),
  trace: jsonb('trace').notNull().default([]),
  modelId: text('model_id'),
  promptVersion: text('prompt_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

export const reviews = pgTable('docutrust_reviews', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  queryRunId: uuid('query_run_id').notNull(),
  reviewerId: text('reviewer_id').notNull(),
  decision: varchar('decision', { length: 24 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const documentChunks = pgTable('docutrust_document_chunks', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  documentId: uuid('document_id').notNull(),
  versionLabel: text('version_label').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
})
