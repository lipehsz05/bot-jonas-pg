import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';

class WhatsAppBot {
  constructor() {
    this.client = null;
    this.isReady = false;
  }

  async init() {
    console.log('📱 Inicializando WhatsApp...');

    // Tentar inicializar com retry automático
    const maxInitRetries = 3;
    let initRetryCount = 0;

    const attemptInit = async () => {
      try {
        // Limpar cliente anterior se existir
        if (this.client) {
          try {
            await this.client.destroy();
          } catch (destroyError) {
            // Ignorar erros ao destruir
          }
          this.client = null;
        }

        // Obter perfil do Chrome para WhatsApp (se configurado)
        const whatsappProfile = process.env.WHATSAPP_CHROME_PROFILE || null;
        const puppeteerArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process'
        ];

        // Adicionar perfil do usuário se configurado
        if (whatsappProfile) {
          const profilePath = path.isAbsolute(whatsappProfile) 
            ? whatsappProfile 
            : path.join(process.cwd(), whatsappProfile);
          
          // Criar diretório do perfil se não existir
          if (!fs.existsSync(profilePath)) {
            fs.mkdirSync(profilePath, { recursive: true });
            console.log(`📁 Perfil do Chrome criado: ${profilePath}`);
          }
          
          puppeteerArgs.push(`--user-data-dir=${profilePath}`);
          console.log(`🔐 Usando perfil do Chrome para WhatsApp: ${profilePath}`);
        }

        this.client = new Client({
          authStrategy: new LocalAuth({
            dataPath: './.wwebjs_auth'
          }),
          puppeteer: {
            headless: true,
            args: puppeteerArgs,
            timeout: 90000, // Timeout de 90 segundos
            ignoreHTTPSErrors: true,
            waitForInitialPage: false // Não esperar página inicial para evitar problemas
          },
          webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2413.51-beta.html'
          }
        });

        // Gerar QR Code (menor)
        this.client.on('qr', (qr) => {
          console.log('\n📲 Escaneie o QR Code abaixo com seu WhatsApp:\n');
          qrcode.generate(qr, { small: true });
          console.log('\n');
        });

        // Monitorar estado de carregamento
        this.client.on('loading_screen', (percent, message) => {
          console.log(`⏳ Carregando WhatsApp: ${percent}% - ${message}`);
        });

        // Monitorar mudanças de estado
        this.client.on('change_state', (state) => {
          console.log(`🔄 Estado do WhatsApp mudou para: ${state}`);
        });

        // Quando estiver autenticado
        this.client.on('ready', () => {
          console.log('✅ WhatsApp conectado e pronto!');
          this.isReady = true;
        });

        // Erro de autenticação
        this.client.on('authenticated', () => {
          console.log('🔐 WhatsApp autenticado!');
        });

        // Erro
        this.client.on('auth_failure', (msg) => {
          console.error('❌ Falha na autenticação do WhatsApp:', msg);
        });

        // Handler de erros não capturados do cliente
        this.client.on('error', (error) => {
          // Ignorar erros de "Execution context was destroyed" durante inicialização
          if (error.message && error.message.includes('Execution context was destroyed')) {
            console.log('⚠️ Erro de contexto destruído detectado (normal durante inicialização). Continuando...');
            return; // Não propagar o erro
          }
          console.error('❌ Erro no cliente WhatsApp:', error.message || error);
        });

        // Desconectado - com reconexão automática robusta
        this.client.on('disconnected', (reason) => {
          console.log('⚠️ WhatsApp desconectado:', reason);
          this.isReady = false;

          // Tentar reconectar automaticamente com retry exponencial
          let retryCount = 0;
          const maxRetries = 10;

          const attemptReconnect = () => {
            if (retryCount >= maxRetries) {
              console.error('❌ Máximo de tentativas de reconexão do WhatsApp atingido. O sistema continuará tentando periodicamente.');
              // Continuar tentando a cada 5 minutos mesmo após max retries
              setTimeout(attemptReconnect, 300000);
              return;
            }

            retryCount++;
            const delay = Math.min(5000 * Math.pow(2, retryCount - 1), 60000); // Retry exponencial, máximo 60s

            console.log(`🔄 Tentando reconectar WhatsApp (tentativa ${retryCount}/${maxRetries}) em ${delay / 1000}s...`);

            setTimeout(async () => {
              if (this.client) {
                try {
                  await this.client.initialize();
                  console.log('✅ WhatsApp reconectado com sucesso!');
                  retryCount = 0; // Resetar contador após sucesso
                } catch (err) {
                  console.error(`❌ Erro ao reconectar WhatsApp (tentativa ${retryCount}):`, err.message);
                  attemptReconnect(); // Tentar novamente
                }
              } else {
                console.log('⚠️ Cliente WhatsApp não disponível. Tentando novamente...');
                attemptReconnect();
              }
            }, delay);
          };

          attemptReconnect();
        });

        // Inicializar cliente com tratamento robusto de erros
        console.log('🔄 Iniciando cliente WhatsApp...');
        
        try {
          // Aguardar um pouco antes de inicializar para garantir que tudo está pronto
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          await this.client.initialize();
          console.log('✅ Cliente WhatsApp inicializado com sucesso!');
        } catch (initError) {
          // Se for erro de contexto destruído, aguardar mais tempo e tentar novamente
          if (initError.message && initError.message.includes('Execution context was destroyed')) {
            console.log('⚠️ Erro de contexto destruído durante inicialização. Aguardando e tentando novamente...');
            await new Promise(resolve => setTimeout(resolve, 10000)); // Aguardar 10 segundos
            
            // Tentar destruir e recriar o cliente
            try {
              if (this.client) {
                await this.client.destroy();
              }
            } catch (destroyError) {
              // Ignorar erros ao destruir
            }
            
            // Recriar cliente com o mesmo perfil
            const whatsappProfile = process.env.WHATSAPP_CHROME_PROFILE || null;
            const puppeteerArgsRetry = [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding',
              '--disable-blink-features=AutomationControlled',
              '--disable-features=IsolateOrigins,site-per-process'
            ];

            if (whatsappProfile) {
              const profilePath = path.isAbsolute(whatsappProfile) 
                ? whatsappProfile 
                : path.join(process.cwd(), whatsappProfile);
              
              if (!fs.existsSync(profilePath)) {
                fs.mkdirSync(profilePath, { recursive: true });
              }
              
              puppeteerArgsRetry.push(`--user-data-dir=${profilePath}`);
            }

            this.client = new Client({
              authStrategy: new LocalAuth({
                dataPath: './.wwebjs_auth'
              }),
              puppeteer: {
                headless: true,
                args: puppeteerArgsRetry,
                timeout: 90000,
                ignoreHTTPSErrors: true,
                waitForInitialPage: false
              },
              webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2413.51-beta.html'
              }
            });
            
            // Reconfigurar eventos
            this.client.on('qr', (qr) => {
              console.log('\n📲 Escaneie o QR Code abaixo com seu WhatsApp:\n');
              qrcode.generate(qr, { small: true });
              console.log('\n');
            });
            
            this.client.on('loading_screen', (percent, message) => {
              console.log(`⏳ Carregando WhatsApp: ${percent}% - ${message}`);
            });
            
            this.client.on('change_state', (state) => {
              console.log(`🔄 Estado do WhatsApp mudou para: ${state}`);
            });
            
            this.client.on('ready', () => {
              console.log('✅ WhatsApp conectado e pronto!');
              this.isReady = true;
            });
            
            this.client.on('authenticated', () => {
              console.log('🔐 WhatsApp autenticado!');
            });
            
            this.client.on('auth_failure', (msg) => {
              console.error('❌ Falha na autenticação do WhatsApp:', msg);
            });
            
            this.client.on('error', (error) => {
              if (error.message && error.message.includes('Execution context was destroyed')) {
                console.log('⚠️ Erro de contexto destruído (normal durante inicialização). Continuando...');
                return;
              }
              console.error('❌ Erro no cliente WhatsApp:', error.message || error);
            });
            
            this.client.on('disconnected', (reason) => {
              console.log('⚠️ WhatsApp desconectado:', reason);
              this.isReady = false;
              
              let retryCount = 0;
              const maxRetries = 10;
              
              const attemptReconnect = () => {
                if (retryCount >= maxRetries) {
                  setTimeout(attemptReconnect, 300000);
                  return;
                }
                
                retryCount++;
                const delay = Math.min(5000 * Math.pow(2, retryCount - 1), 60000);
                
                console.log(`🔄 Tentando reconectar WhatsApp (tentativa ${retryCount}/${maxRetries}) em ${delay / 1000}s...`);
                
                setTimeout(async () => {
                  if (this.client) {
                    try {
                      await this.client.initialize();
                      console.log('✅ WhatsApp reconectado com sucesso!');
                      retryCount = 0;
                    } catch (err) {
                      console.error(`❌ Erro ao reconectar WhatsApp (tentativa ${retryCount}):`, err.message);
                      attemptReconnect();
                    }
                  } else {
                    attemptReconnect();
                  }
                }, delay);
              };
              
              attemptReconnect();
            });
            
            // Tentar inicializar novamente
            await new Promise(resolve => setTimeout(resolve, 5000));
            await this.client.initialize();
            console.log('✅ Cliente WhatsApp inicializado com sucesso (após retry)!');
          } else {
            throw initError; // Re-lançar se não for erro de contexto destruído
          }
        }

      } catch (error) {
        console.error('❌ Erro ao inicializar WhatsApp:', error.message);
        console.error('Stack:', error.stack);
        
        // Se for erro de "Execution context was destroyed", tentar novamente
        if (error.message && (error.message.includes('Execution context was destroyed') || 
            error.message.includes('Protocol error') ||
            error.message.includes('Session closed'))) {
          initRetryCount++;
          if (initRetryCount < maxInitRetries) {
            console.log(`🔄 Tentando inicializar novamente (tentativa ${initRetryCount + 1}/${maxInitRetries})...`);
            // Aguardar mais tempo para dar chance ao WhatsApp Web carregar completamente
            await new Promise(resolve => setTimeout(resolve, 10000)); // Aguardar 10 segundos
            return await attemptInit();
          } else {
            console.error(`❌ Falha ao inicializar WhatsApp após ${maxInitRetries} tentativas.`);
            // Não lançar erro fatal - permitir que o sistema continue tentando
            console.log('⚠️ Continuando sem WhatsApp. O sistema tentará reconectar automaticamente...');
            this.isReady = false;
            return; // Retornar sem erro para não quebrar o sistema
          }
        } else {
          throw error;
        }
      }
    };

    await attemptInit();
  }

  async sendMessage(phoneNumber, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp não está pronto. Aguarde a conexão.');
    }

    try {
      // Formatar número (adicionar @c.us se necessário)
      const formattedNumber = phoneNumber.includes('@c.us')
        ? phoneNumber
        : `${phoneNumber}@c.us`;

      await this.client.sendMessage(formattedNumber, message);
      console.log(`✅ Mensagem enviada para ${phoneNumber}`);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao enviar mensagem para ${phoneNumber}:`, error);
      return false;
    }
  }

  async sendToGroup(groupId, message, imageUrl = null) {
    // Verificar se está pronto e se o cliente ainda existe
    if (!this.isReady || !this.client) {
      console.log('⚠️ WhatsApp não está pronto. Aguardando conexão...');
      return false;
    }

    // Verificar se a sessão ainda está ativa
    try {
      const state = await this.client.getState();
      if (state !== 'CONNECTED') {
        console.log(`⚠️ WhatsApp não está conectado (estado: ${state}). Aguardando reconexão...`);
        this.isReady = false;
        return false;
      }
    } catch (stateError) {
      console.log(`⚠️ Erro ao verificar estado do WhatsApp: ${stateError.message}`);
      this.isReady = false;
      return false;
    }

    // Aguardar um pouco para garantir que a sessão está estável
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      // Formatar ID do grupo (adicionar @g.us se necessário)
      const formattedGroupId = groupId.includes('@g.us')
        ? groupId
        : `${groupId}@g.us`;

      // Verificar se o grupo existe antes de enviar
      try {
        const chat = await this.client.getChatById(formattedGroupId);
        if (!chat) {
          console.log(`⚠️ Grupo ${groupId} não encontrado. Verifique o ID do grupo.`);
          return false;
        }
      } catch (chatError) {
        console.log(`⚠️ Erro ao verificar grupo ${groupId}: ${chatError.message}`);
        // Continuar mesmo assim - pode ser erro temporário
      }

      // Se tiver imagem, enviar com imagem
      if (imageUrl) {
        try {
          // Baixar imagem e criar MessageMedia
          const response = await fetch(imageUrl);
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/jpeg';

          const media = new MessageMedia(mimeType, base64);
          
          // Enviar com opções mais simples para evitar erros
          await this.client.sendMessage(formattedGroupId, media, { 
            caption: message,
            sendMediaAsDocument: false,
            sendSeen: false // Não marcar como visto automaticamente
          });
          
          // Log removido para reduzir verbosidade
          return true;
        } catch (imageError) {
          // Se o erro for relacionado a markedUnread, é um bug do WhatsApp Web
          if (imageError.message && (imageError.message.includes('markedUnread') || imageError.message.includes('Evaluation failed'))) {
            console.log(`⚠️ Erro conhecido do WhatsApp Web (markedUnread). Tentando enviar apenas texto...`);
          } else if (imageError.message && imageError.message.includes('Session closed')) {
            console.log(`⚠️ Sessão do WhatsApp fechada. Não foi possível enviar mensagem.`);
            this.isReady = false;
            return false;
          } else {
            console.log(`⚠️ Erro ao enviar imagem: ${imageError.message}`);
          }
          
          // Tentar enviar apenas texto
          try {
            await this.client.sendMessage(formattedGroupId, message, {
              sendSeen: false // Não marcar como visto automaticamente
            });
            console.log(`✅ Mensagem (apenas texto) enviada para o grupo ${groupId}`);
            return true;
          } catch (textError) {
            if (textError.message && (textError.message.includes('Session closed') || textError.message.includes('Protocol error'))) {
              console.log(`⚠️ Sessão do WhatsApp fechada. Não foi possível enviar mensagem.`);
              this.isReady = false;
              return false;
            }
            throw textError;
          }
        }
      } else {
        await this.client.sendMessage(formattedGroupId, message, {
          sendSeen: false // Não marcar como visto automaticamente
        });
        console.log(`✅ Mensagem enviada para o grupo ${groupId}`);
        return true;
      }
    } catch (error) {
      // Verificar se é erro de sessão fechada
      if (error.message && (error.message.includes('Session closed') || error.message.includes('Protocol error'))) {
        console.log(`⚠️ Sessão do WhatsApp foi fechada. Marcando como desconectado.`);
        this.isReady = false;
        return false;
      }
      const errorMsg = error.message || String(error);
      console.error(`❌ Erro ao enviar mensagem para o grupo ${groupId}: ${errorMsg}`);
      if (error.stack) {
        console.error(`   Detalhes: ${error.stack.substring(0, 200)}`);
      }
      return false;
    }
  }

  async sendMessageWithImage(phoneNumber, message, imageUrl) {
    if (!this.isReady) {
      throw new Error('WhatsApp não está pronto. Aguarde a conexão.');
    }

    try {
      // Formatar número (adicionar @c.us se necessário)
      const formattedNumber = phoneNumber.includes('@c.us')
        ? phoneNumber
        : `${phoneNumber}@c.us`;

      if (imageUrl) {
        try {
          // Baixar imagem e criar MessageMedia
          const response = await fetch(imageUrl);
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/jpeg';

          const media = new MessageMedia(mimeType, base64);
          await this.client.sendMessage(formattedNumber, media, { caption: message });
          console.log(`✅ Mensagem com imagem enviada para ${phoneNumber}`);
          return true;
        } catch (imageError) {
          console.log(`⚠️ Erro ao enviar imagem, enviando apenas texto: ${imageError.message}`);
          await this.client.sendMessage(formattedNumber, message);
          console.log(`✅ Mensagem enviada para ${phoneNumber}`);
          return true;
        }
      } else {
        await this.client.sendMessage(formattedNumber, message);
        console.log(`✅ Mensagem enviada para ${phoneNumber}`);
        return true;
      }
    } catch (error) {
      console.error(`❌ Erro ao enviar mensagem para ${phoneNumber}:`, error);
      return false;
    }
  }

  async getChats() {
    if (!this.isReady) {
      return [];
    }

    try {
      const chats = await this.client.getChats();
      return chats;
    } catch (error) {
      console.error('❌ Erro ao buscar chats:', error);
      return [];
    }
  }

  async close() {
    if (this.client) {
      await this.client.destroy();
      console.log('🔒 Cliente WhatsApp fechado');
    }
  }
}

export default WhatsAppBot;

