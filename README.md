# 🏛️ Monitor Matérias — Câmara Municipal de Palmas (TO)

Monitora automaticamente a API Nexlegis da Câmara Municipal de Palmas e envia email quando há matérias novas. Roda **4x por dia** via GitHub Actions (8h, 12h, 17h e 21h, horário de Brasília).

---

## Como funciona

1. O GitHub Actions roda o script nos horários configurados
2. O script chama a API REST pública do Nexlegis (`palmas.nexlegis.com.br/api`)
3. Compara as matérias recebidas com as já registradas no `estado.json`
4. Se há matérias novas → envia email com a lista organizada por tipo
5. Salva o estado atualizado no repositório

---

## Estrutura do repositório

```
monitor-proposicoes-palmas/
├── monitor.js                      # Script principal
├── package.json                    # Dependências (só nodemailer)
├── estado.json                     # Estado salvo automaticamente pelo workflow
├── README.md                       # Este arquivo
└── .github/
    └── workflows/
        └── monitor.yml             # Workflow do GitHub Actions
```

---

## Setup — Passo a Passo

### PARTE 1 — Preparar o Gmail

**1.1** Acesse [myaccount.google.com/security](https://myaccount.google.com/security)

**1.2** Confirme que a **Verificação em duas etapas** está ativa.

**1.3** Procure por **"Senhas de app"** e clique.

**1.4** Digite um nome qualquer (ex: `monitor-palmas`) e clique em **Criar**.

**1.5** Copie a senha de **16 letras** gerada — ela só aparece uma vez.

> Se já tem App Password de outro monitor, pode reutilizar a mesma senha.

---

### PARTE 2 — Criar o repositório no GitHub

**2.1** Acesse [github.com](https://github.com) e clique em **+ → New repository**

**2.2** Preencha:
- **Repository name:** `monitor-proposicoes-palmas`
- **Visibility:** Private

**2.3** Clique em **Create repository**

---

### PARTE 3 — Fazer upload dos arquivos

**3.1** Na página do repositório, clique em **"uploading an existing file"**

**3.2** Faça upload de:
```
monitor.js
package.json
README.md
```
Clique em **Commit changes**.

**3.3** O `monitor.yml` precisa estar numa pasta específica. Clique em **Add file → Create new file**, digite o nome:
```
.github/workflows/monitor.yml
```
Abra o arquivo `monitor.yml`, copie todo o conteúdo e cole. Clique em **Commit changes**.

---

### PARTE 4 — Configurar os Secrets

**4.1** No repositório: **Settings → Secrets and variables → Actions**

**4.2** Clique em **New repository secret** e crie os 3 secrets:

| Name | Valor |
|------|-------|
| `EMAIL_REMETENTE` | seu Gmail (ex: seuemail@gmail.com) |
| `EMAIL_SENHA` | a senha de 16 letras do App Password (sem espaços) |
| `EMAIL_DESTINO` | email onde quer receber os alertas |

---

### PARTE 5 — Testar

**5.1** Vá em **Actions → Monitor Matérias Palmas → Run workflow → Run workflow**

**5.2** Aguarde ~15 segundos. Verde = funcionou.

**5.3** O **primeiro run** envia email com as 15 matérias mais recentes e salva o estado. A partir do segundo run, só envia se houver matérias novas.

---

## Email recebido

```
🏛️ Câmara de Palmas — 3 nova(s) matéria(s)

Projeto de Lei — 1 matéria(s)
  45/2026 | Ver. Fulano     | 27/03/2026 | Dispõe sobre...

Requerimento — 2 matéria(s)
  1133/2026 | Ver. Ciclano  | 27/03/2026 | Requer tapa-buraco...
  1132/2026 | Ver. Beltrano | 27/03/2026 | Requer iluminação...
```

---

## API utilizada

```
Sistema:   Nexlegis (sistema proprietário para câmaras municipais)
URL base:  https://palmas.nexlegis.com.br/api
Endpoint:  GET /materias?ano=2026&page=1
Resposta:  { data[], total, current_page, last_page, links{} }
```

API pública, sem autenticação. Paginação de 15 itens por página.

### Campos utilizados por matéria
| Campo | Descrição |
|-------|-----------|
| `id` | ID único numérico (chave de deduplicação) |
| `numero` | Número da matéria (ex: "1.133") |
| `ano` | Ano (ex: 2026) |
| `tipo.descricao` | Tipo por extenso (ex: "Requerimento") |
| `ementa` | Texto da ementa |
| `data_publicacao` | Data de publicação |
| `vereadores[].vereador.nome_politico` | Nome político do autor |

---

## Horários de execução

| Horário BRT | Cron UTC |
|-------------|----------|
| 08:00       | 0 11 * * * |
| 12:00       | 0 15 * * * |
| 17:00       | 0 20 * * * |
| 21:00       | 0 0 * * *  |

---

## Resetar o estado

Para forçar o reenvio de todas as matérias (útil para testar):

1. No repositório, clique em `estado.json` → lápis
2. Substitua o conteúdo por:
```json
{"proposicoes_vistas":[],"ultima_execucao":""}
```
3. Commit → rode o workflow manualmente

---

## Problemas comuns

**Não aparece "Senhas de app" no Google**
→ Ative a verificação em duas etapas primeiro.

**Erro "Authentication failed" no log**
→ Verifique se `EMAIL_SENHA` foi colado sem espaços.

**Log mostra "⚠️ Filtro por ano não aplicado"**
→ Normal. A API retorna a página 1 (mais recentes) sem filtro por ano. O monitor ainda funciona corretamente usando `id` como chave de deduplicação.

**Log mostra "0 matérias encontradas"**
→ A API pode estar fora do ar. Tente acessar `https://palmas.nexlegis.com.br/api/materias?page=1` no browser para confirmar.
