/**
 * NutriBuddy Agent - MVP
 * Versão 2.0 - Com guardrails e logging
 */

const OpenAI = require('openai');
const { tools, executeTool, verificarEscalacao } = require('./tools');
const { SYSTEM_PROMPT } = require('./prompts');
const { logger } = require('./logger');

class NutriBuddyAgent {
  constructor(config = {}) {
    this.openai = new OpenAI({
      apiKey: config.openaiKey || process.env.OPENAI_API_KEY
    });
    this.model = config.model || 'gpt-4o';
    this.maxIterations = config.maxIterations || 10;
    this.debug = config.debug || false;
  }

  log(...args) {
    if (this.debug) {
      console.log('[Agent]', ...args);
    }
  }

  /**
   * Processa uma mensagem do paciente
   */
  async processar(mensagem) {
    const startTime = Date.now();
    this.log('📩 Processando mensagem:', mensagem.messageId);

    // PRÉ-CHECK: Verificar se precisa escalar
    if (mensagem.content) {
      const escalacao = verificarEscalacao(mensagem.content);
      if (escalacao.escalar) {
        logger.escalation({
          patientId: mensagem.patientId,
          conversationId: mensagem.conversationId,
          motivo: escalacao.motivo,
          urgencia: 'alta',
          gatilho: escalacao.gatilho
        });
      }
    }

    // Monta o contexto da mensagem
    const userMessage = this.buildUserMessage(mensagem);
    
    // Histórico da conversa com o agente
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ];

    let iteration = 0;
    const toolsUsed = [];
    
    while (iteration < this.maxIterations) {
      iteration++;
      this.log(`🔄 Iteração ${iteration}`);

      try {
        // Chama o modelo
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          tools: tools,
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 2000
        });

        const choice = response.choices[0];
        const assistantMessage = choice.message;
        messages.push(assistantMessage);

        // Se não tem tool calls, é a resposta final
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          this.log('✅ Resposta final gerada');
          
          const elapsed = Date.now() - startTime;
          
          return {
            success: true,
            response: assistantMessage.content,
            iterations: iteration,
            toolsUsed,
            messageId: mensagem.messageId,
            elapsedMs: elapsed
          };
        }

        // Executa as ferramentas
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs;
          
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            logger.error('Erro ao parsear argumentos da ferramenta', { 
              tool: toolName, 
              args: toolCall.function.arguments 
            });
            toolArgs = {};
          }
          
          this.log(`🔧 Executando: ${toolName}`, toolArgs);
          toolsUsed.push(toolName);

          const toolStartTime = Date.now();
          
          try {
            const result = await executeTool(toolName, toolArgs, mensagem);
            const toolElapsed = Date.now() - toolStartTime;
            
            this.log(`✅ ${toolName} resultado:`, 
              typeof result === 'string' ? result.substring(0, 100) : result
            );
            
            // Log da ferramenta
            logger.toolCall(toolName, toolArgs, result, toolElapsed);

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
          } catch (toolError) {
            const toolElapsed = Date.now() - toolStartTime;
            
            this.log(`❌ Erro em ${toolName}:`, toolError.message);
            
            // Log do erro
            logger.toolCall(toolName, toolArgs, { error: toolError.message }, toolElapsed);
            
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: toolError.message })
            });
          }
        }

      } catch (error) {
        this.log('❌ Erro na iteração:', error.message);
        logger.error('Erro na iteração do agente', { 
          iteration, 
          error: error.message,
          messageId: mensagem.messageId 
        });
        throw error;
      }
    }

    // Atingiu limite de iterações
    const elapsed = Date.now() - startTime;
    
    logger.warn('Limite de iterações atingido', {
      messageId: mensagem.messageId,
      iterations: iteration,
      toolsUsed
    });
    
    return {
      success: false,
      error: 'Limite de iterações atingido',
      iterations: iteration,
      toolsUsed,
      messageId: mensagem.messageId,
      elapsedMs: elapsed
    };
  }

  /**
   * Monta a mensagem do usuário com contexto
   */
  buildUserMessage(mensagem) {
    const parts = [];

    parts.push(`📱 Nova mensagem de paciente`);
    parts.push(`---`);
    parts.push(`Paciente: ${mensagem.patientName || 'Desconhecido'}`);
    parts.push(`ID: ${mensagem.patientId || mensagem.senderId}`);
    parts.push(`Conversa: ${mensagem.conversationId}`);
    parts.push(`Telefone: ${mensagem.patientPhone || 'N/A'}`);
    parts.push(`---`);

    // Tipo de mídia
    if (mensagem.hasImage) {
      parts.push(`🖼️ FOTO ANEXADA: ${mensagem.imageUrl || mensagem.mediaUrl}`);
    }
    if (mensagem.hasAudio) {
      parts.push(`🎤 ÁUDIO ANEXADO: ${mensagem.audioUrl || mensagem.mediaUrl}`);
      if (mensagem.audioTranscription) {
        parts.push(`Transcrição: "${mensagem.audioTranscription}"`);
      }
    }

    // Conteúdo texto
    if (mensagem.content && mensagem.content.trim()) {
      parts.push(`💬 Mensagem: "${mensagem.content}"`);
    }

    // Timestamp
    parts.push(`---`);
    parts.push(`Horário: ${mensagem.timestamp || new Date().toISOString()}`);

    // Flag de dry run
    if (mensagem._dryRun) {
      parts.push(`⚠️ MODO TESTE - Não enviar mensagens reais`);
    }

    return parts.join('\n');
  }
}

module.exports = { NutriBuddyAgent };
