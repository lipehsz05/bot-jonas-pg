import dotenv from 'dotenv';
import SiteScraper from './scraper.js';
import WhatsAppBot from './whatsapp.js';
import TelegramBot from './telegram.js';
import ConfigManager from './config.js';

// Carregar variáveis de ambiente
dotenv.config();

// Função para obter horário de Brasília
function getBrasiliaTime() {
  // Usar Intl.DateTimeFormat para obter componentes do horário de Brasília
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const year = parseInt(parts.find(p => p.type === 'year').value);
  const month = parseInt(parts.find(p => p.type === 'month').value) - 1; // month é 0-indexed
  const day = parseInt(parts.find(p => p.type === 'day').value);
  const hour = parseInt(parts.find(p => p.type === 'hour').value);
  const minute = parseInt(parts.find(p => p.type === 'minute').value);
  const second = parseInt(parts.find(p => p.type === 'second').value);

  return new Date(year, month, day, hour, minute, second);
}

class SignalsBot {
  constructor() {
    this.scraper = new SiteScraper();
    this.whatsapp = new WhatsAppBot();
    this.telegram = null;
    this.lastSignals = [];
    this.sentSignals = new Set(); // Set para rastrear sinais já enviados (usando chave única)
    this.interval = null;
    this.statusMonitorInterval = null; // Intervalo para monitoramento de status
    this.watchdogInterval = null; // Intervalo para watchdog
    this.configManager = new ConfigManager();
    this.startTime = null; // Horário de início do bot
    this.isRunning = false; // Status de execução do bot
    this.isInitializingBrowser = false; // Flag para evitar múltiplas inicializações simultâneas
    this.lastInitAttempt = 0; // Timestamp da última tentativa de inicialização
    this.lastSignalSentTime = null; // Timestamp do último envio de sinal
    this.forceSendInterval = null; // Intervalo para forçar envio periódico
    this.consecutiveNoSignalsCount = 0; // Contador de ciclos sem sinais
    this.isProcessingSignals = false; // Flag para evitar processamento duplicado de sinais
    this.healthCheckInterval = null; // Intervalo para verificação de saúde
    this.lastHealthCheck = null; // Timestamp do último health check
    this.recoveryAttempts = 0; // Contador de tentativas de recuperação
    this.isRecovering = false; // Flag para evitar múltiplas recuperações simultâneas
    this.intervalChecker = null; // Verificador de intervalo
  }

  // Converter countdown (ex: "2m 12s", "1m", "30s") para milissegundos
  parseCountdownToMs(countdownText) {
    if (!countdownText) return 0;

    let totalMs = 0;
    const text = countdownText.trim();

    // Extrair minutos: "2m" ou "2m 12s"
    const minutesMatch = text.match(/(\d+)m/);
    if (minutesMatch) {
      totalMs += parseInt(minutesMatch[1]) * 60 * 1000;
    }

    // Extrair segundos: "12s" ou "30s"
    const secondsMatch = text.match(/(\d+)s/);
    if (secondsMatch) {
      totalMs += parseInt(secondsMatch[1]) * 1000;
    }

    return totalMs;
  }

  // Métodos para controle do bot via Telegram
  stopBot() {
    this.configManager.setBotRunning(false);
    this.isRunning = false;
    // Não limpar o statusMonitorInterval, apenas pausar o envio de sinais
    // O monitoramento continua, mas não processa sinais
    return true;
  }

  startBot() {
    const wasRunning = this.configManager.isBotRunning();
    this.configManager.setBotRunning(true);
    this.isRunning = true;

    // Se o bot estava parado e agora foi iniciado, fazer reset completo
    if (!wasRunning) {
      console.log('🔄 Reiniciando bot após /stop...');
      
      // Limpar cache de sinais enviados para permitir reenvio
      this.sentSignals.clear();
      this.lastSignals = [];
      this.consecutiveNoSignalsCount = 0;
      this.lastSignalSentTime = null;
      
      // Reiniciar monitoramento se não estiver ativo
      if (!this.statusMonitorInterval) {
        console.log('🔄 Reiniciando monitoramento de status...');
        this.startStatusMonitoring();
      }
      
      // Reiniciar health check se não estiver ativo
      if (!this.healthCheckInterval) {
        this.startHealthCheck();
      }
      
      // Reiniciar watchdog se não estiver ativo
      if (!this.watchdogInterval) {
        this.startWatchdog();
      }
      
      // Reiniciar sistema de envio forçado se não estiver ativo
      if (!this.forceSendInterval) {
        this.startForcedSendInterval();
      }
      
      console.log('✅ Bot reiniciado com sucesso! Sistema resetado e pronto para enviar sinais.');
    }

    return true;
  }

  async init() {
    console.log('🚀 Inicializando Bot de Sinais...\n');

    // Inicializar WhatsApp PRIMEIRO (essencial)
    console.log('📱 Inicializando WhatsApp...');
    try {
      await this.whatsapp.init();

      // Aguardar WhatsApp estar pronto antes de continuar (com timeout maior)
      console.log('⏳ Aguardando conexão do WhatsApp...');

      // Aguardar até 10 minutos para WhatsApp conectar (pode demorar na primeira vez)
      const whatsappTimeout = 600000; // 10 minutos
      const startTime = Date.now();

      while (!this.whatsapp.isReady && (Date.now() - startTime) < whatsappTimeout) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Verificar a cada 2 segundos

        // Se passou muito tempo, logar status
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (elapsed % 30 === 0 && elapsed > 0) {
          console.log(`⏳ Ainda aguardando WhatsApp conectar... (${elapsed}s decorridos)`);
        }
      }

      if (!this.whatsapp.isReady) {
        console.log('⚠️ WhatsApp não conectou dentro do timeout. Continuando e tentando reconectar em background...');
        console.log('⚠️ O bot continuará funcionando e tentará reconectar o WhatsApp automaticamente.');
      } else {
        console.log('✅ WhatsApp conectado!\n');
      }
    } catch (error) {
      console.error('❌ Erro ao inicializar WhatsApp:', error.message);
      // Não lançar erro fatal - permitir que o sistema continue
      // O WhatsApp tentará reconectar automaticamente
      console.log('⚠️ Continuando sem WhatsApp inicializado. O sistema tentará reconectar automaticamente...');
      this.whatsapp.isReady = false;
    }

    // Inicializar Telegram APÓS WhatsApp estar conectado (em background, não bloqueia)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      console.log('📱 Inicializando Telegram em background...');
      console.log('   Token encontrado:', process.env.TELEGRAM_BOT_TOKEN.substring(0, 10) + '...');

      try {
        console.log('   Criando instância do TelegramBot...');
        this.telegram = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, this.configManager, this);

        console.log('   Iniciando Telegram (não bloqueia o processo)...');
        // Inicializar Telegram em background sem bloquear
        this.telegram.init().then(() => {
          if (this.telegram && this.telegram.isReady) {
            console.log('✅ Telegram conectado e pronto!');
          }
        }).catch((error) => {
          console.error('❌ Erro ao inicializar Telegram:', error.message);
          console.log('⚠️ Continuando sem Telegram...');
          this.telegram = null;
        });

