export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_balances: {
        Row: {
          account_id: string
          balance: number
          credit_total: number
          debit_total: number
          id: string
          org_id: string
          period_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          balance?: number
          credit_total?: number
          debit_total?: number
          id?: string
          org_id: string
          period_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          balance?: number
          credit_total?: number
          debit_total?: number
          id?: string
          org_id?: string
          period_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_balances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_balances_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_settings: {
        Row: {
          auto_post_bills: boolean
          auto_post_expenses: boolean
          auto_post_invoices: boolean
          auto_post_payments: boolean
          created_at: string
          default_ap_account_id: string | null
          default_ar_account_id: string | null
          default_cash_account_id: string | null
          default_cogs_account_id: string | null
          default_expense_account_id: string | null
          default_revenue_account_id: string | null
          default_tax_payable_account_id: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          auto_post_bills?: boolean
          auto_post_expenses?: boolean
          auto_post_invoices?: boolean
          auto_post_payments?: boolean
          created_at?: string
          default_ap_account_id?: string | null
          default_ar_account_id?: string | null
          default_cash_account_id?: string | null
          default_cogs_account_id?: string | null
          default_expense_account_id?: string | null
          default_revenue_account_id?: string | null
          default_tax_payable_account_id?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          auto_post_bills?: boolean
          auto_post_expenses?: boolean
          auto_post_invoices?: boolean
          auto_post_payments?: boolean
          created_at?: string
          default_ap_account_id?: string | null
          default_ar_account_id?: string | null
          default_cash_account_id?: string | null
          default_cogs_account_id?: string | null
          default_expense_account_id?: string | null
          default_revenue_account_id?: string | null
          default_tax_payable_account_id?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_settings_default_ap_account_id_fkey"
            columns: ["default_ap_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_settings_default_ar_account_id_fkey"
            columns: ["default_ar_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_settings_default_cash_account_id_fkey"
            columns: ["default_cash_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_settings_default_cogs_account_id_fkey"
            columns: ["default_cogs_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_settings_default_expense_account_id_fkey"
            columns: ["default_expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_settings_default_revenue_account_id_fkey"
            columns: ["default_revenue_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_settings_default_tax_payable_account_id_fkey"
            columns: ["default_tax_payable_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["crm_entity_type"] | null
          id: string
          org_id: string
          owner_id: string | null
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          org_id: string
          owner_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          org_id?: string
          owner_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_policies: {
        Row: {
          action_key: string
          created_at: string
          id: string
          mode: string
          org_id: string
          updated_at: string
        }
        Insert: {
          action_key: string
          created_at?: string
          id?: string
          mode?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          created_at?: string
          id?: string
          mode?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_actions: {
        Row: {
          action_status: Database["public"]["Enums"]["ai_action_status"]
          capability: string | null
          conversation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string
          model: string | null
          module: string
          org_id: string
          output: string | null
          prompt: string | null
          tokens: number | null
          user_id: string
        }
        Insert: {
          action_status?: Database["public"]["Enums"]["ai_action_status"]
          capability?: string | null
          conversation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          model?: string | null
          module: string
          org_id: string
          output?: string | null
          prompt?: string | null
          tokens?: number | null
          user_id: string
        }
        Update: {
          action_status?: Database["public"]["Enums"]["ai_action_status"]
          capability?: string | null
          conversation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          model?: string | null
          module?: string
          org_id?: string
          output?: string | null
          prompt?: string | null
          tokens?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_actions: {
        Row: {
          action_type: string
          agent_id: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          org_id: string
          proposed_changes_json: Json
          requires_approval: boolean
          result_json: Json | null
          run_id: string | null
          status: Database["public"]["Enums"]["ai_agent_action_status"]
          target_entity_id: string | null
          target_entity_type: string | null
          target_module: string | null
        }
        Insert: {
          action_type: string
          agent_id: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          org_id: string
          proposed_changes_json?: Json
          requires_approval?: boolean
          result_json?: Json | null
          run_id?: string | null
          status?: Database["public"]["Enums"]["ai_agent_action_status"]
          target_entity_id?: string | null
          target_entity_type?: string | null
          target_module?: string | null
        }
        Update: {
          action_type?: string
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          org_id?: string
          proposed_changes_json?: Json
          requires_approval?: boolean
          result_json?: Json | null
          run_id?: string | null
          status?: Database["public"]["Enums"]["ai_agent_action_status"]
          target_entity_id?: string | null
          target_entity_type?: string | null
          target_module?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_approvals: {
        Row: {
          action_id: string
          agent_id: string
          approval_status: Database["public"]["Enums"]["ai_agent_approval_status"]
          created_at: string
          id: string
          org_id: string
          requested_by_agent: boolean
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string | null
        }
        Insert: {
          action_id: string
          agent_id: string
          approval_status?: Database["public"]["Enums"]["ai_agent_approval_status"]
          created_at?: string
          id?: string
          org_id: string
          requested_by_agent?: boolean
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
        }
        Update: {
          action_id?: string
          agent_id?: string
          approval_status?: Database["public"]["Enums"]["ai_agent_approval_status"]
          created_at?: string
          id?: string
          org_id?: string
          requested_by_agent?: boolean
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_approvals_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_approvals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_audit_logs: {
        Row: {
          action_id: string | null
          agent_id: string | null
          created_at: string
          event_description: string | null
          event_type: Database["public"]["Enums"]["ai_agent_audit_event"]
          id: string
          ip_address: unknown
          metadata_json: Json
          org_id: string
          run_id: string | null
          user_id: string | null
        }
        Insert: {
          action_id?: string | null
          agent_id?: string | null
          created_at?: string
          event_description?: string | null
          event_type: Database["public"]["Enums"]["ai_agent_audit_event"]
          id?: string
          ip_address?: unknown
          metadata_json?: Json
          org_id: string
          run_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_id?: string | null
          agent_id?: string | null
          created_at?: string
          event_description?: string | null
          event_type?: Database["public"]["Enums"]["ai_agent_audit_event"]
          id?: string
          ip_address?: unknown
          metadata_json?: Json
          org_id?: string
          run_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_audit_logs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_audit_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_audit_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_external_connections: {
        Row: {
          config_json: Json
          connection_name: string
          connection_type: string
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          org_id: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          config_json?: Json
          connection_name: string
          connection_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          org_id: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          config_json?: Json
          connection_name?: string
          connection_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          org_id?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_external_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_knowledge_sources: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          org_id: string
          source_config_json: Json
          source_name: string
          source_type: Database["public"]["Enums"]["ai_agent_knowledge_source_type"]
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          org_id: string
          source_config_json?: Json
          source_name: string
          source_type: Database["public"]["Enums"]["ai_agent_knowledge_source_type"]
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          org_id?: string
          source_config_json?: Json
          source_name?: string
          source_type?: Database["public"]["Enums"]["ai_agent_knowledge_source_type"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_knowledge_sources_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_memory: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          memory_key: string
          memory_value: Json
          org_id: string
          source: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["ai_agent_memory_visibility"]
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          memory_key: string
          memory_value?: Json
          org_id: string
          source?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["ai_agent_memory_visibility"]
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          memory_key?: string
          memory_value?: Json
          org_id?: string
          source?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["ai_agent_memory_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_memory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_memory_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_messages: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          metadata_json: Json
          org_id: string
          role: Database["public"]["Enums"]["ai_agent_message_role"]
          run_id: string
        }
        Insert: {
          agent_id: string
          content?: string
          created_at?: string
          id?: string
          metadata_json?: Json
          org_id: string
          role: Database["public"]["Enums"]["ai_agent_message_role"]
          run_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata_json?: Json
          org_id?: string
          role?: Database["public"]["Enums"]["ai_agent_message_role"]
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_messages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_permissions: {
        Row: {
          agent_id: string
          can_create: boolean
          can_delete: boolean
          can_execute_action: boolean
          can_read: boolean
          can_update: boolean
          created_at: string
          id: string
          module_key: string
          org_id: string
        }
        Insert: {
          agent_id: string
          can_create?: boolean
          can_delete?: boolean
          can_execute_action?: boolean
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          id?: string
          module_key: string
          org_id: string
        }
        Update: {
          agent_id?: string
          can_create?: boolean
          can_delete?: boolean
          can_execute_action?: boolean
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          id?: string
          module_key?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_permissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_runs: {
        Row: {
          agent_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          input_payload: Json
          model_used: string | null
          org_id: string
          output_summary: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ai_agent_run_status"]
          tokens_used: number | null
          trigger_type: Database["public"]["Enums"]["ai_agent_trigger_kind"]
          triggered_by_user_id: string | null
        }
        Insert: {
          agent_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_payload?: Json
          model_used?: string | null
          org_id: string
          output_summary?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ai_agent_run_status"]
          tokens_used?: number | null
          trigger_type?: Database["public"]["Enums"]["ai_agent_trigger_kind"]
          triggered_by_user_id?: string | null
        }
        Update: {
          agent_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_payload?: Json
          model_used?: string | null
          org_id?: string
          output_summary?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ai_agent_run_status"]
          tokens_used?: number | null
          trigger_type?: Database["public"]["Enums"]["ai_agent_trigger_kind"]
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_tool_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          credential_name: string
          encrypted_secret_reference: string
          id: string
          org_id: string
          provider: string | null
          tool_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credential_name: string
          encrypted_secret_reference: string
          id?: string
          org_id: string
          provider?: string | null
          tool_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credential_name?: string
          encrypted_secret_reference?: string
          id?: string
          org_id?: string
          provider?: string | null
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_tool_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_tool_credentials_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_tools: {
        Row: {
          agent_id: string
          config_json: Json
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          org_id: string
          requires_approval: boolean
          tool_name: string
          tool_type: Database["public"]["Enums"]["ai_agent_tool_type"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          config_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          org_id: string
          requires_approval?: boolean
          tool_name: string
          tool_type: Database["public"]["Enums"]["ai_agent_tool_type"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          org_id?: string
          requires_approval?: boolean
          tool_name?: string
          tool_type?: Database["public"]["Enums"]["ai_agent_tool_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_tools_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_triggers: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_enabled: boolean
          org_id: string
          trigger_config_json: Json
          trigger_name: string
          trigger_type: Database["public"]["Enums"]["ai_agent_trigger_kind"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          org_id: string
          trigger_config_json?: Json
          trigger_name: string
          trigger_type: Database["public"]["Enums"]["ai_agent_trigger_kind"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          org_id?: string
          trigger_config_json?: Json
          trigger_name?: string
          trigger_type?: Database["public"]["Enums"]["ai_agent_trigger_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_triggers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_triggers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_webhooks: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_enabled: boolean
          last_received_at: string | null
          org_id: string
          secret_token_reference: string | null
          updated_at: string
          webhook_name: string
          webhook_url_slug: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_received_at?: string | null
          org_id: string
          secret_token_reference?: string | null
          updated_at?: string
          webhook_name: string
          webhook_url_slug: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_received_at?: string | null
          org_id?: string
          secret_token_reference?: string | null
          updated_at?: string
          webhook_name?: string
          webhook_url_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_webhooks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_webhooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          agent_type: string
          avatar_url: string | null
          created_at: string
          description: string | null
          id: string
          last_run_at: string | null
          max_tokens: number
          memory_enabled: boolean
          model_name: string
          model_provider: string
          name: string
          org_id: string
          owner_user_id: string | null
          requires_approval: boolean
          status: Database["public"]["Enums"]["ai_agent_status"]
          system_prompt: string | null
          temperature: number
          updated_at: string
        }
        Insert: {
          agent_type?: string
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_run_at?: string | null
          max_tokens?: number
          memory_enabled?: boolean
          model_name?: string
          model_provider?: string
          name: string
          org_id: string
          owner_user_id?: string | null
          requires_approval?: boolean
          status?: Database["public"]["Enums"]["ai_agent_status"]
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
        }
        Update: {
          agent_type?: string
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_run_at?: string | null
          max_tokens?: number
          memory_enabled?: boolean
          model_name?: string
          model_provider?: string
          name?: string
          org_id?: string
          owner_user_id?: string | null
          requires_approval?: boolean
          status?: Database["public"]["Enums"]["ai_agent_status"]
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_logs: {
        Row: {
          cached_tokens: number | null
          cost_usd: number | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input_tokens: number | null
          model: string
          org_id: string
          output_tokens: number | null
          provider: Database["public"]["Enums"]["ai_provider_kind"]
          provider_config_id: string | null
          purpose: string
          source: string | null
          status: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cached_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          model: string
          org_id: string
          output_tokens?: number | null
          provider: Database["public"]["Enums"]["ai_provider_kind"]
          provider_config_id?: string | null
          purpose: string
          source?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cached_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          model?: string
          org_id?: string
          output_tokens?: number | null
          provider?: Database["public"]["Enums"]["ai_provider_kind"]
          provider_config_id?: string | null
          purpose?: string
          source?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_logs_provider_config_id_fkey"
            columns: ["provider_config_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          archived: boolean
          capability: string | null
          context: Json
          created_at: string
          id: string
          module: string | null
          org_id: string
          snapshot: string | null
          snapshot_at: string | null
          summarized_upto: string | null
          summary: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          capability?: string | null
          context?: Json
          created_at?: string
          id?: string
          module?: string | null
          org_id: string
          snapshot?: string | null
          snapshot_at?: string | null
          summarized_upto?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          capability?: string | null
          context?: Json
          created_at?: string
          id?: string
          module?: string | null
          org_id?: string
          snapshot?: string | null
          snapshot_at?: string | null
          summarized_upto?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          model: string | null
          org_id: string
          role: Database["public"]["Enums"]["ai_message_role"]
          tokens: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          org_id: string
          role: Database["public"]["Enums"]["ai_message_role"]
          tokens?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["ai_message_role"]
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_routes: {
        Row: {
          id: string
          max_output_tokens: number | null
          model: string
          org_id: string
          provider_config_id: string | null
          purpose: string
          updated_at: string
        }
        Insert: {
          id?: string
          max_output_tokens?: number | null
          model: string
          org_id: string
          provider_config_id?: string | null
          purpose: string
          updated_at?: string
        }
        Update: {
          id?: string
          max_output_tokens?: number | null
          model?: string
          org_id?: string
          provider_config_id?: string | null
          purpose?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_routes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_model_routes_provider_config_id_fkey"
            columns: ["provider_config_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_org_policies: {
        Row: {
          allow_builtin: boolean
          default_provider_config_id: string | null
          monthly_budget_usd: number | null
          org_id: string
          own_provider_only_modules: string[]
          updated_at: string
        }
        Insert: {
          allow_builtin?: boolean
          default_provider_config_id?: string | null
          monthly_budget_usd?: number | null
          org_id: string
          own_provider_only_modules?: string[]
          updated_at?: string
        }
        Update: {
          allow_builtin?: boolean
          default_provider_config_id?: string | null
          monthly_budget_usd?: number | null
          org_id?: string
          own_provider_only_modules?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_org_policies_default_provider_config_id_fkey"
            columns: ["default_provider_config_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_org_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_proposed_actions: {
        Row: {
          action_key: string
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string
          org_id: string
          payload: Json
          result: Json | null
          status: string
          summary: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_key: string
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          org_id: string
          payload?: Json
          result?: Json | null
          status?: string
          summary?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_key?: string
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          org_id?: string
          payload?: Json
          result?: Json | null
          status?: string
          summary?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_proposed_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_configs: {
        Row: {
          base_url: string | null
          created_at: string
          created_by: string | null
          has_key: boolean
          id: string
          is_enabled: boolean
          key_last4: string | null
          label: string
          notes: string | null
          org_id: string
          provider: Database["public"]["Enums"]["ai_provider_kind"]
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          has_key?: boolean
          id?: string
          is_enabled?: boolean
          key_last4?: string | null
          label: string
          notes?: string | null
          org_id: string
          provider: Database["public"]["Enums"]["ai_provider_kind"]
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          has_key?: boolean
          id?: string
          is_enabled?: boolean
          key_last4?: string | null
          label?: string
          notes?: string | null
          org_id?: string
          provider?: Database["public"]["Enums"]["ai_provider_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_secrets: {
        Row: {
          api_key: string
          org_id: string
          provider_config_id: string
          updated_at: string
        }
        Insert: {
          api_key: string
          org_id: string
          provider_config_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          org_id?: string
          provider_config_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_provider_secrets_provider_config_id_fkey"
            columns: ["provider_config_id"]
            isOneToOne: true
            referencedRelation: "ai_provider_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          byo: boolean
          created_at: string
          id: number
          kind: string
          org_id: string
          user_id: string | null
        }
        Insert: {
          byo?: boolean
          created_at?: string
          id?: number
          kind: string
          org_id: string
          user_id?: string | null
        }
        Update: {
          byo?: boolean
          created_at?: string
          id?: number
          kind?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          org_id: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          org_id: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          duration_ms: number | null
          id: string
          method: string
          org_id: string
          path: string
          status: number
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          method: string
          org_id: string
          path: string
          status: number
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          method?: string
          org_id?: string
          path?: string
          status?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          id: string
          mime_type: string | null
          org_id: string
          path: string
          size_bytes: number
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          id?: string
          mime_type?: string | null
          org_id: string
          path: string
          size_bytes: number
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          org_id?: string
          path?: string
          size_bytes?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          org_id: string
          source: Database["public"]["Enums"]["attendance_source"]
          updated_at: string
          work_date: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          org_id: string
          source?: Database["public"]["Enums"]["attendance_source"]
          updated_at?: string
          work_date: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          source?: Database["public"]["Enums"]["attendance_source"]
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          org_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          org_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          last_run_at: string | null
          name: string
          org_id: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          last_run_at?: string | null
          name: string
          org_id: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          last_run_at?: string | null
          name?: string
          org_id?: string
          trigger?: Database["public"]["Enums"]["automation_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          finished_at: string | null
          id: string
          log: string | null
          matches: number
          notifications_created: number
          org_id: string
          rule_id: string
          started_at: string
          status: Database["public"]["Enums"]["automation_run_status"]
          tasks_created: number
        }
        Insert: {
          finished_at?: string | null
          id?: string
          log?: string | null
          matches?: number
          notifications_created?: number
          org_id: string
          rule_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["automation_run_status"]
          tasks_created?: number
        }
        Update: {
          finished_at?: string | null
          id?: string
          log?: string | null
          matches?: number
          notifications_created?: number
          org_id?: string
          rule_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["automation_run_status"]
          tasks_created?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          description: string | null
          event_type: string
          id: string
          org_id: string
          payload: Json | null
          stripe_event_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          description?: string | null
          event_type: string
          id?: string
          org_id: string
          payload?: Json | null
          stripe_event_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          description?: string | null
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json | null
          stripe_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          page_id: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          page_id: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          page_id?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          org_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          org_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          org_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_accounts: {
        Row: {
          account_email: string | null
          created_at: string
          id: string
          last_synced_at: string | null
          org_id: string
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          org_id: string
          provider: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          org_id?: string
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_channels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          last_delivery_at: string | null
          last_error: string | null
          name: string
          org_id: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          last_delivery_at?: string | null
          last_error?: string | null
          name: string
          org_id: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          last_delivery_at?: string | null
          last_error?: string | null
          name?: string
          org_id?: string
          updated_at?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_events: {
        Row: {
          account_id: string | null
          body: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          duration_minutes: number | null
          entity_id: string | null
          entity_type: string | null
          external_id: string | null
          id: string
          kind: string
          occurred_at: string
          org_id: string
          participants: Json
          source: string
          subject: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          body?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          duration_minutes?: number | null
          entity_id?: string | null
          entity_type?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          org_id: string
          participants?: Json
          source?: string
          subject: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          body?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          duration_minutes?: number | null
          entity_id?: string | null
          entity_type?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          org_id?: string
          participants?: Json
          source?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "comm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          archived: boolean
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          name: string
          org_id: string
          owner_id: string | null
          phone: string | null
          size: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          archived?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name: string
          org_id: string
          owner_id?: string | null
          phone?: string | null
          size?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          archived?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name?: string
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          size?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_tags: {
        Row: {
          company_id: string
          created_at: string
          org_id: string
          tag_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          org_id: string
          tag_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          org_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          org_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          org_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          org_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          archived: boolean
          company_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          lifecycle_stage: Database["public"]["Enums"]["lifecycle_stage"]
          notes: string | null
          org_id: string
          owner_id: string | null
          phone: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          lifecycle_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          notes?: string | null
          org_id: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          lifecycle_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_databases: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_databases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_databases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string
          database_id: string | null
          entity_type: string | null
          field_type: string
          id: string
          key: string
          label: string
          options: Json
          org_id: string
          required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          database_id?: string | null
          entity_type?: string | null
          field_type?: string
          id?: string
          key: string
          label: string
          options?: Json
          org_id: string
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          database_id?: string | null
          entity_type?: string | null
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json
          org_id?: string
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "custom_databases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_offerings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          modules: string[] | null
          name: string
          notes: string | null
          org_id: string
          override_currency: string | null
          override_interval: string | null
          override_limits: Json
          override_price: number | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          modules?: string[] | null
          name: string
          notes?: string | null
          org_id: string
          override_currency?: string | null
          override_interval?: string | null
          override_limits?: Json
          override_price?: number | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          modules?: string[] | null
          name?: string
          notes?: string | null
          org_id?: string
          override_currency?: string | null
          override_interval?: string | null
          override_limits?: Json
          override_price?: number | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_offerings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_records: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          data: Json
          database_id: string
          id: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          data?: Json
          database_id: string
          id?: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          data?: Json
          database_id?: string
          id?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_records_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "custom_databases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_access: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          org_id: string
          portal_user_id: string
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          org_id: string
          portal_user_id: string
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          org_id?: string
          portal_user_id?: string
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_access_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_users: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          email: string
          full_name: string | null
          id: string
          invited_at: string | null
          is_primary: boolean
          last_login_at: string | null
          org_id: string
          status: Database["public"]["Enums"]["portal_user_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          is_primary?: boolean
          last_login_at?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["portal_user_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          is_primary?: boolean
          last_login_at?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["portal_user_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_users_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      database_views: {
        Row: {
          created_at: string
          database_id: string
          filters: Json
          group_by: string | null
          id: string
          name: string
          org_id: string
          sort_dir: string
          sort_field: string | null
          sort_order: number
          updated_at: string
          view_type: string
        }
        Insert: {
          created_at?: string
          database_id: string
          filters?: Json
          group_by?: string | null
          id?: string
          name?: string
          org_id: string
          sort_dir?: string
          sort_field?: string | null
          sort_order?: number
          updated_at?: string
          view_type?: string
        }
        Update: {
          created_at?: string
          database_id?: string
          filters?: Json
          group_by?: string | null
          id?: string
          name?: string
          org_id?: string
          sort_dir?: string
          sort_field?: string | null
          sort_order?: number
          updated_at?: string
          view_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "database_views_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "custom_databases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "database_views_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stages: {
        Row: {
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          org_id: string
          position: number
          probability: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          org_id: string
          position?: number
          probability?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          org_id?: string
          position?: number
          probability?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount: number
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          expected_close_date: string | null
          id: string
          org_id: string
          owner_id: string | null
          position: number
          probability: number
          stage_id: string | null
          status: Database["public"]["Enums"]["deal_status"]
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          expected_close_date?: string | null
          id?: string
          org_id: string
          owner_id?: string | null
          position?: number
          probability?: number
          stage_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          expected_close_date?: string | null
          id?: string
          org_id?: string
          owner_id?: string | null
          position?: number
          probability?: number
          stage_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_orgs: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          notes: string | null
          org_id: string
          seed_depth: string
          torn_down_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          notes?: string | null
          org_id: string
          seed_depth?: string
          torn_down_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          notes?: string | null
          org_id?: string
          seed_depth?: string
          torn_down_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_orgs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_manager_fk"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          created_at: string
          doc_type: string | null
          employee_id: string
          file_url: string | null
          id: string
          is_sensitive: boolean
          notes: string | null
          org_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          employee_id: string
          file_url?: string | null
          id?: string
          is_sensitive?: boolean
          notes?: string | null
          org_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          employee_id?: string
          file_url?: string | null
          id?: string
          is_sensitive?: boolean
          notes?: string | null
          org_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          department_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_number: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          end_date: string | null
          first_name: string
          gender: string | null
          id: string
          job_title_id: string | null
          last_name: string
          manager_id: string | null
          notes: string | null
          org_id: string
          phone: string | null
          postal_code: string | null
          preferred_name: string | null
          start_date: string | null
          state: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_number?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          end_date?: string | null
          first_name: string
          gender?: string | null
          id?: string
          job_title_id?: string | null
          last_name: string
          manager_id?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          postal_code?: string | null
          preferred_name?: string | null
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_number?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          end_date?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          job_title_id?: string | null
          last_name?: string
          manager_id?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          postal_code?: string | null
          preferred_name?: string | null
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          billable: boolean
          billable_company_id: string | null
          billable_contact_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          expense_date: string
          expense_number: string | null
          id: string
          notes: string | null
          org_id: string
          payment_method_id: string | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["expense_status"]
          supplier_id: string | null
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          amount?: number
          billable?: boolean
          billable_company_id?: string | null
          billable_contact_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          expense_date?: string
          expense_number?: string | null
          id?: string
          notes?: string | null
          org_id: string
          payment_method_id?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          supplier_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          billable?: boolean
          billable_company_id?: string | null
          billable_contact_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          expense_date?: string
          expense_number?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          payment_method_id?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          supplier_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_billable_company_id_fkey"
            columns: ["billable_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_billable_contact_id_fkey"
            columns: ["billable_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          id: string
          is_closed: boolean
          name: string
          org_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          is_closed?: boolean
          name: string
          org_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          is_closed?: boolean
          name?: string
          org_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          id: string
          is_published: boolean
          name: string
          org_id: string
          slug: string
          submit_message: string
          target: string
          target_database_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_published?: boolean
          name: string
          org_id: string
          slug: string
          submit_message?: string
          target?: string
          target_database_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_published?: boolean
          name?: string
          org_id?: string
          slug?: string
          submit_message?: string
          target?: string
          target_database_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_definitions_target_database_id_fkey"
            columns: ["target_database_id"]
            isOneToOne: false
            referencedRelation: "custom_databases"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          created_at: string
          created_entity_id: string | null
          created_entity_type: string | null
          data: Json
          form_id: string
          id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          created_entity_id?: string | null
          created_entity_type?: string | null
          data?: Json
          form_id: string
          id?: string
          org_id: string
        }
        Update: {
          created_at?: string
          created_entity_id?: string | null
          created_entity_type?: string | null
          data?: Json
          form_id?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_events: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          org_id: string
          request_id: string
          route: string | null
          row_id: string | null
          table_name: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          org_id: string
          request_id: string
          route?: string | null
          row_id?: string | null
          table_name?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          org_id?: string
          request_id?: string
          route?: string | null
          row_id?: string | null
          table_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "impersonation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_requests: {
        Row: {
          approval_token_hash: string | null
          authorized_at: string | null
          authorized_by: string | null
          authorized_by_email: string | null
          created_at: string
          ended_at: string | null
          expires_at: string | null
          id: string
          org_id: string
          reason: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          approval_token_hash?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_email?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string | null
          id?: string
          org_id: string
          reason: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          approval_token_hash?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_email?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          reason?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_connections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          last_used_at: string | null
          org_id: string
          provider: string
          token: string
          token_last4: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          org_id: string
          provider: string
          token: string
          token_last4?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          org_id?: string
          provider?: string
          token?: string
          token_last4?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          created_at: string
          created_by: string | null
          errors: Json
          failed_rows: number
          file_name: string | null
          id: string
          imported_rows: number
          org_id: string
          source: string
          target: string
          target_database_id: string | null
          total_rows: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          errors?: Json
          failed_rows?: number
          file_name?: string | null
          id?: string
          imported_rows?: number
          org_id: string
          source?: string
          target: string
          target_database_id?: string | null
          total_rows?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          errors?: Json
          failed_rows?: number
          file_name?: string | null
          id?: string
          imported_rows?: number
          org_id?: string
          source?: string
          target?: string
          target_database_id?: string | null
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_runs_target_database_id_fkey"
            columns: ["target_database_id"]
            isOneToOne: false
            referencedRelation: "custom_databases"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_id: string | null
          notes: string | null
          org_id: string
          product_id: string
          quantity_delta: number
          reason: string
          variant_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_id?: string | null
          notes?: string | null
          org_id: string
          product_id: string
          quantity_delta: number
          reason: string
          variant_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_id?: string | null
          notes?: string | null
          org_id?: string
          product_id?: string
          quantity_delta?: number
          reason?: string
          variant_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string | null
          notes: string | null
          org_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          org_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          org_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string | null
          movement_type: Database["public"]["Enums"]["inv_movement_type"]
          notes: string | null
          org_id: string
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          unit_cost: number | null
          variant_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          movement_type: Database["public"]["Enums"]["inv_movement_type"]
          notes?: string | null
          org_id: string
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          variant_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          movement_type?: Database["public"]["Enums"]["inv_movement_type"]
          notes?: string | null
          org_id?: string
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          variant_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock: {
        Row: {
          id: string
          location_id: string | null
          org_id: string
          product_id: string
          quantity: number
          reserved: number
          updated_at: string
          variant_id: string | null
          warehouse_id: string
        }
        Insert: {
          id?: string
          location_id?: string | null
          org_id: string
          product_id: string
          quantity?: number
          reserved?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id: string
        }
        Update: {
          id?: string
          location_id?: string | null
          org_id?: string
          product_id?: string
          quantity?: number
          reserved?: number
          updated_at?: string
          variant_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          id: string
          invoice_id: string
          line_subtotal: number
          line_tax: number
          line_total: number
          org_id: string
          position: number
          product_id: string | null
          quantity: number
          tax_id: string | null
          tax_rate: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          discount_pct?: number
          id?: string
          invoice_id: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          invoice_id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_number_sequences: {
        Row: {
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          id: string
          next_value: number
          org_id: string
          padding: number
          prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          id?: string
          next_value?: number
          org_id: string
          padding?: number
          prefix?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          id?: string
          next_value?: number
          org_id?: string
          padding?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_number_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          due_date: string | null
          id: string
          issue_date: string
          notes: string | null
          number: string
          org_id: string
          owner_id: string | null
          quote_id: string | null
          sales_order_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          terms: string | null
          total: number
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          number: string
          org_id: string
          owner_id?: string | null
          quote_id?: string | null
          sales_order_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          terms?: string | null
          total?: number
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string
          org_id?: string
          owner_id?: string | null
          quote_id?: string | null
          sales_order_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          terms?: string | null
          total?: number
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      job_titles: {
        Row: {
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_titles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_titles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          entry_date: string
          entry_number: string | null
          id: string
          memo: string | null
          org_id: string
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          reversed_by: string | null
          source: Database["public"]["Enums"]["journal_source"]
          source_id: string | null
          status: Database["public"]["Enums"]["journal_status"]
          total_credit: number
          total_debit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_date?: string
          entry_number?: string | null
          id?: string
          memo?: string | null
          org_id: string
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          reversed_by?: string | null
          source?: Database["public"]["Enums"]["journal_source"]
          source_id?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_date?: string
          entry_number?: string | null
          id?: string
          memo?: string | null
          org_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          reversed_by?: string | null
          source?: Database["public"]["Enums"]["journal_source"]
          source_id?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          id: string
          journal_entry_id: string
          memo: string | null
          org_id: string
          position: number
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id: string
          memo?: string | null
          org_id: string
          position?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id?: string
          memo?: string | null
          org_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_docs: {
        Row: {
          collection: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          org_id: string
          source: string
          source_url: string | null
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          collection?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          org_id: string
          source?: string
          source_url?: string | null
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          collection?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          org_id?: string
          source?: string
          source_url?: string | null
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_docs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_name: string | null
          converted_company_id: string | null
          converted_contact_id: string | null
          converted_deal_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          estimated_value: number | null
          id: string
          job_title: string | null
          name: string
          notes: string | null
          org_id: string
          owner_id: string | null
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          converted_company_id?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          job_title?: string | null
          name: string
          notes?: string | null
          org_id: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          converted_company_id?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          job_title?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_company_id_fkey"
            columns: ["converted_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_deal_fkey"
            columns: ["converted_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          org_id: string
          reason: string | null
          requested_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          total_days: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          employee_id: string
          end_date: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          org_id: string
          reason?: string | null
          requested_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          total_days?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          org_id?: string
          reason?: string | null
          requested_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          total_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_connections: {
        Row: {
          client_id: string
          client_name: string | null
          created_at: string
          id: string
          last_used_at: string | null
          org_id: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          client_name?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          org_id: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          client_name?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          org_id?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_visible: boolean
          description: string | null
          due_date: string | null
          id: string
          name: string
          org_id: string
          position: number
          project_id: string
          status: Database["public"]["Enums"]["milestone_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_visible?: boolean
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          org_id: string
          position?: number
          project_id: string
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_visible?: boolean
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          org_id?: string
          position?: number
          project_id?: string
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          id: string
          org_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          id?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["crm_entity_type"]
          id?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          action_label: string | null
          audience_role: Database["public"]["Enums"]["app_role"] | null
          body: string | null
          created_at: string
          dismissed_at: string | null
          email_attempts: number
          email_due: boolean
          email_sent_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string | null
          link: string | null
          module: string | null
          org_id: string
          read_at: string | null
          rule_id: string | null
          severity: Database["public"]["Enums"]["notification_severity"]
          title: string
          user_id: string | null
        }
        Insert: {
          action_label?: string | null
          audience_role?: Database["public"]["Enums"]["app_role"] | null
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          email_attempts?: number
          email_due?: boolean
          email_sent_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string | null
          link?: string | null
          module?: string | null
          org_id: string
          read_at?: string | null
          rule_id?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title: string
          user_id?: string | null
        }
        Update: {
          action_label?: string | null
          audience_role?: Database["public"]["Enums"]["app_role"] | null
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          email_attempts?: number
          email_due?: boolean
          email_sent_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string | null
          link?: string | null
          module?: string | null
          org_id?: string
          read_at?: string | null
          rule_id?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email: boolean | null
          in_app: boolean
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email?: boolean | null
          in_app?: boolean
          kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email?: boolean | null
          in_app?: boolean
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      org_mail_settings: {
        Row: {
          created_at: string
          from_email: string
          from_name: string | null
          host: string
          last_error: string | null
          org_id: string
          password_enc: string
          port: number
          reply_to: string | null
          security: string
          updated_at: string
          updated_by: string | null
          username: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          from_email: string
          from_name?: string | null
          host: string
          last_error?: string | null
          org_id: string
          password_enc: string
          port: number
          reply_to?: string | null
          security?: string
          updated_at?: string
          updated_by?: string | null
          username: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string | null
          host?: string
          last_error?: string | null
          org_id?: string
          password_enc?: string
          port?: number
          reply_to?: string | null
          security?: string
          updated_at?: string
          updated_by?: string | null
          username?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_mail_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_suspensions: {
        Row: {
          id: string
          org_id: string
          reactivated_at: string | null
          reactivated_by: string | null
          reason: string
          suspended_at: string
          suspended_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          reactivated_at?: string | null
          reactivated_by?: string | null
          reason: string
          suspended_at?: string
          suspended_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          reactivated_at?: string | null
          reactivated_by?: string | null
          reason?: string
          suspended_at?: string
          suspended_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_suspensions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          custom_offering_id: string | null
          id: string
          notes: string | null
          org_id: string
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          custom_offering_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          custom_offering_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_custom_offering_id_fkey"
            columns: ["custom_offering_id"]
            isOneToOne: false
            referencedRelation: "custom_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          default_currency: string
          email: string | null
          employee_band: string | null
          enabled_modules: string[] | null
          fiscal_year_start_month: number
          id: string
          industry_preset: string | null
          logo_url: string | null
          name: string
          phone: string | null
          revenue_band: string | null
          slug: string
          status: string
          tax_id: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          email?: string | null
          employee_band?: string | null
          enabled_modules?: string[] | null
          fiscal_year_start_month?: number
          id?: string
          industry_preset?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          revenue_band?: string | null
          slug: string
          status?: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          email?: string | null
          employee_band?: string | null
          enabled_modules?: string[] | null
          fiscal_year_start_month?: number
          id?: string
          industry_preset?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          revenue_band?: string | null
          slug?: string
          status?: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      pages: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          icon: string | null
          id: string
          org_id: string
          parent_page_id: string | null
          sort_order: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          icon?: string | null
          id?: string
          org_id: string
          parent_page_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          icon?: string | null
          id?: string
          org_id?: string
          parent_page_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_parent_page_id_fkey"
            columns: ["parent_page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_run_lines: {
        Row: {
          created_at: string
          employee_id: string
          employer_medicare: number
          employer_social_security: number
          federal_tax: number
          futa: number
          gross: number
          health: number
          hours: number | null
          id: string
          medicare: number
          net: number
          org_id: string
          pay_run_id: string
          retirement: number
          social_security: number
          state_tax: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          employer_medicare?: number
          employer_social_security?: number
          federal_tax?: number
          futa?: number
          gross?: number
          health?: number
          hours?: number | null
          id?: string
          medicare?: number
          net?: number
          org_id: string
          pay_run_id: string
          retirement?: number
          social_security?: number
          state_tax?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          employer_medicare?: number
          employer_social_security?: number
          federal_tax?: number
          futa?: number
          gross?: number
          health?: number
          hours?: number | null
          id?: string
          medicare?: number
          net?: number
          org_id?: string
          pay_run_id?: string
          retirement?: number
          social_security?: number
          state_tax?: number
        }
        Relationships: [
          {
            foreignKeyName: "pay_run_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_run_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_run_lines_pay_run_id_fkey"
            columns: ["pay_run_id"]
            isOneToOne: false
            referencedRelation: "pay_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          org_id: string
          paid_at: string | null
          paid_by: string | null
          pay_date: string
          pay_frequency: string
          payment_entry_id: string | null
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          org_id: string
          paid_at?: string | null
          paid_by?: string | null
          pay_date: string
          pay_frequency?: string
          payment_entry_id?: string | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          paid_by?: string | null
          pay_date?: string
          pay_frequency?: string
          payment_entry_id?: string | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_runs_payment_entry_id_fkey"
            columns: ["payment_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          type: Database["public"]["Enums"]["payment_method_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          type?: Database["public"]["Enums"]["payment_method_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          type?: Database["public"]["Enums"]["payment_method_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          notes: string | null
          org_id: string
          payment_date: string
          payment_method_id: string | null
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id: string
          notes?: string | null
          org_id: string
          payment_date?: string
          payment_method_id?: string | null
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          org_id?: string
          payment_date?: string
          payment_method_id?: string | null
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_profiles: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          bank_routing_number: string | null
          base_salary: number | null
          created_at: string
          currency: string | null
          employee_id: string
          filing_status: string
          health_deduction: number
          hourly_rate: number | null
          id: string
          notes: string | null
          org_id: string
          pay_frequency: string | null
          payment_method: string | null
          retirement_percent: number
          state: string | null
          state_tax_rate: number
          tax_id: string | null
          updated_at: string
          w4_deductions: number
          w4_dependents: number
          w4_extra_withholding: number
          w4_other_income: number
          w4_step2: boolean
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_routing_number?: string | null
          base_salary?: number | null
          created_at?: string
          currency?: string | null
          employee_id: string
          filing_status?: string
          health_deduction?: number
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          org_id: string
          pay_frequency?: string | null
          payment_method?: string | null
          retirement_percent?: number
          state?: string | null
          state_tax_rate?: number
          tax_id?: string | null
          updated_at?: string
          w4_deductions?: number
          w4_dependents?: number
          w4_extra_withholding?: number
          w4_other_income?: number
          w4_step2?: boolean
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_routing_number?: string | null
          base_salary?: number | null
          created_at?: string
          currency?: string | null
          employee_id?: string
          filing_status?: string
          health_deduction?: number
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          pay_frequency?: string | null
          payment_method?: string | null
          retirement_percent?: number
          state?: string | null
          state_tax_rate?: number
          tax_id?: string | null
          updated_at?: string
          w4_deductions?: number
          w4_dependents?: number
          w4_extra_withholding?: number
          w4_other_income?: number
          w4_step2?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payroll_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          org_id: string
          prefix: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          org_id: string
          prefix: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          prefix?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          target_org: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_org?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_org?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_target_org_fkey"
            columns: ["target_org"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_reviewers: {
        Row: {
          added_by: string | null
          created_at: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_ticket_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "platform_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_tickets: {
        Row: {
          app_version: string | null
          assignee_id: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          kind: string
          org_id: string | null
          page_url: string | null
          priority: string
          resolved_at: string | null
          screenshot_path: string | null
          status: string
          ticket_number: string
          title: string
          updated_at: string
          user_agent: string | null
          viewport: string | null
        }
        Insert: {
          app_version?: string | null
          assignee_id?: string | null
          created_at?: string
          created_by?: string
          description: string
          id?: string
          kind?: string
          org_id?: string | null
          page_url?: string | null
          priority?: string
          resolved_at?: string | null
          screenshot_path?: string | null
          status?: string
          ticket_number?: string
          title: string
          updated_at?: string
          user_agent?: string | null
          viewport?: string | null
        }
        Update: {
          app_version?: string | null
          assignee_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          kind?: string
          org_id?: string | null
          page_url?: string | null
          priority?: string
          resolved_at?: string | null
          screenshot_path?: string | null
          status?: string
          ticket_number?: string
          title?: string
          updated_at?: string
          user_agent?: string | null
          viewport?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          parent_id: string | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          parent_id?: string | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          parent_id?: string | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          cost_price: number | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          option_values: Json
          org_id: string
          product_id: string
          sale_price: number | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          cost_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          option_values?: Json
          org_id: string
          product_id: string
          sale_price?: number | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          cost_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          option_values?: Json
          org_id?: string
          product_id?: string
          sale_price?: number | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived: boolean
          barcode: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number | null
          name: string
          org_id: string
          product_type: Database["public"]["Enums"]["product_type"]
          sale_price: number
          sku: string | null
          supplier_id: string | null
          tax_rate: number
          taxable: boolean
          track_inventory: boolean
          unit_of_measure: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          archived?: boolean
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number | null
          name: string
          org_id: string
          product_type?: Database["public"]["Enums"]["product_type"]
          sale_price?: number
          sku?: string | null
          supplier_id?: string | null
          tax_rate?: number
          taxable?: boolean
          track_inventory?: boolean
          unit_of_measure?: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          archived?: boolean
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number | null
          name?: string
          org_id?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          sale_price?: number
          sku?: string | null
          supplier_id?: string | null
          tax_rate?: number
          taxable?: boolean
          track_inventory?: boolean
          unit_of_measure?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          locale: string
          profession: string | null
          referral_source: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string
          profession?: string | null
          referral_source?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          profession?: string | null
          referral_source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          customer_visible: boolean
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          milestone_id: string | null
          org_id: string
          parent_task_id: string | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          reporter_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_visible?: boolean
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          milestone_id?: string | null
          org_id: string
          parent_task_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          reporter_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_visible?: boolean
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          milestone_id?: string | null
          org_id?: string
          parent_task_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          reporter_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          budget: number | null
          code: string | null
          color: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_company_id: string | null
          customer_contact_id: string | null
          description: string | null
          due_date: string | null
          id: string
          manager_id: string | null
          name: string
          org_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          archived?: boolean
          budget?: number | null
          code?: string | null
          color?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          manager_id?: string | null
          name: string
          org_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          archived?: boolean
          budget?: number | null
          code?: string | null
          color?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_company_id?: string | null
          customer_contact_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          org_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_company_id_fkey"
            columns: ["customer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          id: string
          line_subtotal: number
          line_tax: number
          line_total: number
          org_id: string
          position: number
          product_id: string | null
          purchase_order_id: string
          quantity: number
          quantity_received: number
          tax_id: string | null
          tax_rate: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id: string
          position?: number
          product_id?: string | null
          purchase_order_id: string
          quantity?: number
          quantity_received?: number
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id?: string
          position?: number
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          quantity_received?: number
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string
          org_id: string
          po_number: string
          received_at: string | null
          reference: string | null
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          supplier_id: string | null
          tax_total: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          org_id: string
          po_number: string
          received_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          org_id?: string
          po_number?: string
          received_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          org_id: string
          purchase_order_id: string
          received_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          purchase_order_id: string
          received_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          purchase_order_id?: string
          received_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_customer_actions: {
        Row: {
          action: Database["public"]["Enums"]["quote_customer_action"]
          comment: string | null
          created_at: string
          id: string
          org_id: string
          portal_user_id: string | null
          quote_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["quote_customer_action"]
          comment?: string | null
          created_at?: string
          id?: string
          org_id: string
          portal_user_id?: string | null
          quote_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["quote_customer_action"]
          comment?: string | null
          created_at?: string
          id?: string
          org_id?: string
          portal_user_id?: string | null
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_customer_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_customer_actions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_customer_actions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          id: string
          line_subtotal: number
          line_tax: number
          line_total: number
          org_id: string
          position: number
          product_id: string | null
          quantity: number
          quote_id: string
          tax_id: string | null
          tax_rate: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          discount_pct?: number
          id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          quote_id: string
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          quote_id?: string
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          company_id: string | null
          contact_id: string | null
          converted_invoice_id: string | null
          converted_sales_order_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deal_id: string | null
          discount_total: number
          expiry_date: string | null
          id: string
          issue_date: string
          notes: string | null
          number: string
          org_id: string
          owner_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_total: number
          terms: string | null
          total: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          converted_invoice_id?: string | null
          converted_sales_order_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          discount_total?: number
          expiry_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          number: string
          org_id: string
          owner_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          terms?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          converted_invoice_id?: string | null
          converted_sales_order_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          discount_total?: number
          expiry_date?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string
          org_id?: string
          owner_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          terms?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      sales_order_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          id: string
          line_subtotal: number
          line_tax: number
          line_total: number
          org_id: string
          position: number
          product_id: string | null
          quantity: number
          sales_order_id: string
          tax_id: string | null
          tax_rate: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          discount_pct?: number
          id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          sales_order_id: string
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          sales_order_id?: string
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          expected_delivery: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          number: string
          order_date: string
          org_id: string
          owner_id: string | null
          quote_id: string | null
          status: Database["public"]["Enums"]["sales_order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          expected_delivery?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          number: string
          order_date?: string
          org_id: string
          owner_id?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          expected_delivery?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          number?: string
          order_date?: string
          org_id?: string
          owner_id?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_offers: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          ai_agent_limit: number | null
          bandwidth_limit_gb: number | null
          code: string
          created_at: string
          currency: string
          description: string | null
          features: string[]
          id: string
          is_active: boolean
          is_public: boolean
          limits: Json
          modules: string[]
          name: string
          plan_kind: string
          price_monthly: number
          price_total: number | null
          price_yearly: number
          sort_order: number
          storage_limit_gb: number | null
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          term_months: number | null
          tier_key: string | null
          updated_at: string
          user_limit: number | null
        }
        Insert: {
          ai_agent_limit?: number | null
          bandwidth_limit_gb?: number | null
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          is_public?: boolean
          limits?: Json
          modules?: string[]
          name: string
          plan_kind?: string
          price_monthly?: number
          price_total?: number | null
          price_yearly?: number
          sort_order?: number
          storage_limit_gb?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          term_months?: number | null
          tier_key?: string | null
          updated_at?: string
          user_limit?: number | null
        }
        Update: {
          ai_agent_limit?: number | null
          bandwidth_limit_gb?: number | null
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          is_public?: boolean
          limits?: Json
          modules?: string[]
          name?: string
          plan_kind?: string
          price_monthly?: number
          price_total?: number | null
          price_yearly?: number
          sort_order?: number
          storage_limit_gb?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          term_months?: number | null
          tier_key?: string | null
          updated_at?: string
          user_limit?: number | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          archived: boolean
          city: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          payment_terms: string | null
          phone: string | null
          postal_code: string | null
          region: string | null
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          archived?: boolean
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          archived?: boolean
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_portal_user_id: string | null
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          org_id: string
          ticket_id: string
        }
        Insert: {
          author_portal_user_id?: string | null
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          org_id: string
          ticket_id: string
        }
        Update: {
          author_portal_user_id?: string | null
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          org_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_author_portal_user_id_fkey"
            columns: ["author_portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assignee_id: string | null
          closed_at: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by_portal_user_id: string | null
          created_by_user_id: string | null
          description: string | null
          id: string
          org_id: string
          portal_user_id: string | null
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          project_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_portal_user_id?: string | null
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          org_id: string
          portal_user_id?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          project_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_portal_user_id?: string | null
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          org_id?: string
          portal_user_id?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          project_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_created_by_portal_user_id_fkey"
            columns: ["created_by_portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklists: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_done: boolean
          org_id: string
          position: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_done?: boolean
          org_id: string
          position?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_done?: boolean
          org_id?: string
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          org_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          org_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      taxes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notes: string | null
          org_id: string
          rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notes?: string | null
          org_id: string
          rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          created_at: string
          entry_date: string
          hourly_rate: number | null
          hours: number
          id: string
          notes: string | null
          org_id: string
          project_id: string
          status: Database["public"]["Enums"]["timesheet_status"]
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean
          created_at?: string
          entry_date?: string
          hourly_rate?: number | null
          hours: number
          id?: string
          notes?: string | null
          org_id: string
          project_id: string
          status?: Database["public"]["Enums"]["timesheet_status"]
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean
          created_at?: string
          entry_date?: string
          hourly_rate?: number | null
          hours?: number
          id?: string
          notes?: string | null
          org_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["timesheet_status"]
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          created_at: string
          id: string
          last_calculated_at: string
          org_id: string
          updated_at: string
          users_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_calculated_at?: string
          org_id: string
          updated_at?: string
          users_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_calculated_at?: string
          org_id?: string
          updated_at?: string
          users_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_limits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          current_org_id: string | null
          hidden_modules: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          current_org_id?: string | null
          hidden_modules?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          current_org_id?: string | null
          hidden_modules?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_current_org_id_fkey"
            columns: ["current_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bill_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          expense_category_id: string | null
          id: string
          line_subtotal: number
          line_tax: number
          line_total: number
          org_id: string
          position: number
          product_id: string | null
          quantity: number
          tax_id: string | null
          tax_rate: number
          unit_price: number
          vendor_bill_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          discount_pct?: number
          expense_category_id?: string | null
          id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          vendor_bill_id: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          expense_category_id?: string | null
          id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          org_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          tax_id?: string | null
          tax_rate?: number
          unit_price?: number
          vendor_bill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bill_items_expense_category_id_fkey"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_items_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_items_vendor_bill_id_fkey"
            columns: ["vendor_bill_id"]
            isOneToOne: false
            referencedRelation: "vendor_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bill_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          org_id: string
          payment_date: string
          payment_method_id: string | null
          reference: string | null
          vendor_bill_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          org_id: string
          payment_date?: string
          payment_method_id?: string | null
          reference?: string | null
          vendor_bill_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          org_id?: string
          payment_date?: string
          payment_method_id?: string | null
          reference?: string | null
          vendor_bill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bill_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_payments_vendor_bill_id_fkey"
            columns: ["vendor_bill_id"]
            isOneToOne: false
            referencedRelation: "vendor_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bills: {
        Row: {
          amount_paid: number
          balance_due: number
          bill_date: string
          bill_number: string
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          due_date: string | null
          id: string
          notes: string | null
          org_id: string
          purchase_order_id: string | null
          reference: string | null
          status: Database["public"]["Enums"]["vendor_bill_status"]
          subtotal: number
          supplier_id: string | null
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          bill_date?: string
          bill_number: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_date?: string | null
          id?: string
          notes?: string | null
          org_id: string
          purchase_order_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["vendor_bill_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          due_date?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          purchase_order_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["vendor_bill_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bills_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          org_id: string
          postal_code: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          org_id: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          org_id?: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          endpoint_id: string
          error: string | null
          event: string
          id: string
          org_id: string
          payload: Json
          response_code: number | null
          status: string
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          error?: string | null
          event: string
          id?: string
          org_id: string
          payload?: Json
          response_code?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          error?: string | null
          event?: string
          id?: string
          org_id?: string
          payload?: Json
          response_code?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          created_by: string | null
          events: string[]
          id: string
          is_active: boolean
          last_delivery_at: string | null
          name: string
          org_id: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          name: string
          org_id: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          name?: string
          org_id?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          actions_run: number
          finished_at: string | null
          id: string
          log: string | null
          matched: number
          org_id: string
          started_at: string
          status: string
          triggered_by: string | null
          workflow_id: string
        }
        Insert: {
          actions_run?: number
          finished_at?: string | null
          id?: string
          log?: string | null
          matched?: number
          org_id: string
          started_at?: string
          status?: string
          triggered_by?: string | null
          workflow_id: string
        }
        Update: {
          actions_run?: number
          finished_at?: string | null
          id?: string
          log?: string | null
          matched?: number
          org_id?: string
          started_at?: string
          status?: string
          triggered_by?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          entity: string
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          org_id: string
          trigger_config: Json
          trigger_kind: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          org_id: string
          trigger_config?: Json
          trigger_kind?: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          org_id?: string
          trigger_config?: Json
          trigger_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inbox_approvals: {
        Row: {
          action: string | null
          agent_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string | null
          org_id: string | null
          payload: Json | null
          source: string | null
          status: string | null
          summary: string | null
          title: string | null
          waiting: boolean | null
        }
        Relationships: []
      }
      products_with_stock: {
        Row: {
          archived: boolean | null
          barcode: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          low_stock_threshold: number | null
          name: string | null
          on_hand: number | null
          org_id: string | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          sale_price: number | null
          sku: string | null
          stock_status: string | null
          supplier_id: string | null
          tax_rate: number | null
          taxable: boolean | null
          track_inventory: boolean | null
          unit_of_measure: string | null
          updated_at: string | null
          weight: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_platform_reviewer: { Args: { _email: string }; Returns: string }
      ai_usage_summary: { Args: { _org: string }; Returns: Json }
      apply_inventory_adjustment: {
        Args: {
          _delta: number
          _notes: string
          _org: string
          _product: string
          _reason: string
          _variant: string
          _warehouse: string
        }
        Returns: string
      }
      approve_pay_run: { Args: { _id: string }; Returns: string }
      attention_counts: { Args: { _org: string }; Returns: Json }
      can_run_agent: { Args: { _agent_id: string }; Returns: boolean }
      can_self_join_org: { Args: { _org: string }; Returns: boolean }
      claim_notification_emails: {
        Args: { _limit?: number; _org?: string }
        Returns: {
          action_label: string
          body: string
          email: string
          id: string
          kind: string
          link: string
          org_id: string
          org_name: string
          title: string
        }[]
      }
      claim_portal_invites: { Args: never; Returns: number }
      consume_ai_action: {
        Args: { _byo?: boolean; _kind: string; _org: string }
        Returns: Json
      }
      convert_po_to_bill: { Args: { _po: string }; Returns: string }
      copy_document: {
        Args: { _from: string; _id: string; _to: string }
        Returns: string
      }
      current_portal_user: { Args: { _org: string }; Returns: string }
      dashboard_overview: { Args: { _org: string }; Returns: Json }
      dashboard_summary: { Args: { _org: string }; Returns: Json }
      expire_lapsed_subscriptions: { Args: never; Returns: number }
      fulfill_sales_order: { Args: { _so: string }; Returns: undefined }
      has_agent_permission: {
        Args: { _action: string; _agent_id: string; _module: string }
        Returns: boolean
      }
      has_hr_access: { Args: { _org: string }; Returns: boolean }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      has_permission: { Args: { _key: string; _org: string }; Returns: boolean }
      hit_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      is_platform_reviewer: { Args: never; Returns: boolean }
      is_portal_user_of_company: {
        Args: { _company: string; _org: string }
        Returns: boolean
      }
      kick_agent_dispatch: { Args: never; Returns: undefined }
      kick_notification_dispatch: { Args: never; Returns: undefined }
      list_import_connections: {
        Args: { _org: string }
        Returns: {
          created_at: string
          label: string
          last_used_at: string
          provider: string
          token_last4: string
        }[]
      }
      list_platform_assignees: {
        Args: never
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      list_platform_reviewers: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          user_id: string
        }[]
      }
      mark_overdue_invoices: { Args: { _org: string }; Returns: number }
      mark_overdue_vendor_bills: { Args: { _org: string }; Returns: undefined }
      mark_pay_run_paid: {
        Args: { _id: string; _paid_on?: string }
        Returns: string
      }
      module_overview: {
        Args: { _module: string; _org: string }
        Returns: Json
      }
      module_summary: { Args: { _module: string; _org: string }; Returns: Json }
      my_portal_orgs: {
        Args: never
        Returns: {
          company_id: string
          org_id: string
          portal_user_id: string
        }[]
      }
      next_doc_number: {
        Args: { _doc: Database["public"]["Enums"]["doc_type"]; _org: string }
        Returns: string
      }
      notification_dispatch_secret: {
        Args: { _site_url?: string }
        Returns: string
      }
      notification_email_default: { Args: { _kind: string }; Returns: boolean }
      notification_locked: { Args: { _kind: string }; Returns: boolean }
      notified_recently: {
        Args: { _days: number; _entity: string; _kind: string }
        Returns: boolean
      }
      notify: {
        Args: {
          _action?: string
          _body: string
          _entity_id?: string
          _entity_type?: string
          _include_actor?: boolean
          _kind?: string
          _link: string
          _module: string
          _org: string
          _rule?: string
          _severity: Database["public"]["Enums"]["notification_severity"]
          _title: string
          _users: string[]
        }
        Returns: number
      }
      notify_org: {
        Args: {
          _body?: string
          _entity_id?: string
          _entity_type?: string
          _link?: string
          _module?: string
          _org: string
          _severity?: Database["public"]["Enums"]["notification_severity"]
          _title: string
        }
        Returns: number
      }
      notify_platform_reviewers: {
        Args: {
          _body: string
          _entity: string
          _kind: string
          _link: string
          _only?: string
          _title: string
        }
        Returns: undefined
      }
      notify_recipients: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: string[]
      }
      notify_ticket_reporter: {
        Args: {
          _body: string
          _t: Database["public"]["Tables"]["platform_tickets"]["Row"]
          _title: string
        }
        Returns: undefined
      }
      org_active_seat_count: { Args: { _org: string }; Returns: number }
      org_has_module: {
        Args: { _module: string; _org: string }
        Returns: boolean
      }
      org_is_active: { Args: { _org: string }; Returns: boolean }
      org_limit_count: { Args: { _key: string; _org: string }; Returns: number }
      org_limits: { Args: { _org: string }; Returns: Json }
      org_storage_used_bytes: { Args: { _org: string }; Returns: number }
      org_usage: { Args: { _org: string }; Returns: Json }
      org_within_agent_limit: { Args: { _org: string }; Returns: boolean }
      org_within_user_limit: { Args: { _org: string }; Returns: boolean }
      payroll_account: {
        Args: {
          _code: string
          _name: string
          _org: string
          _type: Database["public"]["Enums"]["account_type"]
        }
        Returns: string
      }
      plan_limit_label: { Args: { _key: string; _n: number }; Returns: string }
      platform_insights: { Args: never; Returns: Json }
      platform_org_stats: { Args: { _org: string }; Returns: Json }
      platform_overview_stats: {
        Args: never
        Returns: {
          active_orgs: number
          demo_orgs: number
          past_due_orgs: number
          suspended_orgs: number
          total_active_users: number
          total_orgs: number
          trialing_orgs: number
          trials_expiring_7d: number
        }[]
      }
      portal_user_company: { Args: { _org: string }; Returns: string }
      post_journal_entry: { Args: { _id: string }; Returns: undefined }
      recalc_invoice_totals: { Args: { _id: string }; Returns: undefined }
      recalc_journal_entry_totals: { Args: { _id: string }; Returns: undefined }
      recalc_po_totals: { Args: { _id: string }; Returns: undefined }
      recalc_quote_totals: { Args: { _id: string }; Returns: undefined }
      recalc_sales_order_totals: { Args: { _id: string }; Returns: undefined }
      recalc_vendor_bill_totals: { Args: { _id: string }; Returns: undefined }
      receive_purchase_order: {
        Args: { _notes?: string; _po: string }
        Returns: string
      }
      refund_ai_action: { Args: { _id: number }; Returns: undefined }
      remove_platform_reviewer: { Args: { _user: string }; Returns: undefined }
      replace_document_lines: {
        Args: { _doc: string; _doc_type: string; _lines: Json }
        Returns: undefined
      }
      replace_journal_entry_lines: {
        Args: { _entry: string; _lines: Json }
        Returns: undefined
      }
      resolve_org_offering: {
        Args: { _org: string }
        Returns: {
          ai_agent_limit: number
          billing_interval: string
          effective_price: number
          modules: string[]
          trial_ends_at: string
          user_limit: number
        }[]
      }
      reverse_journal_entry: {
        Args: { _id: string; _memo?: string }
        Returns: string
      }
      reverse_source_journals: {
        Args: {
          _memo: string
          _source: Database["public"]["Enums"]["journal_source"]
          _source_id: string
        }
        Returns: undefined
      }
      run_all_automation_rules: { Args: never; Returns: number }
      run_automation_rule: { Args: { _rule: string }; Returns: Json }
      run_notification_reminders: { Args: never; Returns: number }
      seed_automation_rules: { Args: { _org: string }; Returns: undefined }
      seed_default_coa: { Args: { _org: string }; Returns: undefined }
      seed_default_deal_stages: { Args: { _org: string }; Returns: undefined }
      seed_default_warehouse: { Args: { _org: string }; Returns: undefined }
      set_custom_record_field: {
        Args: { _id: string; _key: string; _value: Json }
        Returns: undefined
      }
      shares_org_with: { Args: { _user: string }; Returns: boolean }
    }
    Enums: {
      account_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "expense"
        | "cogs"
      activity_type:
        | "call"
        | "email"
        | "meeting"
        | "task"
        | "follow_up"
        | "note"
      ai_action_status: "pending" | "completed" | "failed" | "dismissed"
      ai_agent_action_status:
        | "proposed"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "executed"
        | "failed"
        | "cancelled"
      ai_agent_approval_status: "pending" | "approved" | "rejected"
      ai_agent_audit_event:
        | "agent_created"
        | "agent_updated"
        | "agent_deleted"
        | "agent_activated"
        | "agent_paused"
        | "tool_added"
        | "tool_removed"
        | "permission_changed"
        | "run_started"
        | "run_completed"
        | "run_failed"
        | "action_proposed"
        | "action_approved"
        | "action_rejected"
        | "action_executed"
        | "credential_updated"
        | "webhook_received"
      ai_agent_knowledge_source_type:
        | "erp_module"
        | "uploaded_file_placeholder"
        | "website_url_placeholder"
        | "external_api"
        | "customer_records"
        | "product_catalog"
        | "invoice_history"
        | "project_data"
        | "support_tickets"
      ai_agent_memory_visibility:
        | "agent_private"
        | "organization_shared"
        | "user_specific"
      ai_agent_message_role:
        | "system"
        | "user"
        | "assistant"
        | "tool"
        | "approval"
        | "error"
      ai_agent_run_status:
        | "queued"
        | "running"
        | "waiting_for_approval"
        | "completed"
        | "failed"
        | "cancelled"
      ai_agent_status: "draft" | "active" | "paused" | "archived"
      ai_agent_tool_type:
        | "internal_erp_action"
        | "external_api"
        | "webhook"
        | "email"
        | "database_query"
        | "file_reader"
        | "report_generator"
        | "notification"
        | "http_request"
        | "custom_function"
        | "mcp_server_placeholder"
      ai_agent_trigger_kind:
        | "manual"
        | "scheduled"
        | "webhook"
        | "event_based"
        | "system"
      ai_message_role: "system" | "user" | "assistant" | "tool"
      ai_provider_kind:
        | "lovable"
        | "openai"
        | "anthropic"
        | "google"
        | "azure_openai"
        | "openai_compatible"
      app_role:
        | "platform_owner"
        | "org_owner"
        | "org_admin"
        | "manager"
        | "staff"
        | "accountant"
        | "sales_rep"
        | "inventory_manager"
        | "hr_manager"
        | "read_only"
      attendance_source: "manual" | "clock" | "import"
      automation_run_status: "pending" | "success" | "error" | "skipped"
      automation_trigger:
        | "invoice_overdue"
        | "low_stock"
        | "deal_stale"
        | "task_overdue"
        | "custom"
      billing_cycle: "monthly" | "yearly"
      crm_entity_type: "contact" | "company" | "deal" | "lead"
      deal_status: "open" | "won" | "lost"
      doc_type:
        | "quote"
        | "sales_order"
        | "invoice"
        | "purchase_order"
        | "vendor_bill"
        | "expense"
        | "journal"
      employee_status: "active" | "inactive" | "terminated" | "on_leave"
      employment_type: "full_time" | "part_time" | "contractor" | "intern"
      expense_status:
        | "draft"
        | "submitted"
        | "approved"
        | "reimbursed"
        | "rejected"
      inv_movement_type:
        | "receipt"
        | "sale"
        | "transfer_in"
        | "transfer_out"
        | "adjustment"
        | "return"
        | "consumption"
      invoice_status:
        | "draft"
        | "sent"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
      journal_source:
        | "manual"
        | "invoice"
        | "payment"
        | "expense"
        | "vendor_bill"
        | "adjustment"
      journal_status: "draft" | "posted" | "reversed"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "unqualified"
        | "converted"
        | "lost"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_type: "vacation" | "sick" | "unpaid" | "personal" | "other"
      lifecycle_stage:
        | "subscriber"
        | "lead"
        | "marketing_qualified"
        | "sales_qualified"
        | "opportunity"
        | "customer"
        | "evangelist"
        | "other"
      membership_status: "active" | "invited" | "suspended"
      milestone_status: "pending" | "in_progress" | "completed" | "missed"
      notification_severity: "info" | "success" | "warning" | "error"
      payment_method_type:
        | "cash"
        | "bank_transfer"
        | "credit_card"
        | "check"
        | "stripe"
        | "paypal"
        | "other"
      po_status:
        | "draft"
        | "sent"
        | "approved"
        | "partially_received"
        | "received"
        | "cancelled"
      portal_user_status: "invited" | "active" | "suspended"
      product_type: "physical" | "service" | "digital" | "bundle"
      project_status:
        | "planned"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      quote_customer_action: "accept" | "reject" | "comment"
      quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      sales_order_status: "draft" | "confirmed" | "fulfilled" | "cancelled"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
        | "incomplete"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status:
        | "open"
        | "pending"
        | "in_progress"
        | "resolved"
        | "closed"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "todo"
        | "in_progress"
        | "review"
        | "done"
        | "blocked"
        | "cancelled"
      timesheet_status: "draft" | "submitted" | "approved" | "rejected"
      vendor_bill_status:
        | "draft"
        | "approved"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "expense",
        "cogs",
      ],
      activity_type: ["call", "email", "meeting", "task", "follow_up", "note"],
      ai_action_status: ["pending", "completed", "failed", "dismissed"],
      ai_agent_action_status: [
        "proposed",
        "pending_approval",
        "approved",
        "rejected",
        "executed",
        "failed",
        "cancelled",
      ],
      ai_agent_approval_status: ["pending", "approved", "rejected"],
      ai_agent_audit_event: [
        "agent_created",
        "agent_updated",
        "agent_deleted",
        "agent_activated",
        "agent_paused",
        "tool_added",
        "tool_removed",
        "permission_changed",
        "run_started",
        "run_completed",
        "run_failed",
        "action_proposed",
        "action_approved",
        "action_rejected",
        "action_executed",
        "credential_updated",
        "webhook_received",
      ],
      ai_agent_knowledge_source_type: [
        "erp_module",
        "uploaded_file_placeholder",
        "website_url_placeholder",
        "external_api",
        "customer_records",
        "product_catalog",
        "invoice_history",
        "project_data",
        "support_tickets",
      ],
      ai_agent_memory_visibility: [
        "agent_private",
        "organization_shared",
        "user_specific",
      ],
      ai_agent_message_role: [
        "system",
        "user",
        "assistant",
        "tool",
        "approval",
        "error",
      ],
      ai_agent_run_status: [
        "queued",
        "running",
        "waiting_for_approval",
        "completed",
        "failed",
        "cancelled",
      ],
      ai_agent_status: ["draft", "active", "paused", "archived"],
      ai_agent_tool_type: [
        "internal_erp_action",
        "external_api",
        "webhook",
        "email",
        "database_query",
        "file_reader",
        "report_generator",
        "notification",
        "http_request",
        "custom_function",
        "mcp_server_placeholder",
      ],
      ai_agent_trigger_kind: [
        "manual",
        "scheduled",
        "webhook",
        "event_based",
        "system",
      ],
      ai_message_role: ["system", "user", "assistant", "tool"],
      ai_provider_kind: [
        "lovable",
        "openai",
        "anthropic",
        "google",
        "azure_openai",
        "openai_compatible",
      ],
      app_role: [
        "platform_owner",
        "org_owner",
        "org_admin",
        "manager",
        "staff",
        "accountant",
        "sales_rep",
        "inventory_manager",
        "hr_manager",
        "read_only",
      ],
      attendance_source: ["manual", "clock", "import"],
      automation_run_status: ["pending", "success", "error", "skipped"],
      automation_trigger: [
        "invoice_overdue",
        "low_stock",
        "deal_stale",
        "task_overdue",
        "custom",
      ],
      billing_cycle: ["monthly", "yearly"],
      crm_entity_type: ["contact", "company", "deal", "lead"],
      deal_status: ["open", "won", "lost"],
      doc_type: [
        "quote",
        "sales_order",
        "invoice",
        "purchase_order",
        "vendor_bill",
        "expense",
        "journal",
      ],
      employee_status: ["active", "inactive", "terminated", "on_leave"],
      employment_type: ["full_time", "part_time", "contractor", "intern"],
      expense_status: [
        "draft",
        "submitted",
        "approved",
        "reimbursed",
        "rejected",
      ],
      inv_movement_type: [
        "receipt",
        "sale",
        "transfer_in",
        "transfer_out",
        "adjustment",
        "return",
        "consumption",
      ],
      invoice_status: [
        "draft",
        "sent",
        "partially_paid",
        "paid",
        "overdue",
        "void",
      ],
      journal_source: [
        "manual",
        "invoice",
        "payment",
        "expense",
        "vendor_bill",
        "adjustment",
      ],
      journal_status: ["draft", "posted", "reversed"],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "unqualified",
        "converted",
        "lost",
      ],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      leave_type: ["vacation", "sick", "unpaid", "personal", "other"],
      lifecycle_stage: [
        "subscriber",
        "lead",
        "marketing_qualified",
        "sales_qualified",
        "opportunity",
        "customer",
        "evangelist",
        "other",
      ],
      membership_status: ["active", "invited", "suspended"],
      milestone_status: ["pending", "in_progress", "completed", "missed"],
      notification_severity: ["info", "success", "warning", "error"],
      payment_method_type: [
        "cash",
        "bank_transfer",
        "credit_card",
        "check",
        "stripe",
        "paypal",
        "other",
      ],
      po_status: [
        "draft",
        "sent",
        "approved",
        "partially_received",
        "received",
        "cancelled",
      ],
      portal_user_status: ["invited", "active", "suspended"],
      product_type: ["physical", "service", "digital", "bundle"],
      project_status: [
        "planned",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      quote_customer_action: ["accept", "reject", "comment"],
      quote_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      sales_order_status: ["draft", "confirmed", "fulfilled", "cancelled"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
        "incomplete",
      ],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: [
        "open",
        "pending",
        "in_progress",
        "resolved",
        "closed",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "todo",
        "in_progress",
        "review",
        "done",
        "blocked",
        "cancelled",
      ],
      timesheet_status: ["draft", "submitted", "approved", "rejected"],
      vendor_bill_status: [
        "draft",
        "approved",
        "partially_paid",
        "paid",
        "overdue",
        "void",
      ],
    },
  },
} as const
