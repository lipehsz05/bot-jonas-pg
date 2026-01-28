import { Telegraf } from 'telegraf';

class TelegramBot {
  constructor(token, configManager, signalsBot = null) {
    if (!token) {
      throw new Error('Token do Telegram é obrigatório');
    }

    this.bot = new Telegraf(token);
    this.isReady = false;
    this.configManager = configManager;
    this.signalsBot = signalsBot; // Referência ao bot principal para controle
    this.reconnecting = false; // Flag para evitar múltiplas reconexões simultâneas
    this.connectionMonitorInterval = null; // Intervalo para monitorar conexão

    // IDs de administradores (podem ser configurados via .env)
    this.adminIds = process.env.TELEGRAM_ADMIN_IDS
      ? process.env.TELEGRAM_ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
      : [];

    this.setupCommands();
  }

  isAdmin(userId) {
    // Se não há admins configurados, ninguém pode usar (segurança)
    if (this.adminIds.length === 0) {
      return false;
    }
    return this.adminIds.includes(userId);
  }

  isPrivateChat(ctx) {
    return ctx.chat.type === 'private';
  }

  setupCommands() {
    // Comando /help
    this.bot.command('help', (ctx) => {
      // Verificar se é admin
      if (!this.isAdmin(ctx.from.id)) {
        ctx.reply('❌ Você não tem permissão para usar este comando. Apenas administradores podem usar os comandos.');
        return;
      }

      const isPrivate = this.isPrivateChat(ctx);
      let message = '📋 *Comandos disponíveis:*\n\n';

      message += '/status - Ver status do bot\n\n';

      if (isPrivate) {
        message += '*Comandos de Administrador (apenas no chat privado):*\n\n';
        message += '/config - Ver configurações atuais\n';
        message += '/setnome <nome> - Alterar nome do site\n';
        message += '   Exemplo: /setnome Meu Site de Sinais\n\n';
        message += '/setlink <link> - Alterar link afiliado\n';
        message += '   Exemplo: /setlink https://exemplo.com/afiliado\n\n';
        message += '/categorias - Ver status das categorias\n';
        message += '/togglepg - Ativar/Desativar PG GAMES\n';
        message += '/start - Iniciar envio de sinais\n';
        message += '/stop - Pausar envio de sinais\n\n';
        message += '⚠️ *Nota:* As alterações afetam as mensagens do WhatsApp e Telegram.\n\n';
      } else {
        message += 'ℹ️ Os comandos de administrador só funcionam no chat privado com o bot.';
      }

      ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // Comando /status
    this.bot.command('status', (ctx) => {
      // Verificar se é admin
      if (!this.isAdmin(ctx.from.id)) {
        ctx.reply('❌ Você não tem permissão para usar este comando. Apenas administradores podem usar os comandos.');
        return;
      }

      ctx.reply(`✅ Bot está ${this.isReady ? 'online' : 'offline'}`);
    });

    // Comando /config - Ver configurações
    this.bot.command('config', (ctx) => {
      // Verificar se é admin
      if (!this.isAdmin(ctx.from.id)) {
        ctx.reply('❌ Você não tem permissão para usar este comando. Apenas administradores podem usar os comandos.');
        return;
      }

      // Apenas em chat privado
      if (!this.isPrivateChat(ctx)) {
        ctx.reply('ℹ️ Este comando só pode ser usado no chat privado com o bot.');
        return;
      }

      const config = this.configManager.getConfig();
      ctx.reply(
        '⚙️ *Configurações Atuais:*\n\n' +
        `📌 *Nome do Site:*\n${config.siteName}\n\n` +
        `🔗 *Link Afiliado:*\n${config.affiliateLink || 'Não configurado'}`,
        { parse_mode: 'Markdown' }
      );
    });

    // Comando /setnome - Alterar nome do site
    this.bot.command('setnome', (ctx) => {
      // Apenas admins em chat privado podem editar
      if (!this.isPrivateChat(ctx)) {
        ctx.reply('ℹ️ Este comando só pode ser usado no chat privado com o bot.');
        return;
      }

      if (!this.isAdmin(ctx.from.id)) {
        ctx.reply('❌ Você não tem permissão para usar este comando. Apenas administradores podem usar os comandos.');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length === 0) {
        ctx.reply(
          '❌ Uso: /setnome <nome>\n\n' +
          'Exemplo: /setnome Meu Site de Sinais'
        );
        return;
      }

      const nome = args.join(' ');
      const success = this.configManager.setSiteName(nome);

      if (success) {
        ctx.reply(`✅ Nome do site alterado para: *${nome}*\n\n💾 Configuração salva no cache e será mantida após reiniciar o bot.\n\nEsta alteração afetará as mensagens do WhatsApp e Telegram.`, {
          parse_mode: 'Markdown'
        });
        console.log(`📝 Nome do site alterado para: ${nome} (por ${ctx.from.username || ctx.from.id})`);
      } else {
        ctx.reply('❌ Erro ao salvar configuração no cache. Tente novamente.');
      }
    });

    // Comando /setlink - Alterar link afiliado
    this.bot.command('setlink', (ctx) => {
      // Apenas admins em chat privado podem editar
      if (!this.isPrivateChat(ctx)) {
        ctx.reply('ℹ️ Este comando só pode ser usado no chat privado com o bot.');
        return;
      }

      if (!this.isAdmin(ctx.from.id)) {
        ctx.reply('❌ Você não tem permissão para usar este comando. Apenas administradores podem usar os comandos.');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length === 0) {
        ctx.reply(
          '❌ Uso: /setlink <link>\n\n' +
          'Exemplo: /setlink https://exemplo.com/afiliado'
        );
        return;
      }

      const link = args.join(' ');

      // Validar se é uma URL
      try {
        new URL(link);
      } catch (e) {
        ctx.reply('❌ Link inválido. Por favor, forneça uma URL válida.\n\nExemplo: https://exemplo.com/afiliado');
        return;
      }

      const success = this.configManager.setAffiliateLink(link);

      if (success) {
        ctx.reply(`✅ Link afiliado alterado para: ${link}\n\n💾 Configuração salva no cache e será mantida após reiniciar o bot.\n\nEsta alteração afetará as mensagens do WhatsApp e Telegram.`);
        console.log(`📝 Link afiliado alterado para: ${link} (por ${ctx.from.username || ctx.from.id})`);
      } else {
        ctx.reply('❌ Erro ao salvar configuração no cache. Tente novamente.');
      }
    });

    // Comando /start - Iniciar bot
    this.bot.command('start', (ctx) => {
      // Se não for admin, mostrar mensagem de boas-vindas básica
      if (!this.isAdmin(ctx.from.id)) {
        const isPrivate = this.isPrivateChat(ctx);
        if (isPrivate) {
          ctx.reply('❌ Você não tem permissão para usar este bot. Apenas administradores podem usar os comandos.\n\n💡 Use /help para ver os comandos disponíveis.');
        } else {
          ctx.reply('ℹ️ Este bot envia sinais automaticamente para este grupo/canal.\n\n💬 Para usar comandos, abra um chat privado com o bot.');
        }
        return;
      }

      // Se não for chat privado, informar
      if (!this.isPrivateChat(ctx)) {
        ctx.reply('ℹ️ Este comando só pode ser usado no chat privado com o bot.');
        return;
      }

      // Iniciar o bot
      if (this.signalsBot) {
        const wasRunning = this.configManager.isBotRunning();
        const success = this.signalsBot.startBot();
        if (success) {
          if (wasRunning) {
            ctx.reply('✅ Bot já estava em execução! Os sinais continuam sendo enviados normalmente.');
          } else {
            ctx.reply('✅ Bot reiniciado e resetado! Os sinais serão enviados normalmente.');
          }
        } else {
          ctx.reply('❌ Erro ao iniciar bot.');
        }
      } else {
        ctx.reply('❌ Referência do bot principal não disponível.');
      }
    });

    // Comando /stop - Parar bot
    this.bot.command('stop', (ctx) => {
      if (!this.isPrivateChat(ctx)) {
        ctx.reply('ℹ️ Este comando só pode ser usado no chat privado com o bot.');
        return;
      }

      if (!this.isAdmin(ctx.from.id)) {
        ctx.reply('❌ Você não tem permissão para usar este comando. Apenas administradores podem usar os comandos.');
        return;
      }

      if (this.signalsBot) {
        const success = this.signalsBot.stopBot();
        if (success) {
          ctx.reply('⏸️ Bot pausado! Os sinais não serão enviados até você usar /start novamente.');
          console.log(`📝 Bot pausado via Telegram (por ${ctx.from.username || ctx.from.id})`);
        } else {
          ctx.reply('❌ Erro ao pausar bot.');
        }
      } else {
        ctx.reply('❌ Referência do bot principal não disponível.');
      }
    });

    // Comando /categorias - Ver status das categorias
    this.bot.command('categorias', (ctx) => {
      if (!this.isPrivateChat(ctx)) {
        ctx.reply('ℹ️ Este comando só pode ser usado no chat privado com o bot.');
        return;
      }

      if (!this.isAdmin(ctx.from.id)) {
        ctx.reply('❌ Você não tem permissão para usar este comando. Apenas administradores podem usar os comandos.');
        return;
      }

      const categories = this.configManager.getCategories();

      let status = '📋 *Status das Categorias:*\n\n';
      status += `🟢 PG GAMES: ${categories.PG ? '✅ Ativo' : '❌ Inativo'}\n\n`;
      status += `💡 Use /togglepg para ativar/desativar`;

      ctx.reply(status, { parse_mode: 'Markdown' });
    });

    // Comando /togglepg - Ativar/Desativar PG GAMES
    this.bot.command('togglepg', (ctx) => {
      if (!this.isPrivateChat(ctx)) {
        ctx.reply('ℹ️ Este comando só pode ser usado no chat privado com o bot.');
        return;
      }

      if (!this.isAdmin(ctx.from.id)) {
        ctx.reply('❌ Você não tem permissão para usar este comando. Apenas administradores podem usar os comandos.');
        return;
      }

      const categories = this.configManager.getCategories();
      const newStatus = !categories.PG;
      this.configManager.setCategory('PG', newStatus);

      ctx.reply(`✅ PG GAMES ${newStatus ? 'ativado' : 'desativado'}!`);
      console.log(`📝 PG GAMES ${newStatus ? 'ativado' : 'desativado'} via Telegram (por ${ctx.from.username || ctx.from.id})`);
    });

  }

  async init() {
    console.log('📱 Inicializando Telegram...');
    console.log('   Verificando token...');

    if (!this.bot) {
      console.error('❌ Bot não foi criado corretamente');
      this.isReady = false;
      return;
    }

    try {
      console.log('   Configurando graceful stop...');
      // Configurar graceful stop
      process.once('SIGINT', () => {
        console.log('   Recebido SIGINT, parando bot...');
        this.bot.stop('SIGINT');
      });
      process.once('SIGTERM', () => {
        console.log('   Recebido SIGTERM, parando bot...');
        this.bot.stop('SIGTERM');
      });

      // Deletar webhook antes de iniciar polling (se houver)
      console.log('   Verificando e removendo webhook (se existir)...');
      try {
        await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('   ✅ Webhook removido com sucesso!');
      } catch (webhookError) {
        console.log(`   ⚠️ Aviso ao remover webhook: ${webhookError.message}`);
        // Continuar mesmo assim
      }

      console.log('   Iniciando bot com polling...');

      // Usar startPolling ao invés de launch (mais rápido e não trava)
      this.bot.startPolling({
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query']
      });

      // Verificar se o bot está funcionando
      try {
        const me = await this.bot.telegram.getMe();
        console.log(`   Bot verificado: @${me.username}`);

        // Configurar comandos do menu
        try {
          await this.bot.telegram.setMyCommands([
            { command: 'start', description: 'Iniciar o bot e ver comandos disponíveis' },
            { command: 'help', description: 'Ver ajuda e lista de comandos' },
            { command: 'status', description: 'Ver status do bot (online/offline)' },
            { command: 'config', description: 'Ver configurações atuais (admin)' },
            { command: 'setnome', description: 'Alterar nome do site (admin)' },
            { command: 'setlink', description: 'Alterar link afiliado (admin)' },
            { command: 'categorias', description: 'Ver status das categorias (admin)' },
            { command: 'togglepg', description: 'Ativar/Desativar PG GAMES (admin)' },
            { command: 'stop', description: 'Pausar envio de sinais (admin)' }
          ]);
          console.log('   ✅ Comandos do menu configurados!');
        } catch (commandsError) {
          console.log(`   ⚠️ Aviso: Não foi possível configurar comandos do menu: ${commandsError.message}`);
          // Continuar mesmo assim
        }
      } catch (verifyError) {
        console.log(`   ⚠️ Aviso: Não foi possível verificar bot: ${verifyError.message}`);
        // Continuar mesmo assim, pode funcionar
      }

      console.log('   Bot iniciado com polling!');
      this.isReady = true;
      console.log('✅ Telegram conectado e pronto!');

      // Configurar tratamento de erros do bot para reconexão automática
      this.bot.catch((err, ctx) => {
        console.error('❌ Erro no Telegram bot:', err);
        // Não encerrar, apenas logar
      });

      // Monitorar conexão e reconectar se necessário
      this.startConnectionMonitor();

    } catch (error) {
      console.error('❌ Erro ao inicializar Telegram:');
      console.error('   Mensagem:', error.message);
      console.error('   Tipo:', error.name);
      if (error.stack) {
        console.error('   Stack trace:');
        console.error(error.stack);
      }
      if (error.response) {
        console.error('   Response:', error.response);
      }
      // Não bloquear o processo, tentar reconectar
      console.log('⚠️ Tentando reconectar Telegram em 10 segundos...');
      this.isReady = false;
      this.attemptReconnect();
    }
  }

  startConnectionMonitor() {
    // Verificar conexão a cada 5 minutos
    this.connectionMonitorInterval = setInterval(async () => {
      if (!this.isReady && this.bot) {
        console.log('🔄 Verificando conexão do Telegram...');
        try {
          const me = await this.bot.telegram.getMe();
          if (me) {
            console.log('✅ Telegram reconectado!');
            this.isReady = true;
          }
        } catch (error) {
          console.log('⚠️ Telegram ainda desconectado. Tentando reconectar...');
          this.attemptReconnect();
        }
      }
    }, 300000); // 5 minutos
  }

  attemptReconnect() {
    if (this.reconnecting) {
      return; // Já está tentando reconectar
    }

    this.reconnecting = true;
    let retryCount = 0;
    const maxRetries = 10;

    const tryReconnect = async () => {
      if (retryCount >= maxRetries) {
        console.error('❌ Máximo de tentativas de reconexão do Telegram atingido. O sistema continuará tentando periodicamente.');
        this.reconnecting = false;
        // Continuar tentando a cada 5 minutos mesmo após max retries
        setTimeout(() => {
          this.attemptReconnect();
        }, 300000);
        return;
      }

      retryCount++;
      const delay = Math.min(10000 * Math.pow(2, retryCount - 1), 120000); // Retry exponencial, máximo 2min

      console.log(`🔄 Tentando reconectar Telegram (tentativa ${retryCount}/${maxRetries}) em ${delay / 1000}s...`);

      setTimeout(async () => {
        if (this.bot) {
          try {
            this.bot.stop(); // Parar polling anterior se existir
          } catch (stopError) {
            // Ignorar erros ao parar
          }

          try {
            // Deletar webhook antes de reconectar (se houver)
            try {
              await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
              console.log('🔧 Webhook removido antes de reconectar');
            } catch (webhookError) {
              // Ignorar erro - webhook pode não existir
            }

            this.bot.startPolling({
              dropPendingUpdates: true,
              allowedUpdates: ['message', 'callback_query']
            });

            // Verificar se está funcionando
            const me = await this.bot.telegram.getMe();
            if (me) {
              console.log('✅ Telegram reconectado com sucesso!');
              this.isReady = true;
              this.reconnecting = false;
              retryCount = 0; // Resetar contador após sucesso
            } else {
              throw new Error('Bot não respondeu corretamente');
            }
          } catch (err) {
            console.error(`❌ Erro ao reconectar Telegram (tentativa ${retryCount}):`, err.message);
            this.isReady = false;
            tryReconnect(); // Tentar novamente
          }
        } else {
          console.log('⚠️ Bot Telegram não disponível. Tentando novamente...');
          tryReconnect();
        }
      }, delay);
    };

    tryReconnect();
  }

  async sendMessage(chatId, message, imageUrl = null) {
    if (!this.isReady) {
      throw new Error('Telegram não está pronto. Aguarde a inicialização.');
    }

    try {
      // Se tiver imagem, enviar com foto
      if (imageUrl) {
        try {
          await this.bot.telegram.sendPhoto(chatId, imageUrl, {
            caption: message,
            parse_mode: 'HTML'
          });
          // Log removido para reduzir verbosidade
          return true;
        } catch (imageError) {
          console.log(`⚠️ Erro ao enviar imagem, enviando apenas texto: ${imageError.message}`);
          // Se falhar, enviar apenas texto
          await this.bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'HTML'
          });
          console.log(`✅ Mensagem enviada para o chat ${chatId}`);
          return true;
        }
      } else {
        await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: 'HTML'
        });
        console.log(`✅ Mensagem enviada para o chat ${chatId}`);
        return true;
      }
    } catch (error) {
      const errorMsg = error.message || String(error);
      console.error(`❌ Erro ao enviar mensagem para o chat ${chatId}: ${errorMsg}`);
      if (error.response) {
        console.error(`   Resposta da API: ${JSON.stringify(error.response)}`);
      }
      if (error.stack) {
        console.error(`   Detalhes: ${error.stack.substring(0, 200)}`);
      }
      return false;
    }
  }

  async sendToChannel(channelId, message) {
    return await this.sendMessage(channelId, message);
  }

  async sendToGroup(groupId, message) {
    return await this.sendMessage(groupId, message);
  }

  async close() {
    // Parar monitoramento de conexão
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval);
      this.connectionMonitorInterval = null;
    }

    if (this.bot) {
      this.bot.stop();
      console.log('🔒 Bot Telegram fechado');
    }
  }
}

export default TelegramBot;

