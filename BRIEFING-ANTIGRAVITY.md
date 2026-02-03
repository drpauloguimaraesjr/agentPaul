# Briefing para Antigravity - AgentPaul v3.0

## Status Atual: ✅ DEPLOY CONCLUÍDO

O AgentPaul está **rodando no Railway** e pronto para substituir o n8n.

---

## O que é o AgentPaul

Agente inteligente que substitui o workflow n8n de 30+ nós do NutriBuddy. Usa GPT-4 com function calling para processar mensagens de pacientes de forma autônoma.

---

## Arquitetura

```
WhatsApp → Backend NutriBuddy → AgentPaul (Railway) → Backend APIs
                                      ↓
                                   OpenAI GPT-4
```

---

## Endpoints do AgentPaul

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/health` | Health check |
| POST | `/webhook` | Recebe mensagens do backend |
| POST | `/test` | Teste manual do agente |
| GET | `/stats` | Estatísticas de uso |

---

## 11 Ferramentas Internas (Function Calling)

1. **buscar_contexto_paciente** → GET /api/n8n/patient/:id/full-context
2. **buscar_dieta_paciente** → GET /api/n8n/patients/:id/diet
3. **analisar_foto_refeicao** → GPT-4 Vision (analisa fotos + embalagens)
4. **registrar_refeicao** → POST /api/n8n/patients/:id/food-diary
5. **enviar_mensagem_whatsapp** → POST /api/n8n/conversations/:id/messages
6. **buscar_historico_conversa** → GET /api/n8n/conversations/:id/messages
7. **buscar_correcoes_aprendidas** → GET /api/n8n/food-weight/all-corrections
8. **salvar_correcao_peso** → POST /api/n8n/food-weight/feedback
9. **buscar_resumo_diario** → GET /api/n8n/patients/:id/meals/summary
10. **transcrever_audio** → Whisper API
11. **buscar_info_restaurante** → Base de conhecimento interna (Outback, McDonald's, etc)

---

## Variáveis de Ambiente (já configuradas)

```
OPENAI_API_KEY=<configurada>
BACKEND_URL=https://web-production-c9eaf.up.railway.app
AGENT_MODEL=gpt-4o-mini
WEBHOOK_SECRET=nutribuddy-secret-2024
NODE_ENV=production
DEBUG=true
```

---

## Repositório

📁 **GitHub:** https://github.com/drpauloguimaraesjr/agentPaul

### Estrutura de arquivos:
```
agentPaul/
├── server.js          # Servidor Express (endpoints)
├── tools.js           # 11 ferramentas com endpoints reais
├── prompts.js         # System prompt do agente
├── logger.js          # Sistema de logs
├── index.js           # Entry point
├── package.json       # Dependências
├── .env.example       # Template de variáveis
├── README.md          # Documentação
├── DEPLOY-RAILWAY.md  # Guia de deploy
├── COMO-MIGRAR.md     # Plano de migração do n8n
└── API_ENDPOINTS_AGENTPAUL.md  # Documentação completa dos endpoints
```

---

## ⚠️ PRÓXIMO PASSO: Integrar com Backend

O AgentPaul está rodando, mas o backend do NutriBuddy ainda manda mensagens pro n8n.

### Precisa fazer:

1. **Descobrir a URL do AgentPaul no Railway**
   - Formato: `https://agentpaul-xxx.up.railway.app`

2. **Atualizar o backend NutriBuddy** para enviar mensagens pro AgentPaul:
   - Trocar a URL do webhook de n8n → AgentPaul
   - Endpoint: `POST /webhook`

3. **Payload esperado pelo AgentPaul:**
```json
{
  "patientId": "string",
  "conversationId": "string", 
  "message": "string",
  "messageType": "text|image|audio",
  "mediaUrl": "string (opcional)",
  "secret": "nutribuddy-secret-2024"
}
```

4. **Resposta do AgentPaul:**
```json
{
  "success": true,
  "response": "Mensagem processada pelo agente",
  "toolsUsed": ["buscar_dieta_paciente", "analisar_foto_refeicao"],
  "processingTime": 2500
}
```

---

## Teste Manual

Para testar o agente sem integrar com o backend:

```bash
curl -X POST https://[URL-RAILWAY]/test \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Olá, acabei de almoçar arroz com frango",
    "patientId": "teste-123"
  }'
```

---

## Banco de Produtos Brasileiros (interno)

O agente tem uma base local com informações nutricionais de:
- Activia Triplo Zero (ameixa, morango, natural)
- Corpus Zero / Corpus Morango
- Yakult tradicional e 40
- Danone Grego Light
- Vigor Grego
- Nesfit
- Whey Protein genérico

Quando o GPT-4 Vision identifica um desses produtos na foto, o agente busca os macros corretos automaticamente.

---

## Contato

- **Repo:** https://github.com/drpauloguimaraesjr/agentPaul
- **Backend NutriBuddy:** https://web-production-c9eaf.up.railway.app
- **Responsável:** Dr. Paulo Guimarães Jr

---

*Documento gerado em 2026-02-03 03:21 UTC*
