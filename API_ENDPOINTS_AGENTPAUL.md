# NutriBuddy Backend API - Endpoints Completos para AgentPaul

Esta é a documentação **completa** de todos os endpoints disponíveis no backend do NutriBuddy para integração com o AgentPaul/N8N.

## 📍 Base URL

```
Produção: https://web-production-c9eaf.up.railway.app
Prefixo: /api/n8n
```

## 🔐 Autenticação

### Webhook Secret (N8N/AgentPaul)

```http
Header: x-webhook-secret: nutribuddy-secret-2024
```

### Firebase Token (Dashboard)

```http
Header: Authorization: Bearer <firebase-token>
```

---

# 📋 ÍNDICE DE ENDPOINTS

## 1. Status e Configuração

- [GET /status](#get-status)
- [GET /test](#get-test)
- [GET /webhooks](#get-webhooks)
- [GET /webhooks/:id](#get-webhooksid)
- [GET /workflows](#get-workflows)
- [GET /executions](#get-executions)
- [POST /trigger](#post-trigger)

## 2. Conversas e Mensagens

- [GET /conversations/:conversationId](#get-conversationsconversationid)
- [GET /conversations/:conversationId/messages](#get-conversationsconversationidmessages)
- [POST /conversations/:conversationId/messages](#post-conversationsconversationidmessages)
- [POST /update-conversation](#post-update-conversation)
- [POST /mark-urgent](#post-mark-urgent)
- [POST /send-alert](#post-send-alert)

## 3. Contexto de Conversa

- [GET /conversations/:conversationId/context](#get-conversationsconversationidcontext)
- [POST /conversations/:conversationId/context](#post-conversationsconversationidcontext)
- [PATCH /conversations/:conversationId/context](#patch-conversationsconversationidcontext)
- [DELETE /conversations/:conversationId/context](#delete-conversationsconversationidcontext)

## 4. Pacientes

- [GET /patient/:patientId/full-context](#get-patientpatientid-full-context)
- [GET /patients/:patientId/diet](#get-patientspatientid-diet)
- [GET /patients/:patientId/profile-macros](#get-patientspatientid-profile-macros)
- [GET /patients/:patientId/meals/today](#get-patientspatientid-mealstoday)
- [GET /patients/:patientId/meals/summary](#get-patientspatientid-mealssummary)
- [GET /patients/:patientId/food-diary](#get-patientspatientid-food-diary)
- [POST /patients/:patientId/food-diary](#post-patientspatientid-food-diary)
- [POST /patients/:patientId/diet-plan](#post-patientspatientid-diet-plan)

## 5. Dieta

- [POST /update-diet](#post-update-diet)
- [POST /update-diet-complete](#post-update-diet-complete)
- [POST /update-inbody](#post-update-inbody)

## 6. Refeições

- [POST /meals/log](#post-mealslog)

## 7. Aprendizado de Peso de Alimentos

- [POST /food-weight/feedback](#post-food-weightfeedback)
- [GET /food-weight/corrections/:foodType](#get-food-weightcorrectionsfoodtype)
- [GET /food-weight/all-corrections](#get-food-weightall-corrections)
- [POST /food-weight/apply-correction](#post-food-weightapply-correction)
- [GET /food-weight/stats](#get-food-weightstats)
- [POST /food-weight/register-known-product](#post-food-weightregister-known-product)
- [GET /food-weight/known-products](#get-food-weightknown-products)

## 8. Calibração de Alimentos

- [POST /food-calibration/add-reference](#post-food-calibrationadd-reference)
- [GET /food-calibration/references](#get-food-calibrationreferences)
- [DELETE /food-calibration/references/:referenceId](#delete-food-calibrationreferencesreferenceid)
- [GET /food-calibration/stats](#get-food-calibrationstats)
- [GET /food-calibration/suggestions](#get-food-calibrationsuggestions)
- [POST /food-calibration/suggestions](#post-food-calibrationsuggestions)
- [POST /food-calibration/suggestions/:id/approve](#post-food-calibrationsuggestionsidapprove)
- [POST /food-calibration/suggestions/:id/reject](#post-food-calibrationsuggestionsidreject)

## 9. Confusões de Tipo de Alimentos

- [POST /food-type-confusions](#post-food-type-confusions)
- [GET /food-type-confusions](#get-food-type-confusions)
- [GET /food-type-confusions/active](#get-food-type-confusionsactive)
- [POST /food-type-confusions/:id/approve](#post-food-type-confusionsidapprove)
- [POST /food-type-confusions/:id/reject](#post-food-type-confusionsidreject)

---

# 📍 DETALHES DOS ENDPOINTS

---

## 1. STATUS E CONFIGURAÇÃO

### GET /status

**Descrição:** Verifica status da conexão com N8N e configurações

**Autenticação:** Firebase Token

**Resposta:**

```json
{
  "success": true,
  "config": {
    "n8nUrl": "https://n8n.example.com",
    "hasApiKey": true,
    "webhookUrl": "https://n8n.example.com/webhook",
    "connected": true,
    "status": "online",
    "version": "1.0.0"
  },
  "lastWebhook": {...}
}
```

---

### GET /test

**Descrição:** Testa conectividade com N8N e Firestore

**Autenticação:** Firebase Token

**Resposta:**

```json
{
  "success": true,
  "overall": "all_passed",
  "n8nUrl": "https://n8n.example.com",
  "tests": [
    { "name": "Health Check", "status": "success" },
    { "name": "Webhook Test", "status": "success" },
    { "name": "Firestore Connection", "status": "success" }
  ]
}
```

---

### GET /webhooks

**Descrição:** Lista histórico de eventos de webhook

**Autenticação:** Firebase Token

**Query Params:**

- `limit` (opcional): Número de eventos (default: 50)

**Resposta:**

```json
{
  "success": true,
  "count": 10,
  "total": 100,
  "events": [...]
}
```

---

### POST /trigger

**Descrição:** Dispara workflow N8N manualmente

**Autenticação:** Firebase Token

**Body:**

```json
{
  "workflowId": "abc123",
  "data": { "key": "value" }
}
```

---

## 2. CONVERSAS E MENSAGENS

### GET /conversations/:conversationId

**Descrição:** Busca dados de uma conversa específica

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "data": {
    "id": "conv123",
    "patientId": "patient123",
    "prescriberId": "prescriber123",
    "patientName": "João Silva",
    "patientStatus": "active",
    "status": "ongoing",
    "kanbanColumn": "atendimento",
    "priority": "normal",
    "tags": ["novo"],
    "lastMessage": "Olá!",
    "lastMessageAt": "2026-02-02T12:00:00Z",
    "unreadCount": 3
  }
}
```

---

### GET /conversations/:conversationId/messages

**Descrição:** Busca últimas mensagens de uma conversa

**Autenticação:** Webhook Secret

**Query Params:**

- `limit` (opcional): Número de mensagens (default: 10)

**Resposta:**

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg123",
        "senderId": "patient123",
        "senderRole": "patient",
        "content": "Olá, preciso de ajuda!",
        "type": "text",
        "isAiGenerated": false,
        "createdAt": "2026-02-02T12:00:00Z"
      }
    ],
    "count": 1
  }
}
```

---

### POST /conversations/:conversationId/messages

**Descrição:** Cria nova mensagem (resposta da IA)

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "senderId": "system",
  "senderRole": "prescriber",
  "content": "Olá! Como posso ajudar com sua nutrição hoje?",
  "type": "text",
  "isAiGenerated": true
}
```

**Resposta:**

```json
{
  "success": true,
  "data": {
    "messageId": "msg456",
    "conversationId": "conv123",
    "whatsappSent": true,
    "whatsappMessageId": "3EB0XXXXX"
  }
}
```

---

### POST /update-conversation

**Descrição:** Atualiza tags, prioridade e status de uma conversa

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "conversationId": "conv123",
  "tags": ["urgente", "alimentação"],
  "priority": "high",
  "status": "aguardando_resposta",
  "kanbanColumn": "urgente"
}
```

---

### POST /mark-urgent

**Descrição:** Marca conversa como urgente

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "conversationId": "conv123",
  "reason": "Paciente relatou mal-estar"
}
```

---

### POST /send-alert

**Descrição:** Envia alerta/notificação

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "conversationId": "conv123",
  "alertType": "sentiment",
  "message": "Paciente demonstrou frustração",
  "metadata": { "score": -0.8 }
}
```

---

## 3. CONTEXTO DE CONVERSA

### GET /conversations/:conversationId/context

**Descrição:** Busca contexto ativo da conversa (estado atual do fluxo)

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "hasContext": true,
  "context": {
    "conversationId": "conv123",
    "patientId": "patient123",
    "currentContext": {
      "type": "meal_logging",
      "status": "awaiting_photo",
      "data": { "mealType": "almoco" }
    },
    "expiresAt": "2026-02-02T13:00:00Z"
  }
}
```

---

### POST /conversations/:conversationId/context

**Descrição:** Cria novo contexto de conversa

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "patientId": "patient123",
  "prescriberId": "prescriber123",
  "type": "meal_logging",
  "data": { "mealType": "almoco" }
}
```

**Tipos de contexto válidos:**

- `meal_logging` - Registro de refeição
- `weight_update` - Atualização de peso
- `general_chat` - Conversa geral
- `symptoms_report` - Relato de sintomas
- `diet_question` - Dúvida sobre dieta

---

### PATCH /conversations/:conversationId/context

**Descrição:** Atualiza contexto existente

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "updates": { "mealType": "jantar", "photoReceived": true },
  "status": "analyzing"
}
```

---

### DELETE /conversations/:conversationId/context

**Descrição:** Finaliza ou deleta contexto

**Autenticação:** Webhook Secret

**Query Params:**

- `complete=true` - Finaliza o contexto (move para histórico)
- Sem parâmetro - Deleta completamente

---

## 4. PACIENTES

### GET /patient/:patientId/full-context

**Descrição:** Retorna TODOS os dados do paciente para a IA (contexto completo)

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "context": {
    "patient": {
      "name": "João Silva",
      "email": "joao@email.com",
      "phone": "5547999999999",
      "gender": "male",
      "age": 35,
      "weight": 80,
      "height": 175,
      "objective": "lose_weight",
      "targetWeight": 70,
      "allergies": ["lactose"],
      "foodStyle": "omnivore",
      "favoriteFoods": ["frango", "arroz"],
      "dislikedFoods": ["jiló"],
      "activityLevel": "moderate",
      "goal": "Emagrecer 10kg",
      "dietPlanText": "..."
    },
    "dietPlan": {
      "name": "Plano Emagrecimento",
      "calories": 1800,
      "macros": {
        "protein": 135,
        "carbs": 180,
        "fats": 60
      },
      "meals": [...]
    },
    "generatedAt": "2026-02-02T12:00:00Z"
  }
}
```

---

### GET /patients/:patientId/diet

**Descrição:** Busca dieta ativa do paciente

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "data": {
    "id": "diet123",
    "name": "Plano Emagrecimento",
    "meals": [
      {
        "nome": "Café da Manhã",
        "horario": "07:00",
        "alimentos": [
          { "nome": "Ovos", "quantidade": "2 unidades", "calorias": 156 }
        ]
      }
    ],
    "macros": {
      "protein": 135,
      "carbs": 180,
      "fats": 60,
      "calories": 1800
    }
  }
}
```

---

### GET /patients/:patientId/profile-macros

**Descrição:** Busca macros do perfil do paciente (ou calcula automaticamente)

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "source": "profile",
  "data": {
    "name": "Macros do Perfil",
    "macros": {
      "protein": 135,
      "carbs": 180,
      "fats": 60,
      "calories": 1800
    },
    "patientInfo": {
      "weight": 80,
      "height": 175,
      "goal": "weight_loss",
      "activityLevel": "moderate"
    }
  }
}
```

---

### GET /patients/:patientId/meals/today

**Descrição:** Busca refeições registradas hoje

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "date": "2026-02-02",
  "mealCount": 2,
  "meals": [
    {
      "id": "meal123",
      "mealType": "cafe_da_manha",
      "description": "Ovos e pão integral",
      "totalMacros": { "protein": 25, "carbs": 30, "fats": 10, "calories": 310 }
    }
  ],
  "dailyTotals": {
    "protein": 80,
    "carbs": 120,
    "fats": 30,
    "calories": 1080
  }
}
```

---

### GET /patients/:patientId/meals/summary

**Descrição:** Resumo de macros consumidos vs metas

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "date": "2026-02-02",
  "mealCount": 2,
  "consumed": { "protein": 80, "carbs": 120, "fats": 30, "calories": 1080 },
  "target": { "protein": 135, "carbs": 180, "fats": 60, "calories": 1800 },
  "percentages": { "protein": 59, "carbs": 67, "fats": 50, "calories": 60 },
  "remaining": { "protein": 55, "carbs": 60, "fats": 30, "calories": 720 },
  "status": "below_target"
}
```

---

### GET /patients/:patientId/food-diary

**Descrição:** Busca diário alimentar por data ou período

**Autenticação:** Webhook Secret

**Query Params:**

- `date` (opcional): Data específica (YYYY-MM-DD)
- `startDate` (opcional): Data inicial
- `endDate` (opcional): Data final
- `limit` (opcional): Limite de registros (default: 100)

**Resposta:**

```json
{
  "success": true,
  "count": 5,
  "summary": {
    "totalCalories": 1800,
    "totalProtein": 135,
    "totalCarbs": 180,
    "totalFats": 60
  },
  "logs": [...]
}
```

---

### POST /patients/:patientId/food-diary

**Descrição:** Registra refeição no diário (análise de foto)

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "type": "lunch",
  "date": "2026-02-02",
  "description": "Arroz, feijão e frango",
  "foods": [
    { "name": "Arroz", "weight": 150, "calories": 195 },
    { "name": "Feijão", "weight": 100, "calories": 76 },
    { "name": "Frango grelhado", "weight": 120, "calories": 180 }
  ],
  "macros": {
    "calories": 451,
    "protein": 35,
    "carbs": 60,
    "fats": 8
  },
  "imageUrl": "https://storage.example.com/image.jpg",
  "conversationId": "conv123"
}
```

---

### POST /patients/:patientId/diet-plan

**Descrição:** Cria/atualiza plano alimentar

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "name": "Plano Emagrecimento",
  "description": "Dieta para perda de 10kg",
  "meals": [...],
  "dailyCalories": 1800,
  "dailyProtein": 135,
  "dailyCarbs": 180,
  "dailyFats": 60
}
```

---

## 5. DIETA

### POST /update-diet

**Descrição:** Atualiza dieta transcrita (texto simples)

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "patientId": "patient123",
  "meals": [...],
  "macros": {...},
  "fullText": "Texto completo da dieta...",
  "transcriptionStatus": "completed"
}
```

---

### POST /update-diet-complete

**Descrição:** Salva dieta COMPLETA estruturada (GPT-4 Vision)

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "patientId": "patient123",
  "diet": {
    "meta": {
      "objetivo": "emagrecer",
      "nutricionista": "Dr. Paulo",
      "caloriasDiarias": 1800
    },
    "refeicoes": [...],
    "macronutrientes": {
      "proteinas": { "gramas": 135, "percentual": 30 },
      "carboidratos": { "gramas": 180, "percentual": 40 },
      "gorduras": { "gramas": 60, "percentual": 30 }
    },
    "observacoes": [...]
  },
  "transcriptionStatus": "completed",
  "model": "gpt-4o-vision"
}
```

---

### POST /update-inbody

**Descrição:** Atualiza dados da InBody transcrita

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "patientId": "patient123",
  "weight": 80,
  "height": 175,
  "bodyFat": 22.5,
  "leanMass": 62,
  "fatMass": 18,
  "bodyWater": 45,
  "bmi": 26.1,
  "visceralFat": 8,
  "basalMetabolicRate": 1750,
  "measurements": {...},
  "muscleDistribution": {...},
  "date": "2026-02-02",
  "transcriptionStatus": "completed"
}
```

---

## 6. REFEIÇÕES

### POST /meals/log

**Descrição:** Registra refeição com contexto completo

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "patientId": "patient123",
  "prescriberId": "prescriber123",
  "conversationId": "conv123",
  "mealContext": {
    "mealType": "lunch",
    "timestamp": "2026-02-02T12:30:00Z",
    "items": [
      { "name": "Arroz branco", "weight": 150, "macros": {...} }
    ],
    "totalMacros": { "protein": 35, "carbs": 60, "fats": 8, "calories": 456 }
  },
  "adherence": {
    "score": 0.85,
    "deviations": ["Porção maior de arroz"]
  }
}
```

---

## 7. APRENDIZADO DE PESO DE ALIMENTOS

### POST /food-weight/feedback

**Descrição:** Registra correção de peso feita pelo usuário

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "patientId": "patient123",
  "foodName": "Arroz branco",
  "foodType": "carboidrato",
  "aiEstimate": 100,
  "userCorrection": 150,
  "plateType": "prato_raso",
  "portionDescription": "colher grande",
  "conversationId": "conv123"
}
```

**Resposta:**

```json
{
  "success": true,
  "feedbackId": "fb123",
  "analysis": {
    "correctionFactor": 1.5,
    "errorPercent": 33,
    "direction": "subestimado"
  }
}
```

---

### GET /food-weight/corrections/:foodType

**Descrição:** Busca fator de correção aprendido para um tipo de alimento

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "hasData": true,
  "foodType": "arroz",
  "correctionFactor": 1.25,
  "confidence": 0.85,
  "sampleCount": 15,
  "recommendation": "alta_confianca"
}
```

---

### GET /food-weight/all-corrections

**Descrição:** Retorna todas as correções aprendidas

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "count": 25,
  "corrections": {
    "arroz": {
      "correctionFactor": 1.25,
      "confidence": 0.85,
      "sampleCount": 15
    },
    "feijao": { "correctionFactor": 1.1, "confidence": 0.72, "sampleCount": 8 }
  }
}
```

---

### POST /food-weight/apply-correction

**Descrição:** Aplica correção aprendida a uma estimativa

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "foodName": "Arroz branco",
  "foodType": "arroz",
  "aiEstimate": 100
}
```

**Resposta:**

```json
{
  "success": true,
  "original": 100,
  "corrected": 125,
  "correctionFactor": 1.25,
  "confidence": 0.85,
  "source": "learned",
  "applied": true
}
```

---

### GET /food-weight/stats

**Descrição:** Estatísticas do sistema de aprendizado

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "stats": {
    "totalFeedbacks": 150,
    "totalFoodsLearned": 25,
    "feedbacksLast7Days": 23,
    "averageErrorPercent": 18.5,
    "systemHealth": "excelente"
  }
}
```

---

### POST /food-weight/register-known-product

**Descrição:** Registra produto com peso exato conhecido

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "productName": "Whey Protein Growth",
  "exactWeight": 30,
  "macrosPer100g": { "protein": 80, "carbs": 5, "fats": 3, "calories": 370 },
  "barcode": "7891234567890",
  "brand": "Growth",
  "category": "suplemento"
}
```

---

### GET /food-weight/known-products

**Descrição:** Lista todos os produtos conhecidos

**Autenticação:** Webhook Secret

---

## 8. CALIBRAÇÃO DE ALIMENTOS

### POST /food-calibration/add-reference

**Descrição:** Adiciona imagem de referência para calibração da IA

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "foodName": "Arroz branco",
  "category": "carboidrato",
  "weight": 150,
  "macros": {
    "proteinas": 4,
    "carboidratos": 45,
    "gorduras": 0.5,
    "calorias": 195
  },
  "imageUrl": "https://storage.example.com/ref.jpg",
  "portionSize": "media",
  "plateType": "prato_raso",
  "notes": "Porção típica brasileira"
}
```

---

### GET /food-calibration/references

**Descrição:** Lista imagens de referência cadastradas

**Autenticação:** Webhook Secret

**Query Params:**

- `category` (opcional): Filtrar por categoria
- `limit` (opcional): Limite de registros (default: 100)

---

### DELETE /food-calibration/references/:referenceId

**Descrição:** Remove imagem de referência

**Autenticação:** Webhook Secret

---

### GET /food-calibration/stats

**Descrição:** Estatísticas do banco de calibração

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "success": true,
  "stats": {
    "totalReferences": 50,
    "totalFeedbacks": 150,
    "totalFoodsLearned": 25,
    "totalProducts": 10,
    "categoriesBreakdown": { "carboidrato": 20, "proteina": 15, "... ": "..." }
  }
}
```

---

### POST /food-calibration/suggestions

**Descrição:** Cria sugestão de calibração (do N8N)

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "patientId": "patient123",
  "foodName": "Arroz",
  "foodType": "carboidrato",
  "aiEstimate": 100,
  "userCorrection": 150,
  "conversationId": "conv123"
}
```

---

### GET /food-calibration/suggestions

**Descrição:** Lista sugestões pendentes

**Autenticação:** Firebase Token

---

### POST /food-calibration/suggestions/:id/approve

**Descrição:** Aprova sugestão e aplica aprendizado

**Autenticação:** Firebase Token

**Body:**

```json
{
  "foodName": "Arroz branco",
  "category": "carboidrato",
  "standardWeight": 150,
  "standardUnit": "g"
}
```

---

### POST /food-calibration/suggestions/:id/reject

**Descrição:** Rejeita sugestão

**Autenticação:** Firebase Token

---

## 9. CONFUSÕES DE TIPO DE ALIMENTOS

### POST /food-type-confusions

**Descrição:** Registra confusão de identificação (quando IA erra o alimento)

**Autenticação:** Webhook Secret

**Body:**

```json
{
  "patientId": "patient123",
  "aiIdentified": "polenta",
  "actualFood": "mandioca",
  "conversationId": "conv123",
  "imageUrl": "https://storage.example.com/photo.jpg"
}
```

---

### GET /food-type-confusions

**Descrição:** Lista confusões registradas

**Autenticação:** Webhook Secret

**Query Params:**

- `status` (opcional): pending, approved, rejected

---

### GET /food-type-confusions/active

**Descrição:** Retorna confusões aprovadas para incluir no prompt do Vision

**Autenticação:** Webhook Secret

**Resposta:**

```json
{
  "confusions": [
    {
      "aiIdentified": "polenta",
      "actualFood": "mandioca",
      "hint": "textura mais fibrosa"
    }
  ],
  "promptText": "ATENÇÃO - Confusões conhecidas:\n- \"polenta\" pode ser \"mandioca\" (textura mais fibrosa)\n"
}
```

---

### POST /food-type-confusions/:id/approve

**Descrição:** Aprova confusão (será incluída nos prompts)

**Autenticação:** Firebase Token

**Body:**

```json
{
  "hint": "Verifique a textura - mandioca é mais fibrosa"
}
```

---

### POST /food-type-confusions/:id/reject

**Descrição:** Rejeita confusão

**Autenticação:** Firebase Token

---

# 🔧 CONFIGURAÇÃO DO AGENTPAUL

## Variáveis de Ambiente

```env
BACKEND_URL=https://web-production-c9eaf.up.railway.app
WEBHOOK_SECRET=nutribuddy-secret-2024
```

## Headers Padrão

```json
{
  "Content-Type": "application/json",
  "x-webhook-secret": "nutribuddy-secret-2024"
}
```

---

# 🔄 FLUXO TÍPICO DO AGENTPAUL

```
1. Recebe mensagem do paciente via webhook WhatsApp
   ↓
2. GET /conversations/:conversationId
   ↓
3. GET /patient/:patientId/full-context
   ↓
4. GET /conversations/:conversationId/context
   ↓
5. Processa mensagem com LLM
   ↓
6. Se foto de refeição:
   - Analisa com GPT-4 Vision
   - POST /food-weight/apply-correction (ajusta pesos)
   - POST /patients/:patientId/food-diary (salva)
   ↓
7. POST /conversations/:conversationId/messages (salva resposta + envia WhatsApp)
   ↓
8. PATCH /conversations/:conversationId/context (atualiza estado)
```

---

# 📝 NOTAS IMPORTANTES

1. **Telefone**: Formato internacional sem símbolos (`5547999999999`)
2. **PatientId**: ID do documento Firestore (coleção `users`)
3. **Timestamps**: ISO 8601 (`2026-02-02T12:30:00Z`)
4. **Erros**: Retornam `{ success: false, error: "mensagem" }`
5. **Rate Limiting**: Recomendado máximo 60 req/min

---

_Documentação gerada em 02/02/2026_
