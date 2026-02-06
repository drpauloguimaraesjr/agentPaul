# 📋 AgentPaul - Documentação Completa

> **Versão:** 3.0  
> **Última atualização:** 2026-02-06  
> **Repositório:** [drpauloguimaraesjr/agentPaul](https://github.com/drpauloguimaraesjr/agentPaul)

---

## 📌 Visão Geral

O **AgentPaul** é um agente de IA especializado em nutrição que atende pacientes via WhatsApp. Ele analisa fotos de refeições, registra o diário alimentar e fornece acompanhamento nutricional inteligente.

### Arquitetura

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│   WhatsApp      │────▶│  Backend         │────▶│  AgentPaul     │
│   (Kesher)      │     │  NutriBuddy      │     │  (Railway)     │
└─────────────────┘     └──────────────────┘     └────────────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        ▼                               ▼                               ▼
                 ┌──────────────┐               ┌──────────────┐               ┌──────────────┐
                 │   OpenAI     │               │   Firebase   │               │   Backend    │
                 │   GPT-4o     │               │   Firestore  │               │   APIs       │
                 └──────────────┘               └──────────────┘               └──────────────┘
```

---

## 🌐 Endpoints HTTP

### Endpoints de Status

| Método | Endpoint  | Descrição                      |
| ------ | --------- | ------------------------------ |
| `GET`  | `/`       | Informações básicas do serviço |
| `GET`  | `/health` | Health check com teste OpenAI  |
| `GET`  | `/diag`   | Diagnóstico completo (debug)   |
| `GET`  | `/logs`   | Últimos logs (filtráveis)      |

---

### Endpoints de Processamento

#### `POST /webhook`

**Principal endpoint** - Recebe mensagens do WhatsApp.

```json
// Request
{
  "messageId": "msg_123",
  "patientId": "patient_456",
  "patientName": "João Silva",
  "conversationId": "conv_789",
  "content": "texto da mensagem",
  "hasImage": true,
  "imageUrl": "https://...",
  "hasAudio": false,
  "audioUrl": null,
  "patientStatus": "active"
}

// Response
{
  "success": true,
  "messageId": "msg_123",
  "iterations": 3,
  "elapsedMs": 2500
}
```

**Fluxos automáticos:**

- 📸 **Foto de refeição** → Análise com GPT-4o Vision → Pergunta confirmação
- 🎤 **Áudio** → Transcrição Whisper → Processa como texto
- ✅ **Confirmação** ("sim", "ok", "confirma") → Registra refeição pendente
- 👋 **Novo paciente** → Envia mensagem de boas-vindas
- ⚠️ **Assinatura inativa** → Bloqueia e sugere regularização

---

#### `POST /test`

Testa o agente sem afetar produção.

```json
// Request
{
  "mensagem": { ... },
  "dryRun": true
}
```

---

#### `POST /simulate`

Simula uma conversa completa.

```json
// Request
{
  "patientId": "test_123",
  "patientName": "Teste",
  "messages": [
    { "content": "Oi" },
    { "content": "Enviei foto", "hasImage": true, "imageUrl": "..." }
  ]
}
```

---

## 🛠️ Ferramentas AI (17 Tools)

### Ferramentas de Contexto

| Tool                        | Descrição                                                                 |
| --------------------------- | ------------------------------------------------------------------------- |
| `buscar_contexto_paciente`  | Busca dados completos do paciente (peso, altura, objetivo, alergias, etc) |
| `buscar_dieta_paciente`     | Busca dieta prescrita pelo nutricionista                                  |
| `buscar_historico_conversa` | Busca últimas mensagens da conversa                                       |

---

### Ferramentas de Análise

| Tool                     | Descrição                                                     |
| ------------------------ | ------------------------------------------------------------- |
| `analisar_foto_refeicao` | Analisa foto com GPT-4o Vision, identifica alimentos e macros |
| `transcrever_audio`      | Transcreve áudio do paciente usando Whisper API               |

---

### Ferramentas de Registro de Refeição

| Tool                 | Descrição                                                       |
| -------------------- | --------------------------------------------------------------- |
| `preparar_refeicao`  | Salva refeição como **pendente** e pede confirmação             |
| `confirmar_refeicao` | Registra a refeição pendente no diário                          |
| `cancelar_refeicao`  | Descarta refeição pendente                                      |
| `corrigir_refeicao`  | Corrige item da refeição (peso, remover, adicionar, substituir) |
| `registrar_refeicao` | Registra refeição diretamente (sem confirmação)                 |

---

### Ferramentas de Comunicação

| Tool                       | Descrição                                   |
| -------------------------- | ------------------------------------------- |
| `enviar_mensagem_whatsapp` | Envia mensagem para o paciente via WhatsApp |

---

### Ferramentas de Produtos

| Tool                          | Descrição                                     |
| ----------------------------- | --------------------------------------------- |
| `buscar_correcoes_aprendidas` | Busca correções de peso salvas anteriormente  |
| `salvar_correcao_peso`        | Salva correção de peso para aprender          |
| `aplicar_correcao_peso`       | Aplica correção aprendida a uma estimativa    |
| `buscar_produto_internet`     | Busca info nutricional de produto na internet |
| `salvar_produto_banco`        | Salva produto no banco local                  |
| `buscar_info_restaurante`     | Busca info de pratos de restaurantes          |

---

### Ferramentas de Resumo

| Tool                   | Descrição                     |
| ---------------------- | ----------------------------- |
| `buscar_resumo_diario` | Busca resumo de macros do dia |

---

### Ferramentas de Análise Pendente

| Tool                      | Descrição                                |
| ------------------------- | ---------------------------------------- |
| `salvar_analise_pendente` | Salva análise antes de pedir confirmação |
| `buscar_analise_pendente` | Busca análise salva anteriormente        |

---

## 🍽️ Sistema de Refeições Pendentes

### Fluxo de Confirmação

```
1. Paciente envia foto 📸
         ↓
2. analisar_foto_refeicao (GPT-4o Vision)
         ↓
3. preparar_refeicao → Salva em pending_meals
         ↓
4. Envia "Confirma essa refeição?"
         ↓
5. Timer de 2 minutos inicia ⏰
         ↓
   ┌─────────────────────────────────────────┐
   │                  OU                      │
   ├─────────────────────────────────────────┤
   │ ✅ Paciente confirma → registra         │
   │ ❌ Paciente cancela → descarta          │
   │ ✏️ Paciente corrige → atualiza + repete │
   │ ⏰ Timeout → auto-registra              │
   └─────────────────────────────────────────┘
         ↓
6. Registra em mealLogs (Firebase)
```

### Funções do pending-meals.js

| Função                         | Descrição                                    |
| ------------------------------ | -------------------------------------------- |
| `savePendingMeal()`            | Salva refeição pendente (memória + Firebase) |
| `getPendingMeal()`             | Busca refeição pendente                      |
| `confirmPendingMeal()`         | Confirma e remove (para registro)            |
| `cancelPendingMeal()`          | Cancela e remove                             |
| `updatePendingMealFood()`      | Atualiza alimento (ex: peso)                 |
| `removePendingMealFood()`      | Remove alimento                              |
| `addPendingMealFood()`         | Adiciona alimento                            |
| `cleanupExpiredPendingMeals()` | Limpa refeições antigas (a cada 5 min)       |

### Constantes

| Constante                  | Valor  | Descrição                |
| -------------------------- | ------ | ------------------------ |
| `AUTO_REGISTER_TIMEOUT_MS` | 2 min  | Tempo para auto-registro |
| `MAX_PENDING_AGE_MS`       | 10 min | Tempo máximo em cache    |

---

## 🔥 Integração Firebase

### Coleções

| Coleção                 | Descrição                                 |
| ----------------------- | ----------------------------------------- |
| `pending_meals`         | Refeições aguardando confirmação (backup) |
| `produtos_nutricionais` | Produtos aprendidos                       |

### Variáveis de Ambiente

```env
FIREBASE_PROJECT_ID=seu-projeto
FIREBASE_CLIENT_EMAIL=firebase-adminsdk...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

---

## 🔒 Segurança

### Rate Limiting

- **15 requests/minuto** por paciente
- Armazenado em memória (Map)
- Limpo periodicamente

### Validações

- Verificação de escopo (bloqueia temas fora de nutrição)
- Detecção de escalação (suicídio, emergência, etc)
- Sanitização de mensagens

### Palavras de Escalação

```
suicídio, me matar, emergência, hospital, transtorno alimentar,
anorexia, bulimia, abuso, violência, depressão, ansiedade grave
```

---

## 📊 Banco Local de Produtos

O AgentPaul possui um banco local de produtos brasileiros comuns:

```javascript
const BANCO_PRODUTOS_BR = {
  "activia triplo zero ameixa": {
    peso: 170,
    proteinas: 5.9,
    carboidratos: 7.5,
    gorduras: 0,
    calorias: 54,
  },
  "whey protein": {
    peso: 30,
    proteinas: 24,
    carboidratos: 3,
    gorduras: 1.5,
    calorias: 120,
  },
  // ... mais produtos
};
```

Palavras-chave detectadas como embalados:

```
yogurt, iogurte, activia, danone, nestle, yakult, vigor, whey, nesfit...
```

---

## ⚙️ Configuração

### Variáveis de Ambiente Obrigatórias

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Backend NutriBuddy
BACKEND_URL=https://web-production-c9eaf.up.railway.app
WEBHOOK_SECRET=seu-secret

# Modelo
AGENT_MODEL=gpt-4o

# Firebase (opcional mas recomendado)
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

### Porta

- Padrão: `3001`
- Railway: usa `PORT` do ambiente

---

## 📈 Monitoramento

### Logs em Memória

- Últimos **200 logs** armazenados
- Filtráveis por `level` e `category`
- Acessíveis via `GET /logs`

### Categorias de Log

```
webhook, agent, confirmation, subscription, error
```

### Níveis de Log

```
debug, info, warn, error
```

---

## 🚀 Deploy

### Railway

1. Conectar repositório GitHub
2. Configurar variáveis de ambiente
3. Deploy automático no push

### Verificação

```bash
curl https://seu-app.up.railway.app/health
```

---

## 📁 Estrutura de Arquivos

```
agentPaul/
├── server.js          # Servidor Express + Endpoints HTTP
├── index.js           # Classe Agent (loop de IA)
├── tools.js           # Definições e implementações das ferramentas
├── pending-meals.js   # Sistema de refeições pendentes
├── firebase.js        # Conexão Firebase + CRUD
├── prompts.js         # Prompts do sistema
├── logger.js          # Sistema de logging
├── utils.js           # Utilitários
├── package.json       # Dependências
└── docs/              # Documentação adicional
```

---

## 📞 Suporte

Para problemas ou dúvidas:

1. Verificar logs em `/logs`
2. Checar diagnóstico em `/diag`
3. Verificar health em `/health`
