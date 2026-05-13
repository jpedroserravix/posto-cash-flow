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
      acessos_senhas: {
        Row: {
          atualizado_por_nome: string | null
          celular: string | null
          created_at: string
          criado_por_nome: string | null
          email_recuperacao: string | null
          id: string
          login: string | null
          nome_servico: string
          observacoes: string | null
          posto_id: string | null
          senha: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          atualizado_por_nome?: string | null
          celular?: string | null
          created_at?: string
          criado_por_nome?: string | null
          email_recuperacao?: string | null
          id?: string
          login?: string | null
          nome_servico: string
          observacoes?: string | null
          posto_id?: string | null
          senha?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          atualizado_por_nome?: string | null
          celular?: string | null
          created_at?: string
          criado_por_nome?: string | null
          email_recuperacao?: string | null
          id?: string
          login?: string | null
          nome_servico?: string
          observacoes?: string | null
          posto_id?: string | null
          senha?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acessos_senhas_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      afericoes: {
        Row: {
          created_at: string
          criado_por_nome: string | null
          data: string
          foto_path: string | null
          foto_type: string | null
          id: string
          pdf_path: string | null
          posto_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por_nome?: string | null
          data: string
          foto_path?: string | null
          foto_type?: string | null
          id?: string
          pdf_path?: string | null
          posto_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por_nome?: string | null
          data?: string
          foto_path?: string | null
          foto_type?: string | null
          id?: string
          pdf_path?: string | null
          posto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "afericoes_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      afericoes_itens: {
        Row: {
          afericao_id: string
          afericao_lenta: number | null
          afericao_rapida: number | null
          bico: number
          combustivel: string
          created_at: string
          id: string
          is_repeticao: boolean
        }
        Insert: {
          afericao_id: string
          afericao_lenta?: number | null
          afericao_rapida?: number | null
          bico: number
          combustivel: string
          created_at?: string
          id?: string
          is_repeticao?: boolean
        }
        Update: {
          afericao_id?: string
          afericao_lenta?: number | null
          afericao_rapida?: number | null
          bico?: number
          combustivel?: string
          created_at?: string
          id?: string
          is_repeticao?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "afericoes_itens_afericao_id_fkey"
            columns: ["afericao_id"]
            isOneToOne: false
            referencedRelation: "afericoes"
            referencedColumns: ["id"]
          },
        ]
      }
      candidatos_diarias: {
        Row: {
          candidato_id: string
          created_at: string | null
          data: string
          horario_entrada: string
          horario_saida: string
          id: string
          observacoes_gerente: string | null
          posto_id: string
          valor: number | null
        }
        Insert: {
          candidato_id: string
          created_at?: string | null
          data: string
          horario_entrada: string
          horario_saida: string
          id?: string
          observacoes_gerente?: string | null
          posto_id: string
          valor?: number | null
        }
        Update: {
          candidato_id?: string
          created_at?: string | null
          data?: string
          horario_entrada?: string
          horario_saida?: string
          id?: string
          observacoes_gerente?: string | null
          posto_id?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidatos_diarias_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "pessoal_candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_diarias_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      candidatos_entrevistas: {
        Row: {
          candidato_id: string
          created_at: string | null
          data_entrevista: string
          dispensado_definitivamente: boolean | null
          entrevistador: string | null
          horario: string
          id: string
          local: string | null
          motivo_reprovacao: string | null
          observacoes: string | null
          posto_id: string
          resultado: string | null
          status_resultante: string | null
          updated_at: string | null
        }
        Insert: {
          candidato_id: string
          created_at?: string | null
          data_entrevista: string
          dispensado_definitivamente?: boolean | null
          entrevistador?: string | null
          horario: string
          id?: string
          local?: string | null
          motivo_reprovacao?: string | null
          observacoes?: string | null
          posto_id: string
          resultado?: string | null
          status_resultante?: string | null
          updated_at?: string | null
        }
        Update: {
          candidato_id?: string
          created_at?: string | null
          data_entrevista?: string
          dispensado_definitivamente?: boolean | null
          entrevistador?: string | null
          horario?: string
          id?: string
          local?: string | null
          motivo_reprovacao?: string | null
          observacoes?: string | null
          posto_id?: string
          resultado?: string | null
          status_resultante?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidatos_entrevistas_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "pessoal_candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatos_entrevistas_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      comprovantes_despesas: {
        Row: {
          centro_custo: string | null
          created_at: string
          data_caixa: string
          file_name: string
          file_path: string
          file_type: string
          id: string
          observacao: string | null
          posto_id: string
          tipo: string | null
          titulo: string | null
          turno: string | null
        }
        Insert: {
          centro_custo?: string | null
          created_at?: string
          data_caixa: string
          file_name: string
          file_path: string
          file_type: string
          id?: string
          observacao?: string | null
          posto_id: string
          tipo?: string | null
          titulo?: string | null
          turno?: string | null
        }
        Update: {
          centro_custo?: string | null
          created_at?: string
          data_caixa?: string
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          observacao?: string | null
          posto_id?: string
          tipo?: string | null
          titulo?: string | null
          turno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprovantes_despesas_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cursos: {
        Row: {
          cargos_obrigatorios: string[]
          created_at: string
          descricao: string | null
          id: string
          nome: string
          obrigatorio: boolean
          updated_at: string
          validade_meses: number | null
        }
        Insert: {
          cargos_obrigatorios?: string[]
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          obrigatorio?: boolean
          updated_at?: string
          validade_meses?: number | null
        }
        Update: {
          cargos_obrigatorios?: string[]
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          obrigatorio?: boolean
          updated_at?: string
          validade_meses?: number | null
        }
        Relationships: []
      }
      depositos_brinks: {
        Row: {
          centro_custo: string | null
          conciliado_banco_id: string | null
          conciliado_forcado: boolean
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
          conciliado_forcado?: boolean
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
          conciliado_forcado?: boolean
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
          comprovante_path: string | null
          comprovante_type: string | null
          conciliado_banco_id: string | null
          conferido: string
          created_at: string
          criado_por_nome: string | null
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
          comprovante_path?: string | null
          comprovante_type?: string | null
          conciliado_banco_id?: string | null
          conferido?: string
          created_at?: string
          criado_por_nome?: string | null
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
          comprovante_path?: string | null
          comprovante_type?: string | null
          conciliado_banco_id?: string | null
          conferido?: string
          created_at?: string
          criado_por_nome?: string | null
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
      documentos_alvaras: {
        Row: {
          arquivo_path: string | null
          arquivo_type: string | null
          created_at: string
          data_vencimento: string | null
          id: string
          nome_documento: string
          numero: string | null
          observacoes: string | null
          posto_id: string
          prazo_lembrete_dias: number
          updated_at: string
        }
        Insert: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          data_vencimento?: string | null
          id?: string
          nome_documento: string
          numero?: string | null
          observacoes?: string | null
          posto_id: string
          prazo_lembrete_dias?: number
          updated_at?: string
        }
        Update: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          data_vencimento?: string | null
          id?: string
          nome_documento?: string
          numero?: string | null
          observacoes?: string | null
          posto_id?: string
          prazo_lembrete_dias?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_alvaras_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_contabilidade: {
        Row: {
          ano: number
          arquivo_path: string
          arquivo_type: string
          created_at: string
          id: string
          mes: number
          observacoes: string | null
          posto_id: string
          tipo: string
          tipo_custom: string | null
        }
        Insert: {
          ano: number
          arquivo_path: string
          arquivo_type: string
          created_at?: string
          id?: string
          mes: number
          observacoes?: string | null
          posto_id: string
          tipo: string
          tipo_custom?: string | null
        }
        Update: {
          ano?: number
          arquivo_path?: string
          arquivo_type?: string
          created_at?: string
          id?: string
          mes?: number
          observacoes?: string | null
          posto_id?: string
          tipo?: string
          tipo_custom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_contabilidade_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_empresa: {
        Row: {
          arquivo_path: string | null
          arquivo_type: string | null
          created_at: string
          id: string
          numero: string | null
          observacoes: string | null
          posto_id: string
          tipo: string
          tipo_custom: string | null
          updated_at: string
        }
        Insert: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          id?: string
          numero?: string | null
          observacoes?: string | null
          posto_id: string
          tipo: string
          tipo_custom?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          id?: string
          numero?: string | null
          observacoes?: string | null
          posto_id?: string
          tipo?: string
          tipo_custom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_empresa_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_identidade_visual: {
        Row: {
          arquivo_path: string
          arquivo_type: string
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          posto_id: string
          tipo: string
          tipo_custom: string | null
        }
        Insert: {
          arquivo_path: string
          arquivo_type: string
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          posto_id: string
          tipo: string
          tipo_custom?: string | null
        }
        Update: {
          arquivo_path?: string
          arquivo_type?: string
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          posto_id?: string
          tipo?: string
          tipo_custom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_identidade_visual_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      extrato_bancario: {
        Row: {
          conciliado: boolean
          conta_bancaria_id: string
          created_at: string
          data_lancamento: string
          deposito_brinks_ids: string[] | null
          fitid: string
          id: string
          memo: string | null
          posto_id: string
          tipo: string | null
          valor: number
        }
        Insert: {
          conciliado?: boolean
          conta_bancaria_id: string
          created_at?: string
          data_lancamento: string
          deposito_brinks_ids?: string[] | null
          fitid: string
          id?: string
          memo?: string | null
          posto_id: string
          tipo?: string | null
          valor: number
        }
        Update: {
          conciliado?: boolean
          conta_bancaria_id?: string
          created_at?: string
          data_lancamento?: string
          deposito_brinks_ids?: string[] | null
          fitid?: string
          id?: string
          memo?: string | null
          posto_id?: string
          tipo?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "extrato_bancario_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionario_treinamentos: {
        Row: {
          certificado_path: string | null
          certificado_type: string | null
          created_at: string
          curso_id: string
          data_conclusao: string | null
          data_vencimento: string | null
          funcionario_id: string
          id: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          certificado_path?: string | null
          certificado_type?: string | null
          created_at?: string
          curso_id: string
          data_conclusao?: string | null
          data_vencimento?: string | null
          funcionario_id: string
          id?: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          certificado_path?: string | null
          certificado_type?: string | null
          created_at?: string
          curso_id?: string
          data_conclusao?: string | null
          data_vencimento?: string | null
          funcionario_id?: string
          id?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funcionario_treinamentos_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionario_treinamentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "pessoal_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      identidade_visual_compartilhada: {
        Row: {
          created_at: string
          doc_id: string
          id: string
          posto_destino: string
        }
        Insert: {
          created_at?: string
          doc_id: string
          id?: string
          posto_destino: string
        }
        Update: {
          created_at?: string
          doc_id?: string
          id?: string
          posto_destino?: string
        }
        Relationships: [
          {
            foreignKeyName: "identidade_visual_compartilhada_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "documentos_identidade_visual"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identidade_visual_compartilhada_posto_destino_fkey"
            columns: ["posto_destino"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_configuracoes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          lista: string
          ordem: number
          valor: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          lista: string
          ordem?: number
          valor: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          lista?: string
          ordem?: number
          valor?: string
        }
        Relationships: []
      }
      mural_recados: {
        Row: {
          created_at: string
          criado_por: string
          criado_por_nome: string
          expira_em: string | null
          id: string
          posto_id: string
          texto: string
          urgente: boolean
        }
        Insert: {
          created_at?: string
          criado_por: string
          criado_por_nome: string
          expira_em?: string | null
          id?: string
          posto_id: string
          texto: string
          urgente?: boolean
        }
        Update: {
          created_at?: string
          criado_por?: string
          criado_por_nome?: string
          expira_em?: string | null
          id?: string
          posto_id?: string
          texto?: string
          urgente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mural_recados_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          arquivo_path: string | null
          arquivo_type: string | null
          created_at: string
          data_compra: string | null
          descricao_item: string
          fornecedor: string
          id: string
          observacoes: string | null
          posto_id: string
          prazo_lembrete_dias: number
          updated_at: string
          valor: number | null
          vencimento_garantia: string | null
        }
        Insert: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          data_compra?: string | null
          descricao_item: string
          fornecedor: string
          id?: string
          observacoes?: string | null
          posto_id: string
          prazo_lembrete_dias?: number
          updated_at?: string
          valor?: number | null
          vencimento_garantia?: string | null
        }
        Update: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          data_compra?: string | null
          descricao_item?: string
          fornecedor?: string
          id?: string
          observacoes?: string | null
          posto_id?: string
          prazo_lembrete_dias?: number
          updated_at?: string
          valor?: number | null
          vencimento_garantia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais_compra: {
        Row: {
          boleto_path: string | null
          boleto_type: string | null
          created_at: string
          data_chegada: string | null
          enviado_por: string | null
          enviado_por_nome: string | null
          fornecedor: string
          id: string
          mercadoria_path: string | null
          mercadoria_type: string | null
          nf_path: string | null
          nf_type: string | null
          observacoes: string | null
          pedido_id: string | null
          posto_id: string
          status: string
        }
        Insert: {
          boleto_path?: string | null
          boleto_type?: string | null
          created_at?: string
          data_chegada?: string | null
          enviado_por?: string | null
          enviado_por_nome?: string | null
          fornecedor: string
          id?: string
          mercadoria_path?: string | null
          mercadoria_type?: string | null
          nf_path?: string | null
          nf_type?: string | null
          observacoes?: string | null
          pedido_id?: string | null
          posto_id: string
          status?: string
        }
        Update: {
          boleto_path?: string | null
          boleto_type?: string | null
          created_at?: string
          data_chegada?: string | null
          enviado_por?: string | null
          enviado_por_nome?: string | null
          fornecedor?: string
          id?: string
          mercadoria_path?: string | null
          mercadoria_type?: string | null
          nf_path?: string | null
          nf_type?: string | null
          observacoes?: string | null
          pedido_id?: string | null
          posto_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_compra_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_compra_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais_compra_historico: {
        Row: {
          created_at: string
          feito_por: string | null
          feito_por_nome: string | null
          id: string
          nota_id: string
          observacao: string | null
          status_anterior: string | null
          status_novo: string
        }
        Insert: {
          created_at?: string
          feito_por?: string | null
          feito_por_nome?: string | null
          id?: string
          nota_id: string
          observacao?: string | null
          status_anterior?: string | null
          status_novo: string
        }
        Update: {
          created_at?: string
          feito_por?: string | null
          feito_por_nome?: string | null
          id?: string
          nota_id?: string
          observacao?: string | null
          status_anterior?: string | null
          status_novo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_compra_historico_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          arquivo_path: string | null
          arquivo_type: string | null
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          fornecedor: string | null
          id: string
          numero: string | null
          observacoes: string | null
          posto_id: string
          status: string
          updated_at: string
        }
        Insert: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          fornecedor?: string | null
          id?: string
          numero?: string | null
          observacoes?: string | null
          posto_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          fornecedor?: string | null
          id?: string
          numero?: string | null
          observacoes?: string | null
          posto_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra_historico: {
        Row: {
          alterado_por: string | null
          alterado_por_nome: string | null
          created_at: string
          id: string
          observacoes: string | null
          pedido_id: string
          status: string
        }
        Insert: {
          alterado_por?: string | null
          alterado_por_nome?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          pedido_id: string
          status: string
        }
        Update: {
          alterado_por?: string | null
          alterado_por_nome?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          pedido_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_historico_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_candidatos: {
        Row: {
          cargo_pretendido: string
          cpf: string
          created_at: string
          funcionario_id: string | null
          id: string
          nome: string
          observacoes: string | null
          posto_id: string
          status: string
          telefone: string | null
          telefone_terceiro: boolean
          terceiro_nome: string | null
          terceiro_parentesco: string | null
          updated_at: string
        }
        Insert: {
          cargo_pretendido: string
          cpf: string
          created_at?: string
          funcionario_id?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          posto_id: string
          status?: string
          telefone?: string | null
          telefone_terceiro?: boolean
          terceiro_nome?: string | null
          terceiro_parentesco?: string | null
          updated_at?: string
        }
        Update: {
          cargo_pretendido?: string
          cpf?: string
          created_at?: string
          funcionario_id?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          posto_id?: string
          status?: string
          telefone?: string | null
          telefone_terceiro?: boolean
          terceiro_nome?: string | null
          terceiro_parentesco?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_candidatos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "pessoal_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoal_candidatos_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_desligamentos: {
        Row: {
          arquivo_path: string | null
          created_at: string
          data_desligamento: string
          funcionario_id: string
          id: string
          motivo: string
          observacoes: string | null
          pode_recontratar: boolean | null
        }
        Insert: {
          arquivo_path?: string | null
          created_at?: string
          data_desligamento: string
          funcionario_id: string
          id?: string
          motivo: string
          observacoes?: string | null
          pode_recontratar?: boolean | null
        }
        Update: {
          arquivo_path?: string | null
          created_at?: string
          data_desligamento?: string
          funcionario_id?: string
          id?: string
          motivo?: string
          observacoes?: string | null
          pode_recontratar?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_desligamentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "pessoal_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_documentos: {
        Row: {
          arquivo_path: string
          created_at: string
          funcionario_id: string
          id: string
          nome_arquivo: string
          observacoes: string | null
          tipo: string
        }
        Insert: {
          arquivo_path: string
          created_at?: string
          funcionario_id: string
          id?: string
          nome_arquivo: string
          observacoes?: string | null
          tipo: string
        }
        Update: {
          arquivo_path?: string
          created_at?: string
          funcionario_id?: string
          id?: string
          nome_arquivo?: string
          observacoes?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_documentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "pessoal_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_entregas_epi: {
        Row: {
          comprovante_path: string | null
          comprovante_type: string | null
          created_at: string
          data_entrega: string
          funcionario_id: string
          id: string
          observacoes: string | null
          posto_id: string
        }
        Insert: {
          comprovante_path?: string | null
          comprovante_type?: string | null
          created_at?: string
          data_entrega: string
          funcionario_id: string
          id?: string
          observacoes?: string | null
          posto_id: string
        }
        Update: {
          comprovante_path?: string | null
          comprovante_type?: string | null
          created_at?: string
          data_entrega?: string
          funcionario_id?: string
          id?: string
          observacoes?: string | null
          posto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_entregas_epi_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "pessoal_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoal_entregas_epi_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_entregas_epi_itens: {
        Row: {
          entrega_id: string
          id: string
          quantidade: number
          tipo_item: string
        }
        Insert: {
          entrega_id: string
          id?: string
          quantidade: number
          tipo_item: string
        }
        Update: {
          entrega_id?: string
          id?: string
          quantidade?: number
          tipo_item?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_entregas_epi_itens_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "pessoal_entregas_epi"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_fechamentos: {
        Row: {
          advertencias: number
          ano: number
          atestados: number
          atrasos: number
          created_at: string
          descontos: number
          faltas: number
          fechado: boolean
          funcionario_id: string
          horas_extra: number
          id: string
          mes: number
          observacoes: string | null
          posto_id: string
          premiacao: number
          quebra_caixa: number
          suspensoes: number
          vale_transporte: number
        }
        Insert: {
          advertencias?: number
          ano: number
          atestados?: number
          atrasos?: number
          created_at?: string
          descontos?: number
          faltas?: number
          fechado?: boolean
          funcionario_id: string
          horas_extra?: number
          id?: string
          mes: number
          observacoes?: string | null
          posto_id: string
          premiacao?: number
          quebra_caixa?: number
          suspensoes?: number
          vale_transporte?: number
        }
        Update: {
          advertencias?: number
          ano?: number
          atestados?: number
          atrasos?: number
          created_at?: string
          descontos?: number
          faltas?: number
          fechado?: boolean
          funcionario_id?: string
          horas_extra?: number
          id?: string
          mes?: number
          observacoes?: string | null
          posto_id?: string
          premiacao?: number
          quebra_caixa?: number
          suspensoes?: number
          vale_transporte?: number
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_fechamentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "pessoal_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoal_fechamentos_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_ferias: {
        Row: {
          alerta_meses: number
          arquivo_path: string | null
          arquivo_type: string | null
          created_at: string
          data_fim: string
          data_inicio: string
          dias_gozados: number
          dias_vendidos: number
          funcionario_id: string
          id: string
          observacoes: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          posto_id: string
          saldo_dias: number
          updated_at: string
        }
        Insert: {
          alerta_meses?: number
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          data_fim: string
          data_inicio: string
          dias_gozados: number
          dias_vendidos?: number
          funcionario_id: string
          id?: string
          observacoes?: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          posto_id: string
          saldo_dias?: number
          updated_at?: string
        }
        Update: {
          alerta_meses?: number
          arquivo_path?: string | null
          arquivo_type?: string | null
          created_at?: string
          data_fim?: string
          data_inicio?: string
          dias_gozados?: number
          dias_vendidos?: number
          funcionario_id?: string
          id?: string
          observacoes?: string | null
          periodo_aquisitivo_fim?: string
          periodo_aquisitivo_inicio?: string
          posto_id?: string
          saldo_dias?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_ferias_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "pessoal_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoal_ferias_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_funcionarios: {
        Row: {
          adicional_noturno: boolean
          carga_horaria_semanal: number
          cargo: string
          cpf: string
          created_at: string
          data_admissao: string
          data_nascimento: string | null
          em_experiencia: boolean
          email: string | null
          emergencia_nome: string | null
          emergencia_parentesco: string | null
          emergencia_parentesco_outro: string | null
          emergencia_telefone: string | null
          escala_outros: string | null
          escala_trabalho: string | null
          experiencia_efetivado: boolean
          horario_entrada: string | null
          horario_sabado_entrada: string | null
          horario_sabado_saida: string | null
          horario_saida: string | null
          horas_extras_fixas_mes: number
          id: string
          inicio_experiencia: string | null
          intervalo_descanso: number | null
          nome: string
          observacoes: string | null
          posto_id: string
          prazo_experiencia: number | null
          prazo_renovacao: number | null
          renovavel: boolean | null
          rg: string | null
          status: string
          telefone: string | null
        }
        Insert: {
          adicional_noturno?: boolean
          carga_horaria_semanal?: number
          cargo: string
          cpf: string
          created_at?: string
          data_admissao: string
          data_nascimento?: string | null
          em_experiencia?: boolean
          email?: string | null
          emergencia_nome?: string | null
          emergencia_parentesco?: string | null
          emergencia_parentesco_outro?: string | null
          emergencia_telefone?: string | null
          escala_outros?: string | null
          escala_trabalho?: string | null
          experiencia_efetivado?: boolean
          horario_entrada?: string | null
          horario_sabado_entrada?: string | null
          horario_sabado_saida?: string | null
          horario_saida?: string | null
          horas_extras_fixas_mes?: number
          id?: string
          inicio_experiencia?: string | null
          intervalo_descanso?: number | null
          nome: string
          observacoes?: string | null
          posto_id: string
          prazo_experiencia?: number | null
          prazo_renovacao?: number | null
          renovavel?: boolean | null
          rg?: string | null
          status?: string
          telefone?: string | null
        }
        Update: {
          adicional_noturno?: boolean
          carga_horaria_semanal?: number
          cargo?: string
          cpf?: string
          created_at?: string
          data_admissao?: string
          data_nascimento?: string | null
          em_experiencia?: boolean
          email?: string | null
          emergencia_nome?: string | null
          emergencia_parentesco?: string | null
          emergencia_parentesco_outro?: string | null
          emergencia_telefone?: string | null
          escala_outros?: string | null
          escala_trabalho?: string | null
          experiencia_efetivado?: boolean
          horario_entrada?: string | null
          horario_sabado_entrada?: string | null
          horario_sabado_saida?: string | null
          horario_saida?: string | null
          horas_extras_fixas_mes?: number
          id?: string
          inicio_experiencia?: string | null
          intervalo_descanso?: number | null
          nome?: string
          observacoes?: string | null
          posto_id?: string
          prazo_experiencia?: number | null
          prazo_renovacao?: number | null
          renovavel?: boolean | null
          rg?: string | null
          status?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_funcionarios_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoal_ocorrencias: {
        Row: {
          arquivo_path: string | null
          created_at: string
          data: string
          descricao: string | null
          funcionario_id: string
          horas: number | null
          id: string
          posto_id: string
          tipo: string
          valor: number | null
        }
        Insert: {
          arquivo_path?: string | null
          created_at?: string
          data: string
          descricao?: string | null
          funcionario_id: string
          horas?: number | null
          id?: string
          posto_id: string
          tipo: string
          valor?: number | null
        }
        Update: {
          arquivo_path?: string | null
          created_at?: string
          data?: string
          descricao?: string | null
          funcionario_id?: string
          horas?: number | null
          id?: string
          posto_id?: string
          tipo?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoal_ocorrencias_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "pessoal_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoal_ocorrencias_posto_id_fkey"
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
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          nome: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome?: string
        }
        Relationships: []
      }
      publico_curriculos: {
        Row: {
          arquivo_path: string | null
          arquivo_type: string | null
          bairro: string | null
          candidato_id: string | null
          cargo_desejado: string
          cidade: string | null
          cpf: string
          created_at: string
          experiencia: string | null
          id: string
          nome: string
          posto_id: string | null
          rg: string | null
          status: string
          whatsapp: string
        }
        Insert: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          bairro?: string | null
          candidato_id?: string | null
          cargo_desejado: string
          cidade?: string | null
          cpf: string
          created_at?: string
          experiencia?: string | null
          id?: string
          nome: string
          posto_id?: string | null
          rg?: string | null
          status?: string
          whatsapp: string
        }
        Update: {
          arquivo_path?: string | null
          arquivo_type?: string | null
          bairro?: string | null
          candidato_id?: string | null
          cargo_desejado?: string
          cidade?: string | null
          cpf?: string
          created_at?: string
          experiencia?: string | null
          id?: string
          nome?: string
          posto_id?: string | null
          rg?: string | null
          status?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "publico_curriculos_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "pessoal_candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publico_curriculos_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      publico_feedback: {
        Row: {
          created_at: string
          id: string
          mensagem: string
          nome: string | null
          posto_id: string | null
          status: string
          tipo: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mensagem: string
          nome?: string | null
          posto_id?: string | null
          status?: string
          tipo: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mensagem?: string
          nome?: string | null
          posto_id?: string | null
          status?: string
          tipo?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publico_feedback_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
      }
      relatorio_quality: {
        Row: {
          created_at: string
          data_caixa: string
          diferenca_caixa: number | null
          id: string
          pdf_path: string | null
          posto_id: string
          quality_conferido: string
          raw_text: string | null
          total_cartao: number | null
          total_despesas: number | null
          total_dinheiro_apurado: number | null
          total_pix: number | null
          total_vendas: number | null
        }
        Insert: {
          created_at?: string
          data_caixa: string
          diferenca_caixa?: number | null
          id?: string
          pdf_path?: string | null
          posto_id: string
          quality_conferido?: string
          raw_text?: string | null
          total_cartao?: number | null
          total_despesas?: number | null
          total_dinheiro_apurado?: number | null
          total_pix?: number | null
          total_vendas?: number | null
        }
        Update: {
          created_at?: string
          data_caixa?: string
          diferenca_caixa?: number | null
          id?: string
          pdf_path?: string | null
          posto_id?: string
          quality_conferido?: string
          raw_text?: string | null
          total_cartao?: number | null
          total_despesas?: number | null
          total_dinheiro_apurado?: number | null
          total_pix?: number | null
          total_vendas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "relatorio_quality_posto_id_fkey"
            columns: ["posto_id"]
            isOneToOne: false
            referencedRelation: "postos"
            referencedColumns: ["id"]
          },
        ]
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
          turno: string | null
          turnos_conferidos: string[]
        }
        Insert: {
          centro_custo?: string | null
          conferido?: string
          created_at?: string
          data: string
          id?: string
          observacao?: string | null
          posto_id: string
          turno?: string | null
          turnos_conferidos?: string[]
        }
        Update: {
          centro_custo?: string | null
          conferido?: string
          created_at?: string
          data?: string
          id?: string
          observacao?: string | null
          posto_id?: string
          turno?: string | null
          turnos_conferidos?: string[]
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
      user_profiles: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          perfil: string
          permissoes: string[]
          posto_ids: string[]
          posto_padrao_id: string | null
          user_id: string
          username: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          perfil?: string
          permissoes?: string[]
          posto_ids?: string[]
          posto_padrao_id?: string | null
          user_id: string
          username: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          perfil?: string
          permissoes?: string[]
          posto_ids?: string[]
          posto_padrao_id?: string | null
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_posto_padrao_id_fkey"
            columns: ["posto_padrao_id"]
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
      master_reset_user_password: {
        Args: { new_password: string; target_user_id: string }
        Returns: undefined
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
