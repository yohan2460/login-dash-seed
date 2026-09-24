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
      aplicaciones_saldo: {
        Row: {
          created_at: string
          factura_destino_id: string
          fecha_aplicacion: string
          id: string
          medio_pago: string | null
          monto_aplicado: number
          saldo_favor_id: string
        }
        Insert: {
          created_at?: string
          factura_destino_id: string
          fecha_aplicacion?: string
          id?: string
          medio_pago?: string | null
          monto_aplicado: number
          saldo_favor_id: string
        }
        Update: {
          created_at?: string
          factura_destino_id?: string
          fecha_aplicacion?: string
          id?: string
          medio_pago?: string | null
          monto_aplicado?: number
          saldo_favor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_saldo_factura_destino_id_fkey"
            columns: ["factura_destino_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_saldo_saldo_favor_id_fkey"
            columns: ["saldo_favor_id"]
            isOneToOne: false
            referencedRelation: "saldos_favor"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes_pago: {
        Row: {
          cantidad_facturas: number
          created_at: string
          detalles: Json | null
          facturas_ids: string[]
          fecha_pago: string
          id: string
          metodo_pago: string
          pdf_file_path: string
          soporte_pago_file_path: string | null
          tipo_comprobante: string
          total_pagado: number
          user_id: string
        }
        Insert: {
          cantidad_facturas?: number
          created_at?: string
          detalles?: Json | null
          facturas_ids: string[]
          fecha_pago: string
          id?: string
          metodo_pago: string
          pdf_file_path: string
          soporte_pago_file_path?: string | null
          tipo_comprobante: string
          total_pagado: number
          user_id: string
        }
        Update: {
          cantidad_facturas?: number
          created_at?: string
          detalles?: Json | null
          facturas_ids?: string[]
          fecha_pago?: string
          id?: string
          metodo_pago?: string
          pdf_file_path?: string
          soporte_pago_file_path?: string | null
          tipo_comprobante?: string
          total_pagado?: number
          user_id?: string
        }
        Relationships: []
      }
      facturas: {
        Row: {
          clasificacion: string | null
          clasificacion_original: string | null
          created_at: string
          descripcion: string | null
          descuentos_antes_iva: string | null
          emisor_nit: string
          emisor_nombre: string
          es_nota_credito: boolean | null
          estado_mercancia: string | null
          estado_nota_credito: string | null
          factura_cufe: string | null
          factura_iva: number | null
          factura_iva_5: number | null
          factura_iva_5_porcentaje: number | null
          factura_iva_porcentaje: number | null
          factura_original_id: string | null
          fecha_emision: string | null
          fecha_pago: string | null
          fecha_vencimiento: string | null
          id: string
          ingresado_sistema: boolean | null
          metodo_pago: string | null
          monto_pagado: number | null
          monto_retencion: number | null
          nombre_carpeta_factura: string | null
          notas: string | null
          numero_factura: string
          numero_serie: number | null
          pdf_file_path: string | null
          porcentaje_pronto_pago: number | null
          tiene_retencion: boolean | null
          total_a_pagar: number
          total_con_descuento: number | null
          total_original: number | null
          total_sin_iva: number | null
          updated_at: string
          user_id: string
          uso_pronto_pago: boolean | null
          valor_nota_credito: number | null
          valor_real_a_pagar: number | null
        }
        Insert: {
          clasificacion?: string | null
          clasificacion_original?: string | null
          created_at?: string
          descripcion?: string | null
          descuentos_antes_iva?: string | null
          emisor_nit: string
          emisor_nombre: string
          es_nota_credito?: boolean | null
          estado_mercancia?: string | null
          estado_nota_credito?: string | null
          factura_cufe?: string | null
          factura_iva?: number | null
          factura_iva_5?: number | null
          factura_iva_5_porcentaje?: number | null
          factura_iva_porcentaje?: number | null
          factura_original_id?: string | null
          fecha_emision?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          ingresado_sistema?: boolean | null
          metodo_pago?: string | null
          monto_pagado?: number | null
          monto_retencion?: number | null
          nombre_carpeta_factura?: string | null
          notas?: string | null
          numero_factura: string
          numero_serie?: number | null
          pdf_file_path?: string | null
          porcentaje_pronto_pago?: number | null
          tiene_retencion?: boolean | null
          total_a_pagar: number
          total_con_descuento?: number | null
          total_original?: number | null
          total_sin_iva?: number | null
          updated_at?: string
          user_id: string
          uso_pronto_pago?: boolean | null
          valor_nota_credito?: number | null
          valor_real_a_pagar?: number | null
        }
        Update: {
          clasificacion?: string | null
          clasificacion_original?: string | null
          created_at?: string
          descripcion?: string | null
          descuentos_antes_iva?: string | null
          emisor_nit?: string
          emisor_nombre?: string
          es_nota_credito?: boolean | null
          estado_mercancia?: string | null
          estado_nota_credito?: string | null
          factura_cufe?: string | null
          factura_iva?: number | null
          factura_iva_5?: number | null
          factura_iva_5_porcentaje?: number | null
          factura_iva_porcentaje?: number | null
          factura_original_id?: string | null
          fecha_emision?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          ingresado_sistema?: boolean | null
          metodo_pago?: string | null
          monto_pagado?: number | null
          monto_retencion?: number | null
          nombre_carpeta_factura?: string | null
          notas?: string | null
          numero_factura?: string
          numero_serie?: number | null
          pdf_file_path?: string | null
          porcentaje_pronto_pago?: number | null
          tiene_retencion?: boolean | null
          total_a_pagar?: number
          total_con_descuento?: number | null
          total_original?: number | null
          total_sin_iva?: number | null
          updated_at?: string
          user_id?: string
          uso_pronto_pago?: boolean | null
          valor_nota_credito?: number | null
          valor_real_a_pagar?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_factura_original_id_fkey"
            columns: ["factura_original_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_partidos: {
        Row: {
          created_at: string
          factura_id: string
          fecha_pago: string
          id: string
          metodo_pago: string
          monto: number
        }
        Insert: {
          created_at?: string
          factura_id: string
          fecha_pago: string
          id?: string
          metodo_pago: string
          monto: number
        }
        Update: {
          created_at?: string
          factura_id?: string
          fecha_pago?: string
          id?: string
          metodo_pago?: string
          monto?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagos_partidos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saldos_favor: {
        Row: {
          created_at: string
          descripcion: string | null
          emisor_nit: string
          emisor_nombre: string
          estado: string
          factura_origen_id: string | null
          fecha_generacion: string
          id: string
          medio_pago: string
          monto_inicial: number
          motivo: string
          numero_factura_origen: string | null
          saldo_disponible: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          emisor_nit: string
          emisor_nombre: string
          estado?: string
          factura_origen_id?: string | null
          fecha_generacion?: string
          id?: string
          medio_pago?: string
          monto_inicial: number
          motivo: string
          numero_factura_origen?: string | null
          saldo_disponible: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          emisor_nit?: string
          emisor_nombre?: string
          estado?: string
          factura_origen_id?: string | null
          fecha_generacion?: string
          id?: string
          medio_pago?: string
          monto_inicial?: number
          motivo?: string
          numero_factura_origen?: string | null
          saldo_disponible?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saldos_favor_factura_origen_id_fkey"
            columns: ["factura_origen_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      admin_create_user: {
        Args: { user_email: string; user_password: string }
        Returns: Json
      }
      aplicar_saldo_favor: {
        Args: {
          p_factura_destino_id: string
          p_monto_aplicado: number
          p_saldo_favor_id: string
        }
        Returns: string
      }
      get_system_user_id: { Args: never; Returns: string }
      has_admin_role: { Args: { user_uuid: string }; Returns: boolean }
      insert_sample_facturas: { Args: never; Returns: undefined }
      revertir_aplicacion_saldo: {
        Args: { p_aplicacion_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