        // Aguardar apenas 1 segundo para ver se inicializa rapidamente (reduzido para iniciar mais rápido)
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (this.telegram && this.telegram.isReady) {
          console.log('✅ Telegram já está pronto!\n');
        } else {
          console.log('⏳ Telegram ainda inicializando em background, continuando...\n');
        }
      } catch (error) {
        console.error('❌ Erro ao criar instância do Telegram:');
        console.error('   Tipo:', error.name);
        console.error('   Mensagem:', error.message);
        console.log('⚠️ Continuando sem Telegram...\n');
        this.telegram = null;
      }
    } else {
      console.log('⚠️ Token do Telegram não configurado. Pulando inicialização do Telegram.\n');
    }

    console.log('✅ Bot inicializado com sucesso!\n');
  }

  async waitForWhatsAppReady(timeout = 300000) {
    // Aguardar até 5 minutos para WhatsApp conectar
    const startTime = Date.now();

    while (!this.whatsapp.isReady && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Verificar a cada 1 segundo
    }

    if (!this.whatsapp.isReady) {
      throw new Error('Timeout aguardando WhatsApp conectar');
    }

    return true;
  }

  formatSignalMessage(signals) {
    if (!signals || signals.length === 0) {
      return '⚠️ Nenhum sinal encontrado no momento.';
    }

    // Obter categoria principal do env (normalizar para remover "_GAMES" se presente)
    let mainCategory = (process.env.MAIN_CATEGORY || 'PG').toUpperCase().replace('_GAMES', '');
    const categoryMap = {
      'PG': { platform: 'PG GAMES', types: ['pg-game', 'pg-game-text', 'pg-game-context', 'pg-game-alt'] },
      'PP': { platform: 'PP GAMES', types: ['pp-game', 'pp-game-text', 'pp-game-context', 'pp-game-alt'] },
      'WG': { platform: 'WG GAMES', types: ['wg-game', 'wg-game-text', 'wg-game-context', 'wg-game-alt'] }
    };
    const categoryInfo = categoryMap[mainCategory] || categoryMap['PG'];

    // Filtrar apenas sinais da categoria principal
    const categorySignals = signals.filter(s =>
      (s.platform && s.platform.toUpperCase().includes(categoryInfo.platform)) ||
      categoryInfo.types.includes(s.type)
    );

    if (categorySignals.length === 0) {
      return `⚠️ Nenhum sinal da ${categoryInfo.platform} encontrado no momento.`;
    }

    // Nome do site (do config manager - editável via Telegram)
    const siteName = this.configManager.getSiteName();

    // Calcular horário pagante: desde o início do bot até o próximo intervalo de 5 minutos
    const formatTime = (date) => {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    let horarioPagante;
    // Sempre usar o horário atual como início (momento em que a mensagem está sendo formatada)
    const now = new Date();
    const endTime = new Date(now);
    const currentMinutes = now.getMinutes();

    // Calcular próximo intervalo de 5 minutos
    // Exemplo: se agora é 21:29, o próximo intervalo é 21:30
    // Se agora é 21:31, o próximo intervalo é 21:35
    const nextIntervalMinutes = Math.ceil((currentMinutes + 1) / 5) * 5;

    if (nextIntervalMinutes >= 60) {
      endTime.setHours(endTime.getHours() + 1);
      endTime.setMinutes(nextIntervalMinutes - 60);
    } else {
      endTime.setMinutes(nextIntervalMinutes);
    }
    endTime.setSeconds(0);
    endTime.setMilliseconds(0);

    horarioPagante = `${formatTime(now)} até ${formatTime(endTime)}`;

    // Formatar cada sinal
    const messages = [];

    categorySignals.forEach((signal) => {
      let message = '*👑Rei dos Sinais👑*\n\n';

      // Nome do jogo
      const gameName = signal.gameName || signal.title || 'Jogo';
      message += `*${gameName}*\n\n`;

      // Possibilidades de ganhos
      const possibilidades = signal.possibilidadesGanhos || signal.distribuicao || 'N/A';
      message += `Possibilidades de ganhos: *${possibilidades}%* ⭐️\n\n`;

      // Sinal testado
      message += `Sinal testado na *${siteName}*✅\n\n`;

      // Log dos valores extraídos removido para reduzir verbosidade

      // Função helper para determinar emoji baseado na porcentagem
      const getEmojiForPercentage = (percentage) => {
        if (percentage === 'N/A' || !percentage) return '⚠️';
        const num = parseFloat(percentage);
        if (isNaN(num)) return '⚠️';
        if (num >= 70) return '🟢'; // Verde para >= 70%
        if (num >= 35) return '⚠️';  // Amarelo para 35-69%
        return '❌'; // Vermelho para < 35%
      };

      // Apostas com emojis baseados na porcentagem
      message += `${getEmojiForPercentage(signal.betMin)} Mínima: ${signal.betMin || 'N/A'}%\n`;
      message += `${getEmojiForPercentage(signal.betDefault)} Padrão: ${signal.betDefault || 'N/A'}%\n`;
      message += `${getEmojiForPercentage(signal.betMax)} Máxima: ${signal.betMax || 'N/A'}%\n\n`;

      // Apostas sugeridas
      message += `Aposta sugerida:\n\n`;

      // Só adicionar se o valor existir, não estiver vazio e não for o valor padrão incorreto
      if (signal.betBonus && signal.betBonus.trim() && signal.betBonus !== '1,00' && signal.betBonus !== '1.00') {
        message += `BET BÔNUS (${signal.betBonus})\n`;
      }

      if (signal.betConexaoMin && signal.betConexaoMin.trim() && signal.betConexaoMin !== '1,00' && signal.betConexaoMin !== '1.00') {
        message += `BET CONEXÃO (${signal.betConexaoMin})\n`;
      }

      if (signal.betExtraMin && signal.betExtraMin.trim() && signal.betExtraMin !== '1,00' && signal.betExtraMin !== '1.00') {
        message += `BET EXTRA (${signal.betExtraMin})\n\n`;
      }

      // Horário pagante
      message += `*Horário pagante:* ${horarioPagante}\n\n`;

      // Emojis
      message += `💰💰💰💰💰💰💰💰💰💰\n\n`;

      // Link afiliado (do config manager - editável via Telegram)
      // Priorizar link do configManager sobre o link do site
      const affiliateLink = this.configManager.getAffiliateLink();
      if (affiliateLink && affiliateLink.trim()) {
        // Usar link do configManager se estiver configurado
        message += `${affiliateLink}`;
      } else if (signal.href && signal.href.trim()) {
        // Se não houver link no configManager, usar o link do site
        message += `${signal.href}`;
      }
      // Se não houver nenhum link, não adiciona nada

      messages.push(message);
    });

    // Retornar todas as mensagens (uma por jogo)
    return messages.length === 1 ? messages[0] : messages.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
  }

  formatTelegramMessage(signals) {
    if (!signals || signals.length === 0) {
      return '⚠️ Nenhum sinal encontrado no momento.';
    }

    // Obter categoria principal do env (normalizar para remover "_GAMES" se presente)
    let mainCategory = (process.env.MAIN_CATEGORY || 'PG').toUpperCase().replace('_GAMES', '');
    const categoryMap = {
      'PG': { platform: 'PG GAMES', types: ['pg-game', 'pg-game-text', 'pg-game-context', 'pg-game-alt'] },
      'PP': { platform: 'PP GAMES', types: ['pp-game', 'pp-game-text', 'pp-game-context', 'pp-game-alt'] },
      'WG': { platform: 'WG GAMES', types: ['wg-game', 'wg-game-text', 'wg-game-context', 'wg-game-alt'] }
    };
    const categoryInfo = categoryMap[mainCategory] || categoryMap['PG'];

    // Filtrar apenas sinais da categoria principal
    const categorySignals = signals.filter(s =>
      (s.platform && s.platform.toUpperCase().includes(categoryInfo.platform)) ||
      categoryInfo.types.includes(s.type)
    );

    if (categorySignals.length === 0) {
      return `⚠️ Nenhum sinal da ${categoryInfo.platform} encontrado no momento.`;
    }

    // Nome do site (do config manager - editável via Telegram)
    const siteName = this.configManager.getSiteName();

    // Calcular horário pagante: desde o início do bot até o próximo intervalo de 5 minutos
    const formatTime = (date) => {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    let horarioPagante;
    // Sempre usar o horário atual como início (momento em que a mensagem está sendo formatada)
    const now = new Date();
    const endTime = new Date(now);
    const currentMinutes = now.getMinutes();

    // Calcular próximo intervalo de 5 minutos
    // Exemplo: se agora é 21:29, o próximo intervalo é 21:30
    // Se agora é 21:31, o próximo intervalo é 21:35
    const nextIntervalMinutes = Math.ceil((currentMinutes + 1) / 5) * 5;

    if (nextIntervalMinutes >= 60) {
      endTime.setHours(endTime.getHours() + 1);
      endTime.setMinutes(nextIntervalMinutes - 60);
    } else {
      endTime.setMinutes(nextIntervalMinutes);
    }
    endTime.setSeconds(0);
    endTime.setMilliseconds(0);

    horarioPagante = `${formatTime(now)} até ${formatTime(endTime)}`;

    // Formatar cada sinal
    const messages = [];

    categorySignals.forEach((signal) => {
      let message = '<b>👑Rei dos Sinais👑</b>\n\n';

      // Nome do jogo
      const gameName = signal.gameName || signal.title || 'Jogo';
      const escapedGameName = gameName
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      message += `<b>${escapedGameName}</b>\n\n`;

      // Possibilidades de ganhos
      const possibilidades = signal.possibilidadesGanhos || signal.distribuicao || 'N/A';
      const escapedPossibilidades = String(possibilidades)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      message += `Possibilidades de ganhos: <b>${escapedPossibilidades}%</b> ⭐️\n\n`;

      // Sinal testado
      const escapedSiteName = siteName
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      message += `Sinal testado na <b>${escapedSiteName}</b>✅\n\n`;

      // Função helper para determinar emoji baseado na porcentagem
      const getEmojiForPercentage = (percentage) => {
        if (percentage === 'N/A' || !percentage) return '⚠️';
        const num = parseFloat(percentage);
        if (isNaN(num)) return '⚠️';
        if (num >= 70) return '🟢'; // Verde para >= 70%
        if (num >= 35) return '⚠️';  // Amarelo para 35-69%
        return '❌'; // Vermelho para < 35%
      };

      // Apostas com emojis baseados na porcentagem
      message += `${getEmojiForPercentage(signal.betMin)} Mínima: ${signal.betMin || 'N/A'}%\n`;
      message += `${getEmojiForPercentage(signal.betDefault)} Padrão: ${signal.betDefault || 'N/A'}%\n`;
      message += `${getEmojiForPercentage(signal.betMax)} Máxima: ${signal.betMax || 'N/A'}%\n\n`;

      // Apostas sugeridas
      message += `Aposta sugerida:\n\n`;

      // Só adicionar se o valor existir, não estiver vazio e não for o valor padrão incorreto
      if (signal.betBonus && signal.betBonus.trim() && signal.betBonus !== '1,00' && signal.betBonus !== '1.00') {
        const escapedBetBonus = String(signal.betBonus)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        message += `BET BÔNUS (${escapedBetBonus})\n`;
      }

      if (signal.betConexaoMin && signal.betConexaoMin.trim() && signal.betConexaoMin !== '1,00' && signal.betConexaoMin !== '1.00') {
        const escapedBetConexao = String(signal.betConexaoMin)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        message += `BET CONEXÃO (${escapedBetConexao})\n`;
      }

      if (signal.betExtraMin && signal.betExtraMin.trim() && signal.betExtraMin !== '1,00' && signal.betExtraMin !== '1.00') {
        const escapedBetExtra = String(signal.betExtraMin)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        message += `BET EXTRA (${escapedBetExtra})\n\n`;
      }

      // Horário pagante
      const escapedHorario = horarioPagante
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      message += `<b>Horário pagante:</b> ${escapedHorario}\n\n`;

      // Emojis
      message += `💰💰💰💰💰💰💰💰💰💰\n\n`;

      // Link afiliado (do config manager - editável via Telegram)
      // Priorizar link do configManager sobre o link do site
      const affiliateLink = this.configManager.getAffiliateLink();
      if (affiliateLink && affiliateLink.trim()) {
        // Usar link do configManager se estiver configurado
        message += `${affiliateLink}`;
      } else if (signal.href && signal.href.trim()) {
        // Se não houver link no configManager, usar o link do site
        message += `${signal.href}`;
      }
      // Se não houver nenhum link, não adiciona nada

      messages.push(message);
    });

    // Retornar todas as mensagens (uma por jogo)
    return messages.length === 1 ? messages[0] : messages.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
  }

  hasNewSignals(currentSignals) {
    if (!currentSignals || currentSignals.length === 0) {
      return false;
    }

    // Obter categoria principal do env (normalizar para remover "_GAMES" se presente)
    let mainCategory = (process.env.MAIN_CATEGORY || 'PG').toUpperCase().replace('_GAMES', '');
    const categoryMap = {
      'PG': { platform: 'PG GAMES', types: ['pg-game', 'pg-game-text', 'pg-game-context', 'pg-game-alt'] },
      'PP': { platform: 'PP GAMES', types: ['pp-game', 'pp-game-text', 'pp-game-context', 'pp-game-alt'] },
      'WG': { platform: 'WG GAMES', types: ['wg-game', 'wg-game-text', 'wg-game-context', 'wg-game-alt'] }
    };
    const categoryInfo = categoryMap[mainCategory] || categoryMap['PG'];

    if (this.lastSignals.length === 0) {
      // Filtrar apenas categoria principal
      const categorySignals = currentSignals.filter(s =>
        (s.platform && s.platform.toUpperCase().includes(categoryInfo.platform)) ||
        categoryInfo.types.includes(s.type)
      );
      return categorySignals.length > 0;
    }

    // Filtrar apenas sinais da categoria principal
    const currentCategory = currentSignals.filter(s =>
      (s.platform && s.platform.toUpperCase().includes(categoryInfo.platform)) ||
      categoryInfo.types.includes(s.type)
    );

    const lastCategory = this.lastSignals.filter(s =>
      (s.platform && s.platform.toUpperCase().includes(categoryInfo.platform)) ||
      categoryInfo.types.includes(s.type)
    );

    // Se não há sinais atuais, não há novos sinais
    if (currentCategory.length === 0) {
      return false;
    }

    // Se há mais sinais atuais do que anteriores, há novos sinais
    if (currentCategory.length > lastCategory.length) {
      return true;
    }

    // Comparar usando gameName + gameId + distribuicao para melhor comparação
    const currentKeys = currentCategory.map(s => {
      const key = `${s.gameName || s.title || 'unknown'}-${s.gameId || ''}-${s.distribuicao || ''}-${(s.text || '').substring(0, 50)}`;
      return key;
    }).sort().join('|');

    const lastKeys = lastCategory.map(s => {
      const key = `${s.gameName || s.title || 'unknown'}-${s.gameId || ''}-${s.distribuicao || ''}-${(s.text || '').substring(0, 50)}`;
      return key;
    }).sort().join('|');

    // Se as chaves são diferentes, há novos sinais
    if (currentKeys !== lastKeys) {
      return true;
    }

    // Fallback: Se passou muito tempo desde o último envio, considerar como novos sinais
    // Isso garante que o bot não pare de enviar sinais
    if (this.lastSignalSentTime) {
      const timeSinceLast = Date.now() - this.lastSignalSentTime.getTime();
      if (timeSinceLast > 600000) { // Mais de 10 minutos
        console.log('🔄 Considerando sinais como novos devido ao tempo decorrido desde último envio.');
        return true;
      }
    }

    return false;
  }

  getFavoriteGames(category = 'PG') {
    // Normalizar categoria (remover "_GAMES" se presente)
    category = category.toUpperCase().replace('_GAMES', '');

    // Obter lista de jogos favoritos do .env baseado na categoria
    let envVar = '';
    if (category === 'PG') {
      envVar = process.env.PG_GAMES_FAVORITES || '';
    } else if (category === 'PP') {
      envVar = process.env.PP_GAMES_FAVORITES || '';
    } else if (category === 'WG') {
      envVar = process.env.WG_GAMES_FAVORITES || '';
    }

    if (!envVar) {
      return []; // Se não houver favoritos configurados, retorna vazio
    }
    return envVar.split(',').map(game => game.trim()).filter(game => game);
  }

  // Busca simples de jogos favoritos
  isFavoriteGame(gameName, favoriteGames) {
    if (!gameName || favoriteGames.length === 0) return false;

    // Normalizar: remover espaços extras e converter para minúsculas
    const normalize = (str) => {
      if (!str) return '';
      return str.toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' '); // Normalizar espaços múltiplos
    };

    const normalizedGameName = normalize(gameName);

    // Verificar cada jogo favorito
    for (const favorite of favoriteGames) {
      if (!favorite) continue;
      
      const normalizedFavorite = normalize(favorite);

      // Comparação exata primeiro (mais precisa e confiável)
      if (normalizedGameName === normalizedFavorite) {
        return true;
      }

      // Comparação por palavras: se todas as palavras do favorito estão no nome do jogo
      const favoriteWords = normalizedFavorite.split(' ').filter(w => w.length > 2);
      const gameWords = normalizedGameName.split(' ');
      
      if (favoriteWords.length > 0) {
        // Verificar se todas as palavras do favorito estão no nome do jogo
        const allWordsMatch = favoriteWords.every(word => gameWords.some(gw => gw.includes(word) || word.includes(gw)));
        if (allWordsMatch) {
          return true;
        }
      }

      // Fallback: busca com includes (bidirecional) - mais permissivo
      // Mas apenas se o favorito tiver pelo menos 3 caracteres para evitar matches falsos
      if (normalizedFavorite.length >= 3) {
        if (normalizedGameName.includes(normalizedFavorite) || normalizedFavorite.includes(normalizedGameName)) {
          // Verificar se não é apenas uma palavra muito curta
          if (normalizedFavorite.split(' ').length > 1 || normalizedGameName.split(' ').length > 1) {
            return true;
          }
        }
      }
    }

    return false;
  }

  getNextUpdateTime() {
    // Calcular próximo horário de atualização (a cada 5 minutos, no minuto 0)
    const now = new Date();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();

    // Calcular minutos até o próximo múltiplo de 5
    const minutesUntilNext = 5 - (currentMinutes % 5);
    const nextUpdate = new Date(now);

    if (minutesUntilNext === 5 && currentSeconds === 0) {
      // Já está no minuto certo
      return now;
    }

    nextUpdate.setMinutes(currentMinutes + minutesUntilNext);
    nextUpdate.setSeconds(0);
    nextUpdate.setMilliseconds(0);

    return nextUpdate;
  }

  async waitUntilNextUpdate() {
    const nextUpdate = this.getNextUpdateTime();
    const now = new Date();
    const waitMs = nextUpdate.getTime() - now.getTime();

    if (waitMs > 0) {
      const waitMinutes = Math.floor(waitMs / 60000);
      const waitSeconds = Math.floor((waitMs % 60000) / 1000);
      // Log removido para reduzir verbosidade
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  async processSignals(keepBrowserOpen = false, skipWaitForUpdate = false) {
    try {
      // Verificar se WhatsApp está pronto antes de buscar sinais
      if (!this.whatsapp.isReady) {
        console.log('⚠️ WhatsApp não está conectado. Pulando busca de sinais...');
        return;
      }

      // Se não tem startTime, definir agora (primeira execução)
      if (!this.startTime) {
        this.startTime = new Date();
      }

      // Verificar se o bot está rodando
      if (!this.configManager.isBotRunning()) {
        // Não logar para evitar spam - apenas retornar silenciosamente
        return;
      }

      // Obter categoria principal do env (normalizar para remover "_GAMES" se presente)
      const mainCategory = (process.env.MAIN_CATEGORY || 'PG').toUpperCase().replace('_GAMES', '');
      const categoryMap = {
        'PG': 'PG GAMES',
        'PP': 'PP GAMES',
        'WG': 'WG GAMES'
      };
      const categoryName = categoryMap[mainCategory] || 'PG GAMES';

      // Limpar cache de sinais enviados antes de buscar novos valores do site
      // Isso garante que sempre busca valores atualizados e não usa cache
      this.sentSignals.clear();

      // Determinar se deve enviar favoritos ou aleatórios
      // Na primeira execução, sempre começar com favoritos
      const isFirstRun = this.lastSignals.length === 0;
      if (isFirstRun) {
        this.configManager.setCurrentRotation('FAVORITES');
      }

      const isFavoritesMode = this.configManager.isFavoritesMode();
      const isRandomMode = this.configManager.isRandomMode();

      // Criar callback para enviar sinais imediatamente quando encontrados (apenas em modo favoritos)
      const sendSignalImmediately = async (signal) => {
        try {
          // Gerar chave única baseada em TODOS os valores do sinal do site
          // Se distribuição, apostas ou qualquer valor mudar, a chave será diferente e será enviado
          const signalKey = `${signal.gameName || 'unknown'}-${signal.gameId || ''}-${signal.distribuicao || ''}-${signal.betMin || ''}-${signal.betDefault || ''}-${signal.betMax || ''}`;

          // Verificar se já foi enviado com EXATAMENTE os mesmos valores
          // Se os valores mudaram no site, a chave será diferente e será enviado
          if (this.sentSignals.has(signalKey)) {
            return;
          }

          // Verificar se WhatsApp está pronto
          if (!this.whatsapp || !this.whatsapp.isReady) {
            // Aguardar um pouco e tentar novamente (delay mínimo para envio mais rápido)
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!this.whatsapp || !this.whatsapp.isReady) {
              return;
            }
          }

          const whatsappMessage = this.formatSignalMessage([signal]);
          const telegramMessage = this.formatTelegramMessage([signal]);
          const imageUrl = signal.imageUrl || null;

          const gameName = signal.gameName || 'Jogo desconhecido';
          
          // Enviar para WhatsApp
          let sentToWhatsApp = false;
          let whatsappError = null;
          if (process.env.WHATSAPP_GROUP_ID && this.whatsapp && this.whatsapp.isReady) {
            const groupIds = process.env.WHATSAPP_GROUP_ID.split(',').map(id => id.trim()).filter(id => id);
            for (const groupId of groupIds) {
              if (groupId) {
                try {
                  const sent = await this.whatsapp.sendToGroup(groupId, whatsappMessage, imageUrl);
                  if (sent) {
                    sentToWhatsApp = true;
                  } else {
                    whatsappError = `Falha ao enviar para grupo ${groupId}`;
                  }
                } catch (error) {
                  whatsappError = `Erro ao enviar para grupo ${groupId}: ${error.message}`;
                }
              }
            }
          } else {
            if (!process.env.WHATSAPP_GROUP_ID) {
              whatsappError = 'WHATSAPP_GROUP_ID não configurado';
            } else if (!this.whatsapp) {
              whatsappError = 'WhatsApp não inicializado';
            } else if (!this.whatsapp.isReady) {
              whatsappError = 'WhatsApp não está conectado';
            }
          }

          // Enviar para Telegram
          let sentToTelegram = false;
          let telegramError = null;
          if (this.telegram && this.telegram.isReady && process.env.TELEGRAM_CHAT_ID) {
            const chatIds = process.env.TELEGRAM_CHAT_ID.split(',').map(id => id.trim()).filter(id => id);
            for (const chatId of chatIds) {
              if (chatId) {
                try {
                  const sent = await this.telegram.sendMessage(chatId, telegramMessage, imageUrl);
                  if (sent) {
                    sentToTelegram = true;
                  } else {
                    telegramError = `Falha ao enviar para chat ${chatId}`;
                  }
                } catch (error) {
                  telegramError = `Erro ao enviar para chat ${chatId}: ${error.message}`;
                }
              }
            }
          } else {
            if (!process.env.TELEGRAM_CHAT_ID) {
              telegramError = 'TELEGRAM_CHAT_ID não configurado';
            } else if (!this.telegram) {
              telegramError = 'Telegram não inicializado';
            } else if (!this.telegram.isReady) {
              telegramError = 'Telegram não está conectado';
            }
          }

          // Se foi enviado com sucesso (pelo menos para um canal), marcar como enviado
          if (sentToWhatsApp || sentToTelegram) {
            this.sentSignals.add(signalKey);
          } else {
            // Logar detalhes da falha
            console.error(`❌ Falha ao enviar jogo "${gameName}":`);
            if (whatsappError) {
              console.error(`   WhatsApp: ${whatsappError}`);
            }
            if (telegramError) {
              console.error(`   Telegram: ${telegramError}`);
            }
            if (!whatsappError && !telegramError) {
              console.error(`   Nenhum canal configurado ou disponível`);
            }
          }
        } catch (error) {
          const gameName = signal?.gameName || 'Jogo desconhecido';
          console.error(`❌ Erro ao enviar sinal imediatamente para "${gameName}": ${error.message}`);
          console.error(`   Stack: ${error.stack}`);
        }
      };

      // Buscar sinais baseado no modo atual
      let signalsToProcess = [];
      let categorySignals = [];
      const favoriteGamesList = this.getFavoriteGames(mainCategory);

      if (isFavoritesMode) {
        // Modo FAVORITOS: buscar apenas jogos favoritos
        console.log(`⭐ Modo FAVORITOS: Buscando ${favoriteGamesList.length} jogos favoritos...`);
        console.log(`   Favoritos: ${favoriteGamesList.join(', ')}`);
        
        const favoriteGamesForSearch = favoriteGamesList.length > 0 ? favoriteGamesList : null;

        // Configurar callback para envio imediato
        this.scraper.onGameFoundCallback = favoriteGamesForSearch ? sendSignalImmediately : null;

        const signals = await this.scraper.scrape(false, favoriteGamesForSearch, mainCategory, keepBrowserOpen, skipWaitForUpdate);

        // Limpar callback após busca
        this.scraper.onGameFoundCallback = null;

        // Filtrar para garantir que apenas favoritos estão incluídos
        categorySignals = signals.filter(signal => {
          const gameName = signal.gameName || signal.title || '';
          return this.isFavoriteGame(gameName, favoriteGamesList);
        });

        console.log(`✅ Modo FAVORITOS concluído:`);
        console.log(`   - Total de favoritos configurados: ${favoriteGamesList.length}`);
        console.log(`   - Favoritos encontrados e enviados: ${categorySignals.length}`);
        
        if (categorySignals.length < favoriteGamesList.length) {
          const foundNames = categorySignals.map(s => s.gameName || s.title || '').filter(n => n);
          const missing = favoriteGamesList.filter(fav => !foundNames.some(found => 
            found.toLowerCase().includes(fav.toLowerCase()) || fav.toLowerCase().includes(found.toLowerCase())
          ));
          if (missing.length > 0) {
            console.log(`   ⚠️ Favoritos não encontrados: ${missing.join(', ')}`);
          }
        }

        // No modo FAVORITOS, os sinais já foram enviados via callback
        // Não precisamos processar novamente no loop principal
        signalsToProcess = []; // Vazio porque já foram enviados via callback

        // Atualizar últimos sinais para comparação futura
        this.lastSignals = categorySignals;
        this.lastSignalSentTime = new Date(); // Atualizar timestamp do último envio
        this.consecutiveNoSignalsCount = 0; // Resetar contador

        // Alternar modo para próxima vez (próximo será ALEATÓRIOS)
        this.configManager.toggleRotation();
        console.log(`🔄 Próximo modo: ALEATÓRIOS (sem incluir favoritos)`);

        // Retornar aqui, pois os favoritos já foram enviados via callback
        return;
      } else if (isRandomMode) {
        // Modo ALEATÓRIOS: buscar todos os jogos PG, remover favoritos, filtrar distribuição > 80%, pegar 5 aleatórios
        console.log(`🎲 Modo ALEATÓRIOS: Buscando jogos (excluindo ${favoriteGamesList.length} favoritos)...`);
        
        // Buscar TODOS os jogos da categoria (sem filtro de favoritos)
        this.scraper.onGameFoundCallback = null;
        const allSignals = await this.scraper.scrape(false, null, mainCategory, keepBrowserOpen, skipWaitForUpdate);

        console.log(`📊 Total de jogos encontrados: ${allSignals.length}`);

        // Filtrar para remover favoritos E apenas jogos com distribuição > 80%
        let favoriteCount = 0;
        let lowDistributionCount = 0;
        const excludedFavorites = []; // Lista de favoritos que foram excluídos
        
        const nonFavoriteSignals = allSignals.filter(signal => {
          const gameName = signal.gameName || signal.title || '';
          const isFavorite = this.isFavoriteGame(gameName, favoriteGamesList);

          if (isFavorite) {
            favoriteCount++;
            excludedFavorites.push(gameName);
            console.log(`   🚫 Excluindo favorito: "${gameName}"`);
            return false; // Excluir favoritos
          }

          // Obter distribuição (pode estar em distribuicao ou possibilidadesGanhos)
          const distribuicao = signal.distribuicao || signal.possibilidadesGanhos || 0;
          // Converter para número (pode vir como string "94" ou "94%")
          const distribuicaoNum = typeof distribuicao === 'string'
            ? parseFloat(distribuicao.replace('%', '').replace(',', '.'))
            : parseFloat(distribuicao);

          // Deve ter distribuição > 80%
          if (distribuicaoNum <= 80) {
            lowDistributionCount++;
            return false;
          }

          return true; // Incluir: não é favorito E tem distribuição > 80%
        });

        console.log(`📊 Filtros aplicados:`);
        console.log(`   - Favoritos excluídos: ${favoriteCount}`);
        if (excludedFavorites.length > 0) {
          console.log(`   - Lista de favoritos excluídos: ${excludedFavorites.join(', ')}`);
        }
        console.log(`   - Jogos com distribuição ≤ 80% excluídos: ${lowDistributionCount}`);
        console.log(`   - Jogos disponíveis para aleatórios: ${nonFavoriteSignals.length}`);

        // Pegar 5 aleatórios
        if (nonFavoriteSignals.length > 0) {
          // Embaralhar e pegar os primeiros 5
          const shuffled = nonFavoriteSignals.sort(() => Math.random() - 0.5);
          categorySignals = shuffled.slice(0, 5);
          
          // VERIFICAÇÃO FINAL: Garantir que nenhum favorito está na lista final
          const finalFiltered = categorySignals.filter(signal => {
            const gameName = signal.gameName || signal.title || '';
            const isFavorite = this.isFavoriteGame(gameName, favoriteGamesList);
            if (isFavorite) {
              console.error(`❌ ERRO: Favorito "${gameName}" encontrado na lista de aleatórios! Removendo...`);
            }
            return !isFavorite; // Excluir se for favorito
          });
          
          // Se algum favorito foi removido, pegar mais jogos para completar os 5
          if (finalFiltered.length < 5 && nonFavoriteSignals.length > finalFiltered.length) {
            const remaining = nonFavoriteSignals.filter(signal => {
              const gameName = signal.gameName || signal.title || '';
              return !finalFiltered.some(f => (f.gameName || f.title || '') === gameName) &&
                     !this.isFavoriteGame(gameName, favoriteGamesList);
            });
            finalFiltered.push(...remaining.slice(0, 5 - finalFiltered.length));
          }
          
          categorySignals = finalFiltered;
          signalsToProcess = categorySignals;
          
          // Verificação final e log
          const anyFavorites = categorySignals.some(signal => {
            const gameName = signal.gameName || signal.title || '';
            return this.isFavoriteGame(gameName, favoriteGamesList);
          });
          
          if (anyFavorites) {
            console.error(`❌ ERRO CRÍTICO: Ainda há favoritos na lista final de aleatórios!`);
            // Remover todos os favoritos da lista final
            categorySignals = categorySignals.filter(signal => {
              const gameName = signal.gameName || signal.title || '';
              return !this.isFavoriteGame(gameName, favoriteGamesList);
            });
            signalsToProcess = categorySignals;
          }
          
          console.log(`✅ ${categorySignals.length} jogos aleatórios selecionados (GARANTIDO: sem favoritos):`);
          categorySignals.forEach((signal, idx) => {
            const gameName = signal.gameName || signal.title || 'Desconhecido';
            const dist = signal.distribuicao || signal.possibilidadesGanhos || 'N/A';
            const isFav = this.isFavoriteGame(gameName, favoriteGamesList);
            console.log(`   ${idx + 1}. ${gameName} (${dist}%) ${isFav ? '❌ É FAVORITO!' : '✓'}`);
          });
          
          // Log dos favoritos para referência
          console.log(`📋 Favoritos que foram EXCLUÍDOS dos aleatórios: ${favoriteGamesList.join(', ')}`);
        } else {
          signalsToProcess = [];
          categorySignals = [];
          console.log(`⚠️ Nenhum jogo disponível para aleatórios (todos são favoritos ou têm distribuição ≤ 80%)`);
        }
      }

      // Verificar se encontrou sinais (apenas para modo ALEATÓRIOS, pois FAVORITOS já retornou acima)
      if (isRandomMode) {
        // No modo ALEATÓRIOS, processar os sinais no loop principal
        if (signalsToProcess.length === 0 || categorySignals.length === 0) {
          this.consecutiveNoSignalsCount++;

          // Se não encontrou sinais várias vezes, tentar buscar favoritos como fallback
          if (this.consecutiveNoSignalsCount >= 2) {
            this.configManager.setCurrentRotation('FAVORITES');
          } else {
            // Alternar modo para próxima vez
            this.configManager.toggleRotation();
          }
          return;
        }
      }

      // Se é a primeira vez (não há sinais anteriores), enviar apenas os encontrados (já filtrados)
      const isFirstExecution = this.lastSignals.length === 0;

      // Verificar se há novos sinais ou se é a primeira execução
      // FORÇAR ENVIO se passou muito tempo desde o último envio (garantir 24/7)
      const timeSinceLastSignal = this.lastSignalSentTime ? Date.now() - this.lastSignalSentTime.getTime() : Infinity;
      const shouldForceSend = timeSinceLastSignal > 600000; // Forçar envio se passou mais de 10 minutos

      const hasNewSignalsDetected = this.hasNewSignals(signalsToProcess);

      if (isFirstExecution || hasNewSignalsDetected || shouldForceSend) {
        this.consecutiveNoSignalsCount = 0; // Resetar contador

        // Formatar mensagens (já filtra categoria internamente)
        // Enviar cada sinal individualmente com sua imagem
        // No modo ALEATÓRIOS, usar signalsToProcess (que contém os 5 aleatórios)
        const signalsToSend = isRandomMode ? signalsToProcess : categorySignals;

        // Enviar apenas sinais com valores NOVOS do site (não repetir sinais idênticos)
        // A chave inclui: nome, ID, distribuição e todas as apostas
        // Se qualquer valor mudou no site, a chave será diferente e o sinal será enviado
        for (const signal of signalsToSend) {
          // Gerar chave única baseada em TODOS os valores do sinal do site
          // Se distribuição, apostas ou qualquer valor mudar, a chave será diferente
          const signalKey = `${signal.gameName || 'unknown'}-${signal.gameId || ''}-${signal.distribuicao || ''}-${signal.betMin || ''}-${signal.betDefault || ''}-${signal.betMax || ''}`;

          // Verificar se já foi enviado com EXATAMENTE os mesmos valores
          // Se os valores mudaram no site, a chave será diferente e será enviado
          if (this.sentSignals.has(signalKey)) {
            continue;
          }

          const whatsappMessage = this.formatSignalMessage([signal]);
          const telegramMessage = this.formatTelegramMessage([signal]);
          const imageUrl = signal.imageUrl || null;

          const gameName = signal.gameName || 'Jogo desconhecido';
          
          // Enviar APENAS para grupos do WhatsApp (WHATSAPP_GROUP_ID)
          // NÃO enviar para chats privados
          let sentToWhatsApp = false;
          let whatsappError = null;
          if (process.env.WHATSAPP_GROUP_ID && this.whatsapp && this.whatsapp.isReady) {
            const groupIds = process.env.WHATSAPP_GROUP_ID.split(',').map(id => id.trim()).filter(id => id);
            for (const groupId of groupIds) {
              if (groupId) {
                try {
                  const sent = await this.whatsapp.sendToGroup(groupId, whatsappMessage, imageUrl);
                  if (sent) {
                    sentToWhatsApp = true;
                  } else {
                    whatsappError = `Falha ao enviar para grupo ${groupId}`;
                  }
                } catch (error) {
                  whatsappError = `Erro ao enviar para grupo ${groupId}: ${error.message}`;
                }
              }
            }
          } else {
            if (!process.env.WHATSAPP_GROUP_ID) {
              whatsappError = 'WHATSAPP_GROUP_ID não configurado';
            } else if (!this.whatsapp) {
              whatsappError = 'WhatsApp não inicializado';
            } else if (!this.whatsapp.isReady) {
              whatsappError = 'WhatsApp não está conectado';
            }
          }

          // Enviar APENAS para grupos/canais do Telegram (TELEGRAM_CHAT_ID)
          // NÃO enviar para chats privados
          let sentToTelegram = false;
          let telegramError = null;
          if (this.telegram && this.telegram.isReady && process.env.TELEGRAM_CHAT_ID) {
            const chatIds = process.env.TELEGRAM_CHAT_ID.split(',').map(id => id.trim()).filter(id => id);
            for (const chatId of chatIds) {
              if (chatId) {
                try {
                  const sent = await this.telegram.sendMessage(chatId, telegramMessage, imageUrl);
                  if (sent) {
                    sentToTelegram = true;
                  } else {
                    telegramError = `Falha ao enviar para chat ${chatId}`;
                  }
                } catch (error) {
                  telegramError = `Erro ao enviar para chat ${chatId}: ${error.message}`;
                }
              }
            }
          } else {
            if (!process.env.TELEGRAM_CHAT_ID) {
              telegramError = 'TELEGRAM_CHAT_ID não configurado';
            } else if (!this.telegram) {
              telegramError = 'Telegram não inicializado';
            } else if (!this.telegram.isReady) {
              telegramError = 'Telegram não está conectado';
            }
          }

          // Se foi enviado com sucesso (pelo menos para um canal), marcar como enviado
          if (sentToWhatsApp || sentToTelegram) {
            this.sentSignals.add(signalKey);
            // Logar sucesso
            const channels = [];
            if (sentToWhatsApp) channels.push('WhatsApp');
            if (sentToTelegram) channels.push('Telegram');
            console.log(`✅ Sucesso ao enviar jogo "${gameName}" para: ${channels.join(' e ')}`);
          } else {
            // Logar detalhes da falha
            console.error(`❌ Falha ao enviar jogo "${gameName}":`);
            if (whatsappError) {
              console.error(`   WhatsApp: ${whatsappError}`);
            }
            if (telegramError) {
              console.error(`   Telegram: ${telegramError}`);
            }
            if (!whatsappError && !telegramError) {
              console.error(`   Nenhum canal configurado ou disponível`);
            }
          }
        }

        // Atualizar últimos sinais (salvar todos para comparação futura)
        // Usar signalsToProcess que contém todos os sinais encontrados
        this.lastSignals = signalsToProcess;
        this.lastSignalSentTime = new Date(); // Atualizar timestamp do último envio
        this.consecutiveNoSignalsCount = 0; // Resetar contador

        // Cache já foi limpo no início do processSignals
        // Os valores foram buscados diretamente do site, garantindo que são atualizados

        // Alternar modo para próxima vez (favoritos <-> aleatórios)
        this.configManager.toggleRotation();
      } else {
        this.consecutiveNoSignalsCount++;

        // Se passou muito tempo sem enviar sinais, forçar envio no próximo ciclo
        if (this.consecutiveNoSignalsCount >= 3) {
          // Limpar histórico de sinais enviados parcialmente para permitir reenvio
          if (this.sentSignals.size > 50) {
            const signalsArray = Array.from(this.sentSignals);
            this.sentSignals = new Set(signalsArray.slice(-50)); // Reduzir histórico
          }
        }

        // Alternar modo mesmo se não houver novos sinais
        this.configManager.toggleRotation();
      }

    } catch (error) {
      console.error('❌ Erro ao processar sinais:', error);
      console.error('Stack:', error.stack);

      // Se houver erro, tentar recuperação automática após um tempo
      if (!this.isRecovering) {
        setTimeout(() => {
          if (this.configManager.isBotRunning()) {
            this.attemptAutoRecovery().catch(recoveryError => {
              console.error(`❌ Erro na recuperação: ${recoveryError.message}`);
            });
          }
        }, 10000); // Aguardar 10 segundos antes de tentar recuperação
      }
    } finally {
      // Não fechar o navegador aqui - deixar aberto para monitoramento contínuo
      // O navegador só será fechado quando o bot for desligado
      this.isProcessingSignals = false; // Sempre liberar flag ao finalizar
    }
  }

  start(intervalMinutes = 5, syncWithSite = true) {
    // Verificar se WhatsApp está pronto antes de iniciar
    if (!this.whatsapp.isReady) {
      console.log('⏳ Aguardando WhatsApp conectar antes de iniciar busca de sinais...');
      // Aguardar e tentar novamente
      setTimeout(() => {
        if (this.whatsapp.isReady) {
          this.start(intervalMinutes, syncWithSite);
        } else {
          console.log('❌ WhatsApp não está conectado. Não é possível iniciar busca de sinais.');
        }
      }, 5000);
      return;
    }

    console.log(`⏰ Bot configurado para verificar sinais a cada ${intervalMinutes} minuto(s)`);

    if (syncWithSite) {
      console.log('🔄 Sincronizando com horários de atualização do site (a cada 5 minutos, no minuto 0)\n');
      this.startSynced();
    } else {
      console.log('\n');
      // Processar imediatamente ao iniciar
      console.log('🚀 Processando sinais iniciais...');
      this.processSignals();

      // Configurar intervalo
      const intervalMs = intervalMinutes * 60 * 1000;
      this.interval = setInterval(() => {
        // Verificar se WhatsApp ainda está pronto antes de processar
        if (this.whatsapp.isReady) {
          this.processSignals();
        } else {
          console.log('⚠️ WhatsApp desconectado. Pulando verificação de sinais...');
        }
      }, intervalMs);
    }
  }

  async startSynced() {
    // Verificar se WhatsApp está pronto
    if (!this.whatsapp.isReady) {
      console.log('⏳ Aguardando WhatsApp conectar...');
      await this.waitForWhatsAppReady();
    }

    // Armazenar horário de início do bot
    if (!this.startTime) {
      this.startTime = new Date();
      console.log(`⏰ Horário de início: ${this.startTime.toLocaleTimeString()}`);
    }

    // Iniciar monitoramento contínuo do card de status PRIMEIRO (inicializa navegador em background)
    // Isso permite que o navegador comece a inicializar enquanto aguardamos o horário correto
    this.startStatusMonitoring();

    // NÃO processar sinais imediatamente - aguardar o horário correto (minutos 0 ou 5)
    // O monitoramento de status já cuida de processar nos horários corretos

    // Iniciar sistema de envio periódico forçado (garantir 24/7)
    this.startForcedSendInterval();

    // Iniciar sistema de health check e auto-recuperação
    this.startHealthCheck();
  }

  startHealthCheck() {
    // Verificar saúde do sistema a cada 2 minutos
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.lastHealthCheck = new Date();

    this.healthCheckInterval = setInterval(async () => {
      try {
        const now = new Date();
        this.lastHealthCheck = now;

        // Verificar se o bot está configurado para rodar
        if (!this.configManager.isBotRunning()) {
          return; // Bot está pausado intencionalmente
        }

        // Verificar se o monitoramento de status está ativo
        if (!this.statusMonitorInterval) {
          console.log('⚠️ Health Check: Monitoramento parou! Reiniciando...');
          this.startStatusMonitoring();
        }

        // Verificar se o watchdog está ativo
        if (!this.watchdogInterval) {
          this.startWatchdog();
        }

        // Verificar se o sistema de envio forçado está ativo
        if (!this.forceSendInterval) {
          this.startForcedSendInterval();
        }

        // Verificar se passou muito tempo sem enviar sinais (mais de 20 minutos)
        const timeSinceLastSignal = this.lastSignalSentTime ? Date.now() - this.lastSignalSentTime.getTime() : Infinity;
        if (timeSinceLastSignal > 1200000) { // 20 minutos
          console.log(`⚠️ Health Check: Último sinal há ${Math.floor(timeSinceLastSignal / 60000)}min. Recuperando...`);
          await this.attemptAutoRecovery();
        }

        // Verificar se WhatsApp está conectado (só logar se for problema crítico)
        if (!this.whatsapp.isReady) {
          // Não logar sempre - apenas quando for realmente necessário
        }

        // Verificar se o navegador está aberto
        if (!this.scraper.browser || !this.scraper.page || this.scraper.page.isClosed()) {
          // Não logar sempre - apenas marcar para reinicialização
          this.isInitializingBrowser = false;
          this.lastInitAttempt = 0;
        }

        // Log de saúde apenas a cada 1 hora (reduzido de 30 minutos)
        const uptime = this.startTime ? Math.floor((Date.now() - this.startTime.getTime()) / 60000) : 0;
        if (uptime > 0 && uptime % 60 === 0 && uptime > 0) {
          console.log(`✅ Sistema OK há ${uptime} minutos`);
        }

      } catch (healthError) {
        console.error(`❌ Erro no health check: ${healthError.message}`);
        // Continuar mesmo com erro
      }
    }, 120000); // Verificar a cada 2 minutos

    // Remover log inicial para reduzir verbosidade
  }

  async attemptAutoRecovery() {
    // Evitar múltiplas recuperações simultâneas
    if (this.isRecovering) {
      console.log('ℹ️ Recuperação já em andamento. Aguardando...');
      return;
    }

    this.isRecovering = true;
    this.recoveryAttempts++;

    // Reduzir log de recuperação (só logar se for tentativa > 2)
    if (this.recoveryAttempts > 2) {
      console.log(`🔄 Recuperação automática (tentativa ${this.recoveryAttempts})...`);
    }

    try {
      // 1. Verificar e reinicializar navegador se necessário
      if (!this.scraper.browser || !this.scraper.page || this.scraper.page.isClosed()) {
        try {
          if (this.scraper.browser) {
            await this.scraper.close();
          }
        } catch (closeError) {
          // Ignorar erros ao fechar
        }

        this.isInitializingBrowser = false;
        this.lastInitAttempt = 0;

        // Reinicializar navegador
        await this.scraper.init();
        await this.scraper.navigateToSite();
        await this.scraper.acceptPopups();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // 2. Verificar e reiniciar monitoramento se necessário
      if (!this.statusMonitorInterval) {
        this.startStatusMonitoring();
      }

      // 3. Verificar e reiniciar watchdog se necessário
      if (!this.watchdogInterval) {
        this.startWatchdog();
      }

      // 4. Verificar e reiniciar sistema de envio forçado se necessário
      if (!this.forceSendInterval) {
        this.startForcedSendInterval();
      }

      // 5. Tentar forçar processamento de sinais
      if (this.whatsapp.isReady && this.configManager.isBotRunning()) {
        await this.processSignals(true, true);
      }

      // 6. Resetar contadores
      this.consecutiveNoSignalsCount = 0;
      this.recoveryAttempts = 0; // Resetar após sucesso

      // Só logar se for tentativa > 2 para reduzir verbosidade
      if (this.recoveryAttempts > 2) {
        console.log('✅ Recuperação concluída');
      }

    } catch (recoveryError) {
      console.error(`❌ Erro durante recuperação automática: ${recoveryError.message}`);
      console.error('Stack:', recoveryError.stack);

      // Se muitas tentativas de recuperação falharam, tentar reinicialização completa
      if (this.recoveryAttempts >= 5) {
        console.log('⚠️ Muitas tentativas de recuperação falharam. Tentando reinicialização completa...');
        await this.fullRestart();
      }
    } finally {
      this.isRecovering = false;
    }
  }

  async fullRestart() {
    console.log('🔄 Iniciando reinicialização completa do sistema...');

    try {
      // Parar todos os intervalos
      if (this.statusMonitorInterval) {
        clearInterval(this.statusMonitorInterval);
        this.statusMonitorInterval = null;
      }

      if (this.watchdogInterval) {
        clearInterval(this.watchdogInterval);
        this.watchdogInterval = null;
      }

      if (this.forceSendInterval) {
        clearInterval(this.forceSendInterval);
        this.forceSendInterval = null;
      }

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Fechar navegador
      if (this.scraper.browser) {
        try {
          await this.scraper.close();
        } catch (closeError) {
          // Ignorar erros
        }
      }

      // Resetar flags
      this.isInitializingBrowser = false;
      this.lastInitAttempt = 0;
      this.isProcessingSignals = false;
      this.recoveryAttempts = 0;

      // Aguardar um pouco antes de reinicializar
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Reinicializar tudo
      console.log('🔄 Reinicializando componentes...');

      // Reinicializar navegador
      await this.scraper.init();
      await this.scraper.navigateToSite();
      await this.scraper.acceptPopups();
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Reiniciar monitoramento
      this.startStatusMonitoring();

      // Reiniciar watchdog
      this.startWatchdog();

      // Reiniciar sistema de envio forçado
      this.startForcedSendInterval();

      // Reiniciar health check
      this.startHealthCheck();

      console.log('✅ Reinicialização completa concluída! Sistema funcionando novamente.');

    } catch (restartError) {
      console.error(`❌ Erro durante reinicialização completa: ${restartError.message}`);
      // Tentar novamente após 30 segundos
      setTimeout(() => {
        this.fullRestart();
      }, 30000);
    }
  }

  startForcedSendInterval() {
    // Forçar envio de sinais a cada 15 minutos, mesmo sem detectar atualização
    // Isso garante que o bot nunca pare completamente de enviar sinais
    if (this.forceSendInterval) {
      clearInterval(this.forceSendInterval);
    }

    this.forceSendInterval = setInterval(async () => {
      // Verificar se o bot está rodando
      if (!this.configManager.isBotRunning()) {
        return; // Bot está pausado
      }

      // Verificar se WhatsApp está pronto
      if (!this.whatsapp.isReady) {
        return;
      }

      // Verificar se passou tempo suficiente desde o último envio
      const timeSinceLastSignal = this.lastSignalSentTime ? Date.now() - this.lastSignalSentTime.getTime() : Infinity;

      if (timeSinceLastSignal > 900000) { // Mais de 15 minutos sem enviar
        try {
          // Forçar processamento de sinais (sem log excessivo)
          await this.processSignals(true, true);
        } catch (error) {
          console.error(`❌ Erro no envio forçado: ${error.message}`);
          // Continuar mesmo com erro - não parar o sistema
        }
      }
    }, 900000); // Verificar a cada 15 minutos
  }

  async startStatusMonitoring() {
    // Se já está monitorando, não iniciar novamente
    if (this.statusMonitorInterval) {
      console.log('ℹ️ Monitoramento já está ativo. Não é necessário reiniciar.');
      return;
    }

    console.log('🔄 Iniciando monitoramento baseado APENAS no horário de Brasília (verificando a cada 500ms)...');
    console.log('⏰ Enviando sinais nos minutos que terminam em 0 ou 5 (00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55)...');
    console.log('🛡️ Sistema configurado para funcionar 24/7 sem interrupções!');
    console.log('⚡ Envio de sinais será IMEDIATO quando o minuto terminar em 0 ou 5 (sem verificar site)!');

    // Detectar horários de atualização baseado APENAS no horário de Brasília (minutos 0 e 5)
    let lastMinuteChecked = -1;

    // Monitorar continuamente com verificação mais frequente
    const monitorInterval = setInterval(async () => {
      // Verificar horário de Brasília
      const brasiliaTime = getBrasiliaTime();
      const currentMinute = brasiliaTime.getMinutes();
      const currentSecond = brasiliaTime.getSeconds();
      const currentHour = brasiliaTime.getHours();

      // Verificar se estamos em um minuto que termina em 0 ou 5 (horário de Brasília)
      // Minutos válidos: 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
      // Processar apenas nos primeiros 30 segundos do minuto para evitar processamento duplicado
      const isUpdateMinute = (currentMinute % 5 === 0) && currentSecond < 30;

      // Se estamos no minuto de atualização e ainda não processamos este minuto
      if (isUpdateMinute && currentMinute !== lastMinuteChecked && !this.isProcessingSignals) {
        // Marcar minuto como verificado ANTES das verificações para evitar logs repetidos
        lastMinuteChecked = currentMinute;

        // Verificar condições antes de processar
        if (!this.whatsapp.isReady) {
          return;
        }

        if (!this.configManager.isBotRunning()) {
          return;
        }

        // Processar sinais baseado APENAS no horário de Brasília
        this.startTime = brasiliaTime;
        this.isProcessingSignals = true; // Marcar como processando

        // Aguardar 8 segundos antes de buscar e enviar sinais
        // Isso garante que o site tenha atualizado completamente
        await new Promise(resolve => setTimeout(resolve, 8000));

        // Processar sinais (assíncrono para não bloquear)
        // O processSignals já cuida de favoritos/aleatórios automaticamente
        // skipWaitForUpdate=true garante que busca valores atualizados do site
        this.processSignals(true, true).then(() => {
          this.isProcessingSignals = false;
        }).catch(err => {
          console.error(`❌ Erro ao processar sinais: ${err.message}`);
          this.isProcessingSignals = false;
        });

        return; // Sair para evitar processamento duplicado
      }

      // Verificar se navegador precisa ser inicializado (apenas para garantir que está pronto)
      // Mas não bloquear o processamento baseado nisso
      if (!this.scraper.browser || !this.scraper.page) {
        // Evitar múltiplas tentativas simultâneas de inicialização
        const now = Date.now();
        const timeSinceLastAttempt = now - this.lastInitAttempt;

        // Se já está inicializando ou tentou há menos de 10 segundos, pular
        if (this.isInitializingBrowser || timeSinceLastAttempt < 10000) {
          return;
        }

        // Marcar como inicializando e registrar tentativa
        this.isInitializingBrowser = true;
        this.lastInitAttempt = now;

        // Inicializar navegador em background (não bloqueia)
        this.scraper.init().then(async () => {
          await this.scraper.navigateToSite();
          await this.scraper.acceptPopups();
          console.log('✅ Navegador inicializado com sucesso');
        }).catch(initError => {
          console.log(`⚠️ Erro ao inicializar navegador: ${initError.message}`);
        }).finally(() => {
          this.isInitializingBrowser = false;
        });
      }
    }, 500); // Verificar a cada 500ms para detecção mais rápida

    // Armazenar o intervalo para poder parar depois
    this.statusMonitorInterval = monitorInterval;

    // Adicionar watchdog para garantir que o monitoramento nunca pare
    this.startWatchdog();

    // Verificação adicional: garantir que o intervalo nunca pare
    // Se o intervalo parar por algum motivo, reiniciar automaticamente
    if (this.intervalChecker) {
      clearInterval(this.intervalChecker);
    }

    this.intervalChecker = setInterval(() => {
      // Verificar se o health check está sendo executado
      const timeSinceLastCheck = this.lastHealthCheck ? Date.now() - this.lastHealthCheck.getTime() : Infinity;

      if (timeSinceLastCheck > 300000) { // Se passou mais de 5 minutos sem health check
        // Log removido para reduzir verbosidade
        // Reiniciar componentes críticos
        if (!this.statusMonitorInterval) {
          this.startStatusMonitoring();
        }
        if (!this.healthCheckInterval) {
          this.startHealthCheck();
        }
        if (!this.watchdogInterval) {
          this.startWatchdog();
        }
      }
    }, 60000); // Verificar a cada 1 minuto
  }

  startWatchdog() {
    // Verificar a cada 3 minutos se o monitoramento ainda está ativo
    const watchdogInterval = setInterval(async () => {
      try {
        if (!this.statusMonitorInterval) {
          this.startStatusMonitoring();
        }

        // Verificar se health check está ativo
        if (!this.healthCheckInterval) {
          this.startHealthCheck();
        }

        // Verificar se o bot está configurado para rodar
        if (!this.configManager.isBotRunning()) {
          return; // Não fazer nada se estiver pausado intencionalmente
        }

        // Verificar se está enviando sinais regularmente
        const timeSinceLastSignal = this.lastSignalSentTime ? Date.now() - this.lastSignalSentTime.getTime() : Infinity;
        if (timeSinceLastSignal > 900000) { // Se passou mais de 15 minutos sem enviar
          // Tentar recuperação automática (sem log excessivo)
          if (!this.isRecovering) {
            await this.attemptAutoRecovery();
          }
        }

        // Verificar se o navegador está funcionando
        if (!this.scraper.browser || !this.scraper.page || this.scraper.page.isClosed()) {
          this.isInitializingBrowser = false;
          this.lastInitAttempt = 0;
        }

      } catch (watchdogError) {
        console.error(`❌ Erro no watchdog: ${watchdogError.message}`);
        // Continuar mesmo com erro
      }
    }, 180000); // Verificar a cada 3 minutos

    // Armazenar intervalo do watchdog
    this.watchdogInterval = watchdogInterval;
  }

  stop() {
    // Não limpar o statusMonitorInterval aqui - apenas o intervalo antigo
    // O monitoramento de status deve continuar rodando
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log('🛑 Bot parado (monitoramento continua, mas não envia sinais)');
    // Não parar o watchdog - ele deve continuar monitorando
  }

  async shutdown() {
    this.stop();

    console.log('🔒 Fechando conexões...');

    // Parar watchdog
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }

    // Parar monitoramento de status
    if (this.statusMonitorInterval) {
      clearInterval(this.statusMonitorInterval);
      this.statusMonitorInterval = null;
    }

    // Parar envio forçado
    if (this.forceSendInterval) {
      clearInterval(this.forceSendInterval);
      this.forceSendInterval = null;
    }

    // Parar health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Parar verificador de intervalo
    if (this.intervalChecker) {
      clearInterval(this.intervalChecker);
      this.intervalChecker = null;
    }

    // Fechar navegador do scraper
    if (this.scraper) {
      try {
        await this.scraper.close();
      } catch (error) {
        console.error('❌ Erro ao fechar navegador:', error.message);
      }
    }

    // Fechar WhatsApp
    if (this.whatsapp) {
      try {
        await this.whatsapp.close();
      } catch (error) {
        console.error('❌ Erro ao fechar WhatsApp:', error.message);
      }
    }

    // Fechar Telegram
    if (this.telegram) {
      try {
        await this.telegram.close();
      } catch (error) {
        console.error('❌ Erro ao fechar Telegram:', error.message);
      }
    }

    console.log('👋 Bot encerrado');
  }
}

// Função principal com reinicialização automática INFINITA (24/7)
async function main() {
  let bot = null;
  let restartCount = 0;
  const restartDelay = 30000; // 30 segundos entre reinicializações
  let consecutiveFailures = 0; // Contador de falhas consecutivas
  const maxConsecutiveFailures = 5; // Após 5 falhas consecutivas, aumentar delay

  const startBot = async () => {
    bot = new SignalsBot();

    try {
      await bot.init();

      // Verificar se deve sincronizar com o site (padrão: true)
      const syncWithSite = process.env.SYNC_WITH_SITE !== 'false';
      const intervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5;

      bot.start(intervalMinutes, syncWithSite);

      // Tratamento de encerramento gracioso
      // Aumentar limite de listeners para evitar avisos
      process.setMaxListeners(20);

      // Usar once para evitar múltiplos listeners
      process.once('SIGINT', async () => {
        console.log('\n\n🛑 Recebido sinal de encerramento...');
        if (bot) {
          await bot.shutdown();
        }
        process.exit(0);
      });

      process.once('SIGTERM', async () => {
        console.log('\n\n🛑 Recebido sinal de encerramento...');
        if (bot) {
          await bot.shutdown();
        }
        process.exit(0);
      });

      // Tratamento de erros não capturados - SEMPRE reinicializar (24/7)
      process.on('uncaughtException', async (error) => {
        console.error('❌ Erro não capturado:', error);
        console.error('Stack:', error.stack);
        // NUNCA encerrar o processo - sempre tentar reinicializar
        restartCount++;
        consecutiveFailures++;

        // Aumentar delay se muitas falhas consecutivas
        const currentDelay = consecutiveFailures >= maxConsecutiveFailures
          ? restartDelay * 2 // Dobrar delay após muitas falhas
          : restartDelay;

        console.log(`🔄 Tentando reinicializar após erro não capturado (tentativa ${restartCount}, falhas consecutivas: ${consecutiveFailures})...`);

        if (bot) {
          try {
            await bot.shutdown();
          } catch (shutdownError) {
            console.error('❌ Erro ao fazer shutdown:', shutdownError.message);
          }
        }

        setTimeout(() => {
          startBot().catch(err => {
            console.error('❌ Erro ao reinicializar:', err);
            // Continuar tentando mesmo com erro
          });
        }, currentDelay);
      });

      process.on('unhandledRejection', async (reason, promise) => {
        console.error('❌ Promise rejeitada não tratada:', reason);
        // Não encerrar o processo, apenas logar
        // O sistema deve continuar funcionando
      });

      // Resetar contador de reinicializações após 1 hora de funcionamento estável
      setTimeout(() => {
        restartCount = 0;
        console.log('✅ Sistema estável há 1 hora. Contador de reinicializações resetado.');
      }, 3600000); // 1 hora

      restartCount = 0; // Resetar contador ao iniciar com sucesso
      consecutiveFailures = 0; // Resetar falhas consecutivas após sucesso
      console.log('✅ Bot iniciado com sucesso e rodando 24/7!');
      console.log('🛡️ Sistema de auto-recuperação ativo - bot nunca parará!');

    } catch (error) {
      console.error('❌ Erro ao inicializar bot:', error);
      console.error('Stack:', error.stack);

      // SEMPRE tentar reinicializar automaticamente (24/7)
      restartCount++;
      consecutiveFailures++;

      // Aumentar delay se muitas falhas consecutivas
      const currentDelay = consecutiveFailures >= maxConsecutiveFailures
        ? restartDelay * 2 // Dobrar delay após muitas falhas
        : restartDelay;

      console.log(`🔄 Tentando reinicializar após erro (tentativa ${restartCount}, falhas consecutivas: ${consecutiveFailures})...`);
      console.log(`⏳ Aguardando ${currentDelay / 1000}s antes de reinicializar...`);

      if (bot) {
        try {
          await bot.shutdown();
        } catch (shutdownError) {
          console.error('❌ Erro ao fazer shutdown:', shutdownError.message);
        }
      }

      setTimeout(() => {
        startBot().catch(err => {
          console.error('❌ Erro ao reinicializar:', err);
          // Continuar tentando mesmo com erro - nunca parar
        });
      }, currentDelay);
    }
  };

  // Iniciar o bot
  await startBot();
}

// Executar
main().catch(error => {
  console.error('❌ Erro fatal no processo principal:', error);
  process.exit(1);
});

