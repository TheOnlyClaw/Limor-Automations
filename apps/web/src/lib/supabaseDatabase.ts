export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.1'
  }
  public: {
    Tables: {
      automation_actions: {
        Row: {
          automation_id: string
          created_at: string
          id: string
          template: string
          type: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          id?: string
          template: string
          type: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          id?: string
          template?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'automation_actions_automation_id_fkey'
            columns: ['automation_id']
            isOneToOne: false
            referencedRelation: 'automations'
            referencedColumns: ['id']
          },
        ]
      }
      automation_executions: {
        Row: {
          action_type: string
          attempts: number
          automation_id: string
          created_at: string
          event_id: string
          id: string
          last_error: string | null
          owner_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          attempts?: number
          automation_id: string
          created_at?: string
          event_id: string
          id?: string
          last_error?: string | null
          owner_user_id: string
          status: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          attempts?: number
          automation_id?: string
          created_at?: string
          event_id?: string
          id?: string
          last_error?: string | null
          owner_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'automation_executions_automation_id_fkey'
            columns: ['automation_id']
            isOneToOne: false
            referencedRelation: 'automations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'automation_executions_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'instagram_webhook_events'
            referencedColumns: ['id']
          },
        ]
      }
      automation_rules: {
        Row: {
          automation_id: string
          created_at: string
          flags: string | null
          id: string
          pattern: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          flags?: string | null
          id?: string
          pattern: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          flags?: string | null
          id?: string
          pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: 'automation_rules_automation_id_fkey'
            columns: ['automation_id']
            isOneToOne: false
            referencedRelation: 'automations'
            referencedColumns: ['id']
          },
        ]
      }
      automations: {
        Row: {
          connection_id: string
          created_at: string
          enabled: boolean
          id: string
          ig_post_id: string
          name: string | null
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          ig_post_id: string
          name?: string | null
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          ig_post_id?: string
          name?: string | null
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'automations_connection_id_fkey'
            columns: ['connection_id']
            isOneToOne: false
            referencedRelation: 'instagram_connections'
            referencedColumns: ['id']
          },
        ]
      }
      instagram_connections: {
        Row: {
          access_token_encrypted: string
          connection_status: string
          created_at: string
          id: string
          ig_user_id: string | null
          label: string | null
          last_posts_sync_at: string | null
          last_refreshed_at: string | null
          meta_app_id: string | null
          owner_user_id: string
          page_id: string | null
          refresh_error: string | null
          refresh_status: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          connection_status?: string
          created_at?: string
          id?: string
          ig_user_id?: string | null
          label?: string | null
          last_posts_sync_at?: string | null
          last_refreshed_at?: string | null
          meta_app_id?: string | null
          owner_user_id: string
          page_id?: string | null
          refresh_error?: string | null
          refresh_status?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          connection_status?: string
          created_at?: string
          id?: string
          ig_user_id?: string | null
          label?: string | null
          last_posts_sync_at?: string | null
          last_refreshed_at?: string | null
          meta_app_id?: string | null
          owner_user_id?: string
          page_id?: string | null
          refresh_error?: string | null
          refresh_status?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      instagram_posts: {
        Row: {
          caption: string | null
          connection_id: string
          id: string
          media_type: string
          media_url: string | null
          permalink: string | null
          posted_at: string | null
          raw_json: Json | null
          synced_at: string
          thumbnail_url: string | null
        }
        Insert: {
          caption?: string | null
          connection_id: string
          id: string
          media_type: string
          media_url?: string | null
          permalink?: string | null
          posted_at?: string | null
          raw_json?: Json | null
          synced_at?: string
          thumbnail_url?: string | null
        }
        Update: {
          caption?: string | null
          connection_id?: string
          id?: string
          media_type?: string
          media_url?: string | null
          permalink?: string | null
          posted_at?: string | null
          raw_json?: Json | null
          synced_at?: string
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'instagram_posts_connection_id_fkey'
            columns: ['connection_id']
            isOneToOne: false
            referencedRelation: 'instagram_connections'
            referencedColumns: ['id']
          },
        ]
      }
      instagram_webhook_events: {
        Row: {
          attempts: number
          connection_id: string | null
          dedupe_key: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          meta_app_id: string | null
          next_attempt_at: string | null
          owner_user_id: string
          payload: Json
          processed_at: string | null
          received_at: string
          status: string
        }
        Insert: {
          attempts?: number
          connection_id?: string | null
          dedupe_key: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          meta_app_id?: string | null
          next_attempt_at?: string | null
          owner_user_id: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          status?: string
        }
        Update: {
          attempts?: number
          connection_id?: string | null
          dedupe_key?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          meta_app_id?: string | null
          next_attempt_at?: string | null
          owner_user_id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'instagram_webhook_events_connection_id_fkey'
            columns: ['connection_id']
            isOneToOne: false
            referencedRelation: 'instagram_connections'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof DatabaseWithoutInternals, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer Row
    }
    ? Row
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer Row
      }
      ? Row
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer Insert
    }
    ? Insert
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends { Insert: infer Insert }
      ? Insert
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer Update
    }
    ? Update
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends { Update: infer Update }
      ? Update
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
