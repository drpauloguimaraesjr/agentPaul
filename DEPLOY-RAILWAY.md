# 🚀 Deploy do Agente no Railway

## Passo 1: Criar serviço no Railway

1. Acesse https://railway.app
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Escolha o repositório `agentPaul`

---

## Passo 2: Configurar variáveis de ambiente

No Railway, vá em **Variables** e adicione:

```
OPENAI_API_KEY=sk-sua-chave-aqui
BACKEND_URL=https://web-production-c9eaf.up.railway.app
WEBHOOK_SECRET=nutribuddy-secret-2024
AGENT_MODEL=gpt-4o
DEBUG=false
NODE_ENV=production
```

---

## Passo 3: Verificar deploy

Após o deploy, acesse:

```
https://seu-agent.up.railway.app/health
```

Deve retornar:
```json
{
  "status": "ok",
  "service": "nutribuddy-agent",
  "model": "gpt-4o"
}
```

---

## Passo 4: Conectar ao backend

No seu **backend principal**, você precisa apontar o webhook do WhatsApp para o agente.

**Opção A - Redirecionar tudo:**

Em `routes/whatsapp-kesher.js` (ou onde recebe mensagens):

```javascript
// Antes: mandava pro n8n
// await axios.post(N8N_WEBHOOK_URL, mensagem);

// Agora: manda pro agente
const AGENT_URL = process.env.AGENT_URL || 'https://seu-agent.up.railway.app';
await axios.post(`${AGENT_URL}/webhook`, mensagem);
```

**Opção B - Migração gradual (recomendado):**

```javascript
const PACIENTES_AGENTE = ['patient-id-teste'];
const AGENT_URL = process.env.AGENT_URL;

if (AGENT_URL && PACIENTES_AGENTE.includes(mensagem.patientId)) {
  // Usa agente
  await axios.post(`${AGENT_URL}/webhook`, mensagem);
} else {
  // Usa n8n
  await axios.post(N8N_WEBHOOK_URL, mensagem);
}
```

---

## Passo 5: Testar

```bash
curl -X POST https://seu-agent.up.railway.app/test \
  -H "Content-Type: application/json" \
  -d '{
    "dryRun": true,
    "mensagem": {
      "messageId": "test-001",
      "conversationId": "conv-teste",
      "patientId": "patient-teste",
      "patientName": "Paciente Teste",
      "senderRole": "patient",
      "content": "Oi! Vou mandar meu almoço",
      "hasImage": false,
      "hasAudio": false
    }
  }'
```

---

## Checklist Final

- [ ] Serviço criado no Railway
- [ ] Variáveis de ambiente configuradas
- [ ] Health check retornando OK
- [ ] Teste dry-run funcionando
- [ ] Backend apontando pro agente (pelo menos 1 paciente)
- [ ] Teste real com mensagem de WhatsApp
- [ ] Logs mostrando processamento correto

---

## Troubleshooting

### "Cannot find module 'openai'"
```bash
npm install
```
Railway faz isso automaticamente, mas verifique se o `package.json` está correto.

### "OPENAI_API_KEY is required"
Verifique se a variável está configurada no Railway.

### Timeout
GPT-4 pode demorar 10-30s. Railway tem timeout de 5min por padrão, então não deve ser problema.

### "Backend API returned 401"
Verifique se o `WEBHOOK_SECRET` está igual no agente e no backend.

---

## Custos Estimados

**Railway:**
- Hobby plan: $5/mês (500h de execução)
- Pro plan: $20/mês (uso ilimitado)

**OpenAI (GPT-4o):**
- ~$0.01-0.03 por mensagem processada
- 1000 mensagens/dia ≈ $10-30/mês

---

## Próximos Passos

1. Monitorar logs no Railway
2. Configurar alertas de erro (Sentry, etc)
3. Adicionar métricas (Datadog, etc)
4. Migrar mais pacientes gradualmente
5. Desligar n8n quando todos migrarem 🎉
