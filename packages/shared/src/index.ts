import { z } from 'zod';

export * from './database.types.js';

// Chat Edge Function payload schema
export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  tenant_public_key: z.string().uuid('Invalid tenant public key'),
  session_id: z.string().min(1, 'Session ID is required')
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// Start Scan Edge Function payload schema
export const StartScanSchema = z.object({
  site_id: z.string().uuid('Invalid site ID'),
  tenant_id: z.string().uuid('Invalid tenant ID'),
  url: z.string().url('Invalid URL to scan')
});

export type StartScanRequest = z.infer<typeof StartScanSchema>;

// Lead Capture Schema
export const LeadSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().optional()
});

export type LeadPayload = z.infer<typeof LeadSchema>;

// PGMQ Ingestion Worker message schema
export const IngestionTaskSchema = z.object({
  site_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  url: z.string().url()
});

export type IngestionTask = z.infer<typeof IngestionTaskSchema>;
