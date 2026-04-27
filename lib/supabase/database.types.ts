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
      _applied_migrations: {
        Row: {
          applied_at: string
          filename: string
        }
        Insert: {
          applied_at?: string
          filename: string
        }
        Update: {
          applied_at?: string
          filename?: string
        }
        Relationships: []
      }
      account_lifecycle_events: {
        Row: {
          event_type: string
          happened_at: string
          id: number
          note: string | null
          user_id: string
        }
        Insert: {
          event_type: string
          happened_at?: string
          id?: number
          note?: string | null
          user_id: string
        }
        Update: {
          event_type?: string
          happened_at?: string
          id?: number
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          archived_at: string | null
          balance_classification: string | null
          closing_day: number | null
          color_hex: string | null
          created_at: string
          id: string
          name: string
          opening_balance_cents: number
          sort_order: number
          type: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          balance_classification?: string | null
          closing_day?: number | null
          color_hex?: string | null
          created_at?: string
          id?: string
          name: string
          opening_balance_cents?: number
          sort_order?: number
          type: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          balance_classification?: string | null
          closing_day?: number | null
          color_hex?: string | null
          created_at?: string
          id?: string
          name?: string
          opening_balance_cents?: number
          sort_order?: number
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_events: {
        Row: {
          acknowledged_at: string | null
          alert_id: string
          id: string
          snapshot_json: Json | null
          triggered_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          alert_id: string
          id?: string
          snapshot_json?: Json | null
          triggered_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          alert_id?: string
          id?: string
          snapshot_json?: Json | null
          triggered_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_evaluated_at: string | null
          last_triggered_at: string | null
          name: string
          rule_json: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_evaluated_at?: string | null
          last_triggered_at?: string | null
          name: string
          rule_json: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_evaluated_at?: string | null
          last_triggered_at?: string | null
          name?: string
          rule_json?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      balance_adjustments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          label: string
          line_key: string
          metadata: Json | null
          note: string | null
          period: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          label: string
          line_key: string
          metadata?: Json | null
          note?: string | null
          period: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          label?: string
          line_key?: string
          metadata?: Json | null
          note?: string | null
          period?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      balance_registries: {
        Row: {
          amount_cents: number
          created_at: string
          credit_label: string
          credit_section: string
          debit_label: string
          debit_section: string
          description: string
          id: string
          kind: string
          note: string | null
          period: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          credit_label: string
          credit_section: string
          debit_label: string
          debit_section: string
          description: string
          id?: string
          kind: string
          note?: string | null
          period: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credit_label?: string
          credit_section?: string
          debit_label?: string
          debit_section?: string
          description?: string
          id?: string
          kind?: string
          note?: string | null
          period?: string
          user_id?: string
        }
        Relationships: []
      }
      capture_messages: {
        Row: {
          channel: string
          created_at: string
          duration_ms: number | null
          error: string | null
          groq_confidence: number | null
          groq_parse_json: Json | null
          id: string
          metadata: Json | null
          model: string | null
          raw_input: string
          transaction_id: string | null
          transcription: string | null
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          groq_confidence?: number | null
          groq_parse_json?: Json | null
          id?: string
          metadata?: Json | null
          model?: string | null
          raw_input: string
          transaction_id?: string | null
          transcription?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          groq_confidence?: number | null
          groq_parse_json?: Json | null
          id?: string
          metadata?: Json | null
          model?: string | null
          raw_input?: string
          transaction_id?: string | null
          transcription?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          color_hex: string | null
          created_at: string
          icon: string | null
          id: string
          is_formal_income: boolean
          is_income: boolean
          name: string
          parent_id: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          color_hex?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_formal_income?: boolean
          is_income?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          user_id: string
        }
        Update: {
          archived_at?: string | null
          color_hex?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_formal_income?: boolean
          is_income?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cities_br: {
        Row: {
          capital: boolean
          created_at: string
          ibge_id: number
          lat: number | null
          lng: number | null
          name: string
          uf: string
        }
        Insert: {
          capital?: boolean
          created_at?: string
          ibge_id: number
          lat?: number | null
          lng?: number | null
          name: string
          uf: string
        }
        Update: {
          capital?: boolean
          created_at?: string
          ibge_id?: number
          lat?: number | null
          lng?: number | null
          name?: string
          uf?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          channel: string
          id: string
          last_message_at: string | null
          started_at: string
          title: string | null
          user_id: string
        }
        Insert: {
          channel: string
          id?: string
          last_message_at?: string | null
          started_at?: string
          title?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          id?: string
          last_message_at?: string | null
          started_at?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      demo_clicks: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      doc_clicks: {
        Row: {
          clicked_at: string
          id: number
          source: string
          user_id: string | null
        }
        Insert: {
          clicked_at?: string
          id?: number
          source: string
          user_id?: string | null
        }
        Update: {
          clicked_at?: string
          id?: number
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      login_events: {
        Row: {
          happened_at: string
          id: number
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          happened_at?: string
          id?: number
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          happened_at?: string
          id?: number
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_calls_json: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_calls_json?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_calls_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birthday: string | null
          city_ibge: number | null
          city_name: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          gender: string | null
          is_demo: boolean
          lat: number | null
          lng: number | null
          onboarded_at: string | null
          role: string
          telegram_chat_id: number | null
          uf: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          birthday?: string | null
          city_ibge?: number | null
          city_name?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          gender?: string | null
          is_demo?: boolean
          lat?: number | null
          lng?: number | null
          onboarded_at?: string | null
          role?: string
          telegram_chat_id?: number | null
          uf?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          birthday?: string | null
          city_ibge?: number | null
          city_name?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          gender?: string | null
          is_demo?: boolean
          lat?: number | null
          lng?: number | null
          onboarded_at?: string | null
          role?: string
          telegram_chat_id?: number | null
          uf?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_link_tokens: {
        Row: {
          created_at: string
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_processed_updates: {
        Row: {
          chat_id: number
          processed_at: string
          update_id: number
          user_id: string | null
        }
        Insert: {
          chat_id: number
          processed_at?: string
          update_id: number
          user_id?: string | null
        }
        Update: {
          chat_id?: number
          processed_at?: string
          update_id?: number
          user_id?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount_cents: number
          category_id: string | null
          created_at: string
          groq_confidence: number | null
          groq_parse_json: Json | null
          id: string
          is_transfer: boolean
          merchant: string | null
          needs_review: boolean | null
          note: string | null
          occurred_on: string
          paid_at: string | null
          raw_input: string | null
          source: string
          transfer_peer_id: string | null
          tx_kind: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          category_id?: string | null
          created_at?: string
          groq_confidence?: number | null
          groq_parse_json?: Json | null
          id?: string
          is_transfer?: boolean
          merchant?: string | null
          needs_review?: boolean | null
          note?: string | null
          occurred_on: string
          paid_at?: string | null
          raw_input?: string | null
          source: string
          transfer_peer_id?: string | null
          tx_kind?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          category_id?: string | null
          created_at?: string
          groq_confidence?: number | null
          groq_parse_json?: Json | null
          id?: string
          is_transfer?: boolean
          merchant?: string | null
          needs_review?: boolean | null
          note?: string | null
          occurred_on?: string
          paid_at?: string | null
          raw_input?: string | null
          source?: string
          transfer_peer_id?: string | null
          tx_kind?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_peer_id_fkey"
            columns: ["transfer_peer_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      pay_invoice: {
        Args: {
          p_amount_cents: number
          p_card_id: string
          p_invoice_label: string
          p_source_account_id: string
        }
        Returns: Json
      }
      seed_default_categories: { Args: { p_user: string }; Returns: undefined }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
