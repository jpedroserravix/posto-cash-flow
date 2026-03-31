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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      conciliacao_brinks: {
        Row: {
          created_at: string
          id: string
          lote_id: string
          posto_id: string
          total_brinks: number
          valor_banco: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          lote_id: string
          posto_id: string
          total_brinks?: number
          valor_banco?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          lote_id?: string
          posto_id?: string
          total_brinks?: number
          valor_banco?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliacao_brinks_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_bancarias: {
        Row: {
          agencia: string
          banco: string
          conta: string
          created_at: string
          id: string
          posto_id: string
        }
        Insert: {
          agencia: string
          banco: string
          conta: string
          created_at?: string
          id?: string
          posto_id: string
        }
        Update: {
          agencia?: string
          banco?: string
          conta?: string
          created_at?: string
          id?: string
          posto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      depositos_brinks: {
        Row: {
          centro_custo: string | null
          conciliado_banco_id: string | null
          created_at: string
          data_caixa: string | null
          data_deposito: string
          depositante: string
          id: string
          lote_id: string
          moeda: string
          observacao: string | null
          posto_id: string
          tipo: string
          turno: string | null
          valor: number
        }
        Insert: {
          centro_custo?: string | null
          conciliado_banco_id?: string | null
          created_at?: string
          data_caixa?: string | null
          data_deposito: string
          depositante: string
          id?: string
          lote_id: string
          moeda: string
          observacao?: string | null
          posto_id: string
          tipo: string
          turno?: string | null
          valor: number
        }
        Update: {
          centro_custo?: string | null
          conciliado_banco_id?: string | null
          created_at?: string
          data_caixa?: string | null
          data_deposito?: string
          depositante?: string
          id?: string
          lote_id?: string
          moeda?: string
          observacao?: string | null
          posto_id?: string
          tipo?: string
          turno?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "depositos_brinks_conciliado_banco_id_fkey"
            columns: ["conciliado_banco_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_brinks_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      depositos_manuais: {
        Row: {
          centro_custo: string | null
          conciliado_banco_id: string | null
          conferido: string
          created_at: string
          data: string
          id: string
          observacao: string | null
          posto_id: string
          turno: string
          valor_depositado: number | null
          valor_lancado: number
        }
        Insert: {
          centro_custo?: string | null
          conciliado_banco_id?: string | null
          conferido?: string
          created_at?: string
          data: string
          id?: string
          observacao?: string | null
          posto_id: string
          turno: string
          valor_depositado?: number | null
          valor_lancado: number
        }
        Update: {
          centro_custo?: string | null
          conciliado_banco_id?: string | null
          conferido?: string
          created_at?: string
          data?: string
          id?: string
          observacao?: string | null
          posto_id?: string
          turno?: string
          valor_depositado?: number | null
          valor_lancado?: number
        }
        Relationships: [
          {
            foreignKeyName: "depositos_manuais_conciliado_banco_id_fkey"
            columns: ["conciliado_banco_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_manuais_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      postos: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      resumo_conferencia: {
        Row: {
          centro_custo: string | null
          conferido: string
          created_at: string
          data: string
          id: string
          observacao: string | null
          posto_id: string
          turno: string
        }
        Insert: {
          centro_custo?: string | null
          conferido?: string
          created_at?: string
          data: string
          id?: string
          observacao?: string | null
          posto_id: string
          turno: string
        }
        Update: {
          centro_custo?: string | null
          conferido?: string
          created_at?: string
          data?: string
          id?: string
          observacao?: string | null
          posto_id?: string
          turno?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumo_conferencia_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_posto: {
        Row: {
          id: string
          posto_id: string
          user_id: string
        }
        Insert: {
          id?: string
          posto_id: string
          user_id: string
        }
        Update: {
          id?: string
          posto_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_posto_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_posto_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "funcionario"
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
    Enums: {
      app_role: ["admin", "funcionario"],
    },
  },
} as const
