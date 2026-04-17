

# Adicionar checkbox "Lembrar senha" na tela de Login

Hoje a tela já tem "Lembrar meu usuário". Vou adicionar um segundo checkbox **"Lembrar minha senha"** logo abaixo, com o mesmo padrão.

## Mudanças em `src/pages/Login.tsx`

1. **Nova chave no localStorage:** `pi_saved_password` (separada da do usuário, para que o usuário possa lembrar só um dos dois)

2. **Novo estado:**
   - `rememberPassword` — inicia `true` se já existe senha salva
   - `password` — inicia com valor salvo (se houver)

3. **Novo checkbox** abaixo do "Lembrar meu usuário":
   ```
   [x] Lembrar minha senha
   ```

4. **No `handleLogin` (após login bem-sucedido):**
   - Se `rememberPassword` = true → `localStorage.setItem('pi_saved_password', password)`
   - Se false → `localStorage.removeItem('pi_saved_password')`

## Aviso de segurança

Salvar senha em `localStorage` é uma prática **insegura** — qualquer script malicioso ou pessoa com acesso ao navegador consegue lê-la em texto puro. O ideal seria confiar na sessão persistente do Supabase (que já mantém o usuário logado automaticamente via `persistSession: true` no client) ou usar o gerenciador de senhas do navegador.

Vou implementar conforme pedido, mas recomendo considerar:
- **Alternativa A:** manter como está (Supabase já persiste sessão — usuário não precisa redigitar senha)
- **Alternativa B:** implementar mesmo assim com aviso visual pequeno abaixo do checkbox tipo "⚠ não recomendado em computador compartilhado"

Vou seguir com a implementação + adicionar o pequeno aviso no checkbox de senha.

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Login.tsx` | Adicionar estado, checkbox e persistência da senha |

