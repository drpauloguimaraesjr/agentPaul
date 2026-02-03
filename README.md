# 🤖 AgentPaul - NutriBuddy Agent v2.0

Agente inteligente que substitui o n8n para processamento de mensagens do NutriBuddy.

## 🆕 Novidades da v2.0

- **Guardrails de segurança** - Limites claros de escopo
- **Rate limiting** - Proteção contra abuso
- **Logging estruturado** - Auditoria completa
- **Escalação para humano** - Casos que precisam de ajuda
- **Validações robustas** - Em todas as ferramentas

## 🎯 O que é?

O AgentPaul é um agente baseado em GPT-4 que **raciocina** sobre o que fazer, em vez de seguir IF/ELSE fixos como o n8n.

## 🏗️ Arquitetura

```
WhatsApp ──▶ Backend ──▶ AGENTE ──▶ Backend APIs
                           │
                           └──▶ OpenAI (como cérebro)
```

## 🛡️ Segurança (v2.0)

### Camadas de Proteção

| Camada | Descrição |
|--------|-----------|
| System Prompt | Limites claros do que pode/não pode fazer |
| Validação de parâmetros | Cada ferramenta valida seus inputs |
| Guardrails de conteúdo | Filtra mensagens fora do escopo |
| Rate limiting | 15 req/min por paciente |
| Logging | Todas as ações são registradas |
| Escalação | Casos críticos vão para humano |

### O que o Agente NÃO pode fazer

- ❌ Acessar dados de outros pacientes
- ❌ Enviar mensagens para outras conversas
- ❌ Falar sobre política, religião, etc
- ❌ Dar diagnósticos médicos
- ❌ Executar código arbitrário

## 🔧 Ferramentas Disponíveis (11 total)

1. **buscar_dieta_paciente** - Busca dieta prescrita
2. **analisar_foto_refeicao** - GPT-4 Vision
3. **registrar_refeicao** - Salva no banco
4. **enviar_mensagem_whatsapp** - Responde ao paciente
5. **buscar_historico_conversa** - Contexto anterior
6. **buscar_correcoes_aprendidas** - Correções de peso
7. **salvar_correcao_peso** - Aprende com feedback
8. **buscar_resumo_diario** - Macros do dia
9. **transcrever_audio** - Whisper (placeholder)
10. **buscar_info_restaurante** - Info nutricional
11. **escalar_para_humano** - Casos críticos (NOVO)

## 🚀 Deploy

### Variáveis de Ambiente

```env
OPENAI_API_KEY=sk-...
BACKEND_URL=https://web-production-c9eaf.up.railway.app
WEBHOOK_SECRET=nutribuddy-secret-2024
AGENT_MODEL=gpt-4o
DEBUG=false
NODE_ENV=production
LOG_LEVEL=INFO
```

### Railway

1. Crie um novo projeto no Railway
2. Conecte este repositório
3. Configure as variáveis de ambiente
4. Deploy automático!

### Local

```bash
npm install
cp .env.example .env
# Edite .env com suas credenciais
npm start
```

## 📡 Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/` | Info do serviço |
| GET | `/stats` | Estatísticas (NOVO) |
| POST | `/webhook` | Processa mensagens |
| POST | `/test` | Testa sem afetar produção |
| POST | `/simulate` | Simula conversa completa |

## 📁 Estrutura

```
agentPaul/
├── package.json      # Dependências
├── server.js         # Servidor Express + rate limiting
├── index.js          # Classe principal do agente
├── tools.js          # 11 ferramentas + validações
├── prompts.js        # System prompt + guardrails
├── logger.js         # Logging estruturado (NOVO)
├── .env.example      # Template de variáveis
├── .gitignore        # Arquivos ignorados
├── README.md         # Este arquivo
├── DEPLOY-RAILWAY.md # Guia de deploy
└── COMO-MIGRAR.md    # Guia de migração
```

## 📊 Comparação com n8n

| Aspecto | n8n | Agente v2.0 |
|---------|-----|-------------|
| Decisões | IF/ELSE fixos | IA decide |
| Novos casos | Precisa criar nós | Adapta automaticamente |
| Debug | Caçar entre 30 nós | Ver logs estruturados |
| Segurança | Manual | Guardrails automáticos |
| Escalação | Manual | Automática |
| Linhas de código | 3500+ | ~1200 |

## 💰 Custos Estimados

- **Railway**: $5-20/mês
- **OpenAI (GPT-4o)**: ~$0.01-0.03 por mensagem

## 📝 Licença

MIT - Paulo Guimarães Jr
