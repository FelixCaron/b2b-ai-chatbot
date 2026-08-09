export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          stripe_customer_id: string | null
          plan: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          stripe_customer_id?: string | null
          plan?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          stripe_customer_id?: string | null
          plan?: string
          created_at?: string
        }
      }
      sites: {
        Row: {
          id: string
          tenant_id: string
          domain: string
          public_key: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          domain: string
          public_key?: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          domain?: string
          public_key?: string
          created_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          tenant_id: string
          site_id: string
          url: string
          content: string
          embedding: number[] | null
          fts: unknown | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          site_id: string
          url: string
          content: string
          embedding?: number[] | null
          fts?: unknown | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          site_id?: string
          url?: string
          content?: string
          embedding?: number[] | null
          fts?: unknown | null
          created_at?: string
        }
      }
      usage: {
        Row: {
          tenant_id: string
          messages_count: number
          leads_count: number
          updated_at: string
        }
        Insert: {
          tenant_id: string
          messages_count?: number
          leads_count?: number
          updated_at?: string
        }
        Update: {
          tenant_id?: string
          messages_count?: number
          leads_count?: number
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          tenant_id: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          session_id?: string
          role?: 'user' | 'assistant'
          content?: string
          created_at?: string
        }
      }
      leads: {
        Row: {
          id: string
          tenant_id: string
          name: string | null
          email: string | null
          phone: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string
        }
      }
    }
    Functions: {
      match_documents_hybrid: {
        Args: {
          query_text: string
          query_embedding: number[]
          match_tenant_id: string
          match_count?: number
          full_text_weight?: number
          semantic_weight?: number
          rrf_k?: number
        }
        Returns: {
          id: string
          content: string
          url: string
        }[]
      }
    }
  }
}
