# 🔄 Como Migrar do n8n para o Agente

## Passo 1: Deploy do Agente

### 1.1 Verificar arquivos

Todos os arquivos necessários estão neste repositório:

```
agentPaul/
├── package.json
├── server.js
├── index.js
├── tools.js
├── prompts.js
├── .env.example
└── ...
```

### 1.2 Deploy no Railway

Siga o guia em `DEPLOY-RAILWAY.md`.

### 1.3 Verificar

```bash
curl https://seu-agent.up.railway.app/health
```

Deve retornar:
```json
{"status":"ok","model":"gpt-4o","timestamp":"..."}
```

---

## Passo 2: Testar com Mensagem Fake

```bash
curl -X POST https://seu-agent.up.railway.app/test \
  -H "Content-Type: application/json" \
  -d '{
    "dryRun": true,
    "mensagem": {
      "messageId": "test-001",
      "conversationId": "SEU_CONVERSATION_ID_DE_TESTE",
      "patientId": "SEU_PATIENT_ID_DE_TESTE",
      "patientName": "Paciente Teste",
      "patientPhone": "5511999999999",
      "senderRole": "patient",
      "content": "oi, bom dia!",
      "hasImage": false,
      "hasAudio": false,
      "timestamp": "2024-01-15T12:00:00Z"
    }
  }'
```

---

## Passo 3: Testar com Paciente Real (em Paralelo)

### Opção A: Criar webhook paralelo

No seu código que recebe mensagens do WhatsApp (provavelmente em `routes/whatsapp-kesher.js` ou similar), adicione um switch:

```javascript
// Lista de pacientes que usam o agente (para teste)
const PACIENTES_AGENTE = [
  'seu-patient-id-de-teste'
];

// No handler do webhook
if (PACIENTES_AGENTE.includes(mensagem.patientId)) {
  // Usa o agente
  console.log('🤖 Usando agente para:', mensagem.patientId);
  await axios.post(`${AGENT_URL}/webhook`, mensagem);
} else {
  // Usa n8n (comportamento atual)
  console.log('⚙️ Usando n8n para:', mensagem.patientId);
  await axios.post(N8N_WEBHOOK_URL, mensagem);
}
```

### Opção B: Variável de ambiente

```javascript
const USE_AGENT = process.env.USE_AGENT === 'true';

if (USE_AGENT) {
  await axios.post(`${AGENT_URL}/webhook`, mensagem);
} else {
  await axios.post(N8N_WEBHOOK_URL, mensagem);
}
```

---

## Passo 4: Monitorar

Acompanhe os logs no Railway:

```
[Agent] 📩 Mensagem recebida: msg-123
[Agent] Paciente: João (patient-abc)
[Agent] Tipo: FOTO
[Agent] 🔄 Iteração 1
[Agent] 🔧 Executando: buscar_dieta_paciente {...}
[Agent] ✅ buscar_dieta_paciente resultado: {...}
[Agent] 🔄 Iteração 2
[Agent] 🔧 Executando: analisar_foto_refeicao {...}
...
[Agent] ✅ Concluído em 8523ms (5 iterações)
```

---

## Passo 5: Migrar Todos

Quando estiver confiante:

1. Remova o switch de pacientes
2. Aponte TODAS as mensagens pro agente
3. Desative o workflow no n8n
4. (Opcional) Cancele a conta do n8n cloud

---

## Rollback

Se der problema, é só reverter:

1. Volte o switch pra n8n
2. Ou remova a rota do agente do server.js
3. Deploy

O n8n continua funcionando enquanto você testa.

---

## Checklist

- [ ] Arquivos do agente no repositório
- [ ] Deploy feito no Railway
- [ ] Health check funcionando
- [ ] Teste dry-run funcionando
- [ ] Paciente de teste configurado
- [ ] Teste real com foto funcionando
- [ ] Logs mostrando iterações corretamente
- [ ] Mensagens chegando no WhatsApp do paciente
- [ ] Refeições sendo registradas no banco
- [ ] Correções de peso sendo salvas
- [ ] Pronto pra migrar mais pacientes!
