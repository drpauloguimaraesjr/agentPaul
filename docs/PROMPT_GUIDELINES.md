# 📝 Diretrizes para Sugestões de Prompt do AgentPaul

## 🎯 Visão Geral

O AgentPaul é um assistente de nutrição autônomo que usa GPT-4o-mini com 14 ferramentas. O prompt define seu comportamento, personalidade e limites.

**Arquivo principal:** `prompts.js`

---

## ✅ Como Fazer Sugestões de Prompt

### 1. Seja Específico e Acionável

❌ **Ruim:** "Seja mais amigável"
✅ **Bom:** "Ao cumprimentar, use o nome do paciente e pergunte como foi o dia"

❌ **Ruim:** "Melhore as respostas"
✅ **Bom:** "Sempre inclua o total de proteínas no topo da resposta"

### 2. Defina o Comportamento Claramente

Use verbos de ação claros:

- "SEMPRE faça X antes de Y"
- "NUNCA faça X sem antes Y"
- "Se acontecer X, então faça Y"

**Exemplo:**

```
SEMPRE use a ferramenta buscar_contexto_paciente antes de responder
Se o paciente enviar foto, SEMPRE registre automaticamente no diário
NUNCA estime pesos sem analisar a foto primeiro
```

### 3. Forneça Exemplos Concretos

O agente aprende melhor com exemplos de entrada/saída:

```
Exemplo de resposta para foto de refeição:

"📸 Identifiquei seu almoço:
• Arroz branco - 150g
• Frango grelhado - 120g

📊 Total: 45g proteína | 55g carbs | 480 kcal

✅ Já registrei no seu diário! Dentro da meta!"
```

### 4. Defina Prioridades

Se há conflito entre regras, defina a ordem:

```
Prioridade 1: Segurança - nunca dar conselho médico
Prioridade 2: Precisão - verificar dados antes de responder
Prioridade 3: Experiência - ser amigável e encorajador
```

---

## 📋 Formato Recomendado para Sugestões

Use este template ao sugerir mudanças:

```markdown
## Sugestão: [Nome curto]

**Contexto:** [Por que essa mudança é necessária?]

**Comportamento Atual:** [O que o agente faz hoje]

**Comportamento Desejado:** [O que você quer que ele faça]

**Exemplo de Situação:**

- Paciente envia: [mensagem/foto]
- Agente deve responder: [resposta esperada]

**Impacto:** [Quais partes do prompt precisam mudar]
```

---

## 🔧 Áreas do Prompt que Podem Ser Ajustadas

### 1. Tom de Voz (Seção "Tom de Voz")

- Nível de formalidade
- Uso de emojis
- Estilo de celebração/motivação

### 2. Fluxo de Ferramentas (Seções "Fluxo Típico")

- Ordem de chamada das ferramentas
- Quando usar cada ferramenta
- Comportamento automático vs. perguntar

### 3. Formato de Resposta (Seção "Formato de Resposta")

- Estrutura da mensagem
- Informações obrigatórias
- Ordem dos elementos

### 4. Limites e Restrições (Seção "Limites Importantes")

- O que pode/não pode fazer
- Temas fora do escopo
- Respostas para situações proibidas

### 5. Tratamento de Erros (Seção "Erros a Evitar")

- Comportamentos a evitar
- Como lidar com incerteza
- Quando pedir confirmação

---

## 🚫 O Que NÃO Colocar no Prompt

1. **Informações técnicas de implementação** - O agente não precisa saber como o código funciona
2. **URLs ou endpoints** - Esses ficam no código, não no prompt
3. **Chaves de API** - Nunca inclua secrets no prompt
4. **Regras muito específicas** - Ex: "Se o paciente se chama João, responda X"
5. **Instruções contraditórias** - "Seja breve" + "Explique tudo em detalhes"

---

## 📊 Ferramentas Disponíveis (14 total)

O prompt pode referenciar qualquer uma destas ferramentas:

| Ferramenta                    | O que faz                        |
| ----------------------------- | -------------------------------- |
| `buscar_contexto_paciente`    | Busca TODOS os dados do paciente |
| `buscar_dieta_paciente`       | Busca dieta prescrita            |
| `analisar_foto_refeicao`      | Analisa foto com GPT-4 Vision    |
| `registrar_refeicao`          | Salva no diário alimentar        |
| `enviar_mensagem_whatsapp`    | Envia resposta ao paciente       |
| `buscar_historico_conversa`   | Vê mensagens anteriores          |
| `buscar_correcoes_aprendidas` | Correções de peso aprendidas     |
| `salvar_correcao_peso`        | Salva correção para aprender     |
| `buscar_resumo_diario`        | Macros do dia vs metas           |
| `transcrever_audio`           | Transcreve áudio (Whisper)       |
| `buscar_info_restaurante`     | Info de restaurantes             |
| `aplicar_correcao_peso`       | Aplica correções automáticas     |
| `buscar_produto_internet`     | Busca info de produtos           |
| `salvar_produto_banco`        | Salva produto no banco local     |

---

## 📝 Exemplos de Boas Sugestões

### Exemplo 1: Mudança de Comportamento

```markdown
## Sugestão: Registrar Automaticamente

**Contexto:** Pacientes não respondem "sim" para confirmar, e refeições não são registradas.

**Comportamento Atual:** Agente pergunta "Está correto?" e espera resposta.

**Comportamento Desejado:** Registrar automaticamente e avisar que registrou.

**Exemplo:**

- Paciente envia: [foto de almoço]
- Agente deve responder: "📸 Vi seu almoço! ✅ Já registrei no seu diário! [detalhes]"

**Impacto:** Alterar seção "Erros a Evitar" e exemplo de resposta.
```

### Exemplo 2: Ajuste de Tom

```markdown
## Sugestão: Mais Motivador

**Contexto:** Feedback de pacientes dizendo que respostas são secas.

**Comportamento Atual:** "Registrado. Total: 480 kcal."

**Comportamento Desejado:** "Ótima escolha! 💪 Essa refeição está perfeita para sua meta de proteína!"

**Impacto:** Alterar seção "Tom de Voz" com exemplos de frases motivacionais.
```

---

## 🔄 Processo de Atualização

1. **Sugestão** → Documento com formato acima
2. **Revisão** → Avaliar impacto e viabilidade
3. **Implementação** → Alterar `prompts.js`
4. **Teste** → Fazer deploy e testar com mensagens reais
5. **Validação** → Verificar se comportamento mudou como esperado

---

## 📞 Contato

Para sugestões de prompt, use este documento como referência.
O código do AgentPaul pode ser alterado diretamente em:

- **Prompt:** `agentPaul-temp/prompts.js`
- **Ferramentas:** `agentPaul-temp/tools.js`
- **Lógica:** `agentPaul-temp/agent.js`

Deploy automático via GitHub → Railway.
