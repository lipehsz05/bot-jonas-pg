import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

class SiteScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.onGameFoundCallback = null; // Callback para enviar sinais imediatamente quando encontrados
    this.isInitializing = false; // Flag para evitar múltiplas inicializações simultâneas
  }

  async init() {
    // Evitar múltiplas inicializações simultâneas
    if (this.isInitializing) {
      console.log('⚠️ Inicialização já em andamento. Aguardando...');
      // Aguardar até que a inicialização termine
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      // Se o navegador foi inicializado, retornar
      if (this.browser && this.page) {
        return;
      }
    }

    // Se já existe um navegador, fechar primeiro
    if (this.browser) {
      try {
        await this.close();
      } catch (error) {
        console.log('⚠️ Erro ao fechar navegador anterior:', error.message);
      }
    }

    this.isInitializing = true;
    try {
      // Log removido para reduzir verbosidade

      // Obter perfil do Chrome para Scraper (se configurado)
      const scraperProfile = process.env.SCRAPER_CHROME_PROFILE || null;
      const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ];

      // Adicionar perfil do usuário se configurado
      if (scraperProfile) {
        const profilePath = path.isAbsolute(scraperProfile)
          ? scraperProfile
          : path.join(process.cwd(), scraperProfile);

        // Criar diretório do perfil se não existir
        if (!fs.existsSync(profilePath)) {
          fs.mkdirSync(profilePath, { recursive: true });
          console.log(`📁 Perfil do Chrome criado: ${profilePath}`);
        }

        puppeteerArgs.push(`--user-data-dir=${profilePath}`);
        console.log(`🔐 Usando perfil do Chrome para Scraper: ${profilePath}`);
      }

      this.browser = await puppeteer.launch({
        headless: "new", // Usar novo modo headless
        args: puppeteerArgs
      });
      this.page = await this.browser.newPage();

      // Configurar viewport
      await this.page.setViewport({ width: 1920, height: 1080 });

      // Configurar user agent mais realista
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

      // Adicionar headers extras para parecer mais real
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      });

      // Ocultar que é um bot (remover propriedades do Puppeteer)
      await this.page.evaluateOnNewDocument(() => {
        // Sobrescrever o objeto navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // Sobrescrever permissões
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );

        // Plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });

        // Languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['pt-BR', 'pt', 'en-US', 'en']
        });
      });

      // Log removido para reduzir verbosidade
    } catch (error) {
      console.error('❌ Erro ao inicializar navegador:', error.message);
      // Limpar referências em caso de erro
      this.browser = null;
      this.page = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async navigateToSite() {
    // Log removido para reduzir verbosidade

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   Tentativa ${attempt}/${maxRetries}...`);

        await this.page.goto('https://www.reidoslotsinais.com/', {
          waitUntil: 'domcontentloaded', // Usar apenas domcontentloaded para ser mais rápido
          timeout: 90000 // Timeout maior: 90 segundos
        });

        // Aguardar um pouco para garantir que a página carregou
        await this.page.waitForTimeout(2000);

        // Verificar se a página carregou corretamente
        const pageTitle = await this.page.title();
        console.log(`   ✅ Página carregada: ${pageTitle}`);

        return; // Sucesso, sair do loop
      } catch (error) {
        lastError = error;
        console.log(`   ⚠️ Erro na tentativa ${attempt}: ${error.message}`);

        if (attempt < maxRetries) {
          const delay = attempt * 5000; // Delay crescente: 5s, 10s, 15s
          console.log(`   🔄 Aguardando ${delay / 1000}s antes de tentar novamente...`);
          await this.page.waitForTimeout(delay);
        }
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    throw new Error(`Falha ao acessar o site após ${maxRetries} tentativas: ${lastError.message}`);
  }

  async acceptPopups() {
    // Log removido para reduzir verbosidade

    try {
      // Aguardar o primeiro pop-up aparecer - usar múltiplas estratégias (delay reduzido)
      await this.page.waitForTimeout(1000);

      // Estratégia 1: Procurar por botão com texto "Aceitar e continuar"
      try {
        await this.page.waitForSelector('button', { timeout: 5000 });

        // Buscar todos os botões e encontrar o que contém o texto
        const firstButton = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const acceptButton = buttons.find(btn =>
            btn.textContent.includes('Aceitar e continuar') ||
            btn.textContent.includes('Aceitar') ||
            btn.classList.contains('bg-green-600')
          );
          return acceptButton ? acceptButton.getAttribute('class') : null;
        });

        if (firstButton) {
          await this.page.click(`button.${firstButton.split(' ')[0]}`);
          console.log('✅ Primeiro pop-up aceito');
          await this.page.waitForTimeout(500); // Reduzido para iniciar mais rápido
        } else {
          // Tentar clicar diretamente no botão verde
          const greenButton = await this.page.$('button.bg-green-600, button[class*="green"]');
          if (greenButton) {
            await greenButton.click();
            // Log removido para reduzir verbosidade
            await this.page.waitForTimeout(500); // Reduzido para iniciar mais rápido
          }
        }
      } catch (error) {
        // Log removido para reduzir verbosidade
      }

      // Aguardar o segundo pop-up aparecer (delay reduzido)
      await this.page.waitForTimeout(500);

      // Estratégia 2: Processar segundo pop-up
      try {
        // Procurar por checkbox "não mostrar mais" ou similar
        const checkbox = await this.page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
          const labels = Array.from(document.querySelectorAll('label'));

          // Procurar checkbox relacionado a "não mostrar mais"
          for (const label of labels) {
            if (label.textContent.toLowerCase().includes('não mostrar') ||
              label.textContent.toLowerCase().includes('não exibir')) {
              const associatedInput = document.querySelector(`input[id="${label.getAttribute('for')}"]`) ||
                label.querySelector('input[type="checkbox"]');
              if (associatedInput) {
                return associatedInput.id || associatedInput.className;
              }
            }
          }

          // Se não encontrou, retornar o primeiro checkbox
          return inputs.length > 0 ? (inputs[0].id || inputs[0].className) : null;
        });

        if (checkbox) {
          await this.page.click(`input[type="checkbox"]${checkbox.includes('id') ? `#${checkbox}` : `.${checkbox}`}`);
          console.log('✅ Checkbox "não mostrar mais" marcado');
          await this.page.waitForTimeout(1000);
        }

        // Procurar pelo botão "Fechar" ou segundo "Aceitar e continuar"
        const secondButton = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));

          // Priorizar botão "Fechar"
          let closeBtn = buttons.find(btn =>
            btn.textContent.toLowerCase().includes('fechar') ||
            btn.textContent.toLowerCase().includes('close')
          );

          // Se não encontrar, procurar por "Aceitar e continuar" novamente
          if (!closeBtn) {
            closeBtn = buttons.find(btn =>
              btn.textContent.includes('Aceitar e continuar') ||
              btn.classList.contains('bg-green-600')
            );
          }

          return closeBtn ? closeBtn.getAttribute('class') : null;
        });

        if (secondButton) {
          await this.page.click(`button.${secondButton.split(' ')[0]}`);
          console.log('✅ Segundo pop-up fechado');
        } else {
          // Tentar clicar em qualquer botão verde visível
          const greenButtons = await this.page.$$('button.bg-green-600, button[class*="green"]');
          if (greenButtons.length > 0) {
            await greenButtons[greenButtons.length - 1].click();
            // Log removido para reduzir verbosidade
          }
        }

        await this.page.waitForTimeout(500); // Reduzido para iniciar mais rápido

      } catch (error) {
        // Log removido para reduzir verbosidade
      }

      // Aguardar um pouco para garantir que os pop-ups foram fechados (reduzido)
      await this.page.waitForTimeout(500); // Reduzido de 2000ms para 500ms

    } catch (error) {
      console.log('⚠️ Erro ao processar pop-ups:', error.message);
      // Continuar mesmo com erro, pode ser que os pop-ups não apareçam
    }
  }

  async getSignals() {
    // Log removido para reduzir verbosidade

    try {
      // Aguardar os sinais carregarem na página
      await this.page.waitForTimeout(5000);

      // Procurar pelos sinais na página
      // Vamos tentar diferentes seletores possíveis
      const signals = await this.page.evaluate(() => {
        const results = [];

        // Procurar por cards ou elementos que contenham informações de sinais
        // Ajustar os seletores conforme a estrutura real do site
        const signalElements = document.querySelectorAll('[class*="signal"], [class*="card"], [class*="game"], [data-signal]');

        signalElements.forEach((element, index) => {
          const text = element.innerText || element.textContent;
          if (text && text.trim().length > 0) {
            results.push({
              index: index + 1,
              text: text.trim(),
              html: element.innerHTML
            });
          }
        });

        // Se não encontrar pelos seletores acima, tentar pegar todo o conteúdo relevante
        if (results.length === 0) {
          const mainContent = document.querySelector('main, [role="main"], .content, #content');
          if (mainContent) {
            const paragraphs = mainContent.querySelectorAll('p, div, span');
            paragraphs.forEach((p, index) => {
              const text = p.innerText || p.textContent;
              if (text && text.trim().length > 10) { // Filtrar textos muito curtos
                results.push({
                  index: index + 1,
                  text: text.trim()
                });
              }
            });
          }
        }

        return results;
      });

      console.log(`📊 Encontrados ${signals.length} sinais potenciais`);
      return signals;

    } catch (error) {
      console.error('❌ Erro ao buscar sinais:', error);
      return [];
    }
  }

  async getStatusCardInfo() {
    // Verificar se a página está pronta
    if (!this.page || !this.browser) {
      return null;
    }

    try {
      // Verificar se a página ainda está conectada
      if (this.page.isClosed()) {
        return null;
      }

      // Aguardar um pouco para garantir que a página está estável (não está navegando)
      await this.page.waitForTimeout(100);

      // Procurar pelo card de status específico
      const statusInfo = await this.page.evaluate(() => {
        // Procurar pelo card que contém "Última atualização"
        const cards = Array.from(document.querySelectorAll('div'));
        const statusCard = cards.find(card =>
          card.textContent.includes('Última atualização') ||
          card.textContent.includes('Próxima em')
        );

        if (!statusCard) return null;

        const cardText = statusCard.innerText || statusCard.textContent;

        // Extrair informações do status
        const lastUpdateMatch = cardText.match(/Última atualização:\s*(\d{2}:\d{2}:\d{2})/);

        // Extrair countdown do span específico: "Próxima em: 2m 12s" ou "Próxima em: 1m" ou "Próxima em: 30s"
        let nextUpdateText = null;

        // Procurar pelo span que contém "Próxima em:"
        const nextUpdateSpan = Array.from(statusCard.querySelectorAll('span')).find(span => {
          const text = span.textContent || '';
          return text.includes('Próxima em:');
        });

        if (nextUpdateSpan) {
          // Procurar o span filho com classe "ml-1" que contém o tempo (ex: "2m 12s")
          const timeSpan = nextUpdateSpan.querySelector('span.ml-1');

          if (timeSpan) {
            nextUpdateText = timeSpan.textContent.trim();
          } else {
            // Se não encontrou span.ml-1, procurar em todos os spans filhos
            const allSpans = nextUpdateSpan.querySelectorAll('span');
            for (const span of allSpans) {
              const text = span.textContent.trim();
              // Verificar se o texto corresponde ao formato de tempo (ex: "2m 12s", "1m", "30s")
              if (/^\d+[ms](\s+\d+[s])?$/.test(text)) {
                nextUpdateText = text;
                break;
              }
            }

            // Se ainda não encontrou, tentar extrair do texto completo do span
            if (!nextUpdateText) {
              const match = nextUpdateSpan.textContent.match(/Próxima em:\s*(\d+m\s*\d+s|\d+m|\d+s)/);
              if (match) {
                nextUpdateText = match[1];
              }
            }
          }
        }

        // Fallback: tentar extrair do texto completo do card
        if (!nextUpdateText) {
          const nextUpdateMatch = cardText.match(/Próxima em:\s*(\d+m\s*\d+s|\d+m|\d+s)/);
          nextUpdateText = nextUpdateMatch ? nextUpdateMatch[1] : null;
        }

        // Verificar qual status está ativo
        const statusDivs = statusCard.querySelectorAll('div[role="status"]');
        let currentStatus = 'unknown';
        let hasNewSignals = false;

        statusDivs.forEach(div => {
          const opacity = window.getComputedStyle(div).opacity;
          const transform = window.getComputedStyle(div).transform;

          // Se opacity é 1 e não tem translate-y negativo, está visível
          if (opacity === '1' && !transform.includes('translateY(-')) {
            const text = div.innerText || div.textContent;

            if (text.includes('Novos sinais encontrados')) {
              currentStatus = 'new_signals';
              hasNewSignals = true;
            } else if (text.includes('Carregando')) {
              currentStatus = 'loading';
            } else if (text.includes('Atualizando')) {
              currentStatus = 'updating';
            } else if (text.includes('Aguardando dados')) {
              currentStatus = 'waiting';
            } else if (text.includes('Falha na atualização')) {
              currentStatus = 'error';
            } else if (text.includes('Última atualização')) {
              currentStatus = 'ready';
            }
          }
        });

        return {
          lastUpdate: lastUpdateMatch ? lastUpdateMatch[1] : null,
          nextUpdate: nextUpdateText,
          currentStatus: currentStatus,
          hasNewSignals: hasNewSignals,
          fullText: cardText
        };
      });

      return statusInfo;
    } catch (error) {
      // Se o contexto foi destruído (navegação em andamento), não é um erro crítico
      const errorMsg = error.message || '';
      if (errorMsg.includes('Execution context was destroyed') ||
        errorMsg.includes('Requesting main frame too early') ||
        errorMsg.includes('Session closed')) {
        // Página está navegando/recarregando ou não está pronta, retornar null silenciosamente
        return null;
      }
      // Outros erros podem ser logados
      console.error('❌ Erro ao obter informações do card de status:', errorMsg);
      return null;
    }
  }

  async waitForNewSignals(timeoutMs = 300000, lastKnownUpdate = null) {
    // Log removido para reduzir verbosidade

    const startTime = Date.now();
    const checkInterval = 1000; // Verificar a cada 1 segundo
    let lastLogTime = 0;
    const logInterval = 30000; // Logar apenas a cada 30 segundos
    let lastUpdateTime = lastKnownUpdate;

    while (Date.now() - startTime < timeoutMs) {
      const statusInfo = await this.getStatusCardInfo();

      if (statusInfo) {
        const now = Date.now();

        // Verificar se o horário de "Última atualização" mudou (indica que o site atualizou)
        if (statusInfo.lastUpdate && lastUpdateTime && statusInfo.lastUpdate !== lastUpdateTime) {
          // Log removido para reduzir verbosidade
          await this.page.waitForTimeout(500); // Delay mínimo para garantir que está completo
          return true;
        }

        // Atualizar o último horário conhecido
        if (statusInfo.lastUpdate) {
          lastUpdateTime = statusInfo.lastUpdate;
        }

        // Logar apenas a cada 30 segundos para não spammar
        if (now - lastLogTime >= logInterval) {
          // Log removido para reduzir verbosidade
          lastLogTime = now;
        }

        if (statusInfo.hasNewSignals || statusInfo.currentStatus === 'new_signals') {
          await this.page.waitForTimeout(500); // Delay mínimo para garantir que está completo
          return true;
        }

        if (statusInfo.currentStatus === 'error') {
          // Log removido para reduzir verbosidade
          return false;
        }
      }

      await this.page.waitForTimeout(checkInterval);
    }

    // Log removido para reduzir verbosidade
    return false;
  }

  async getSignalsBySelector(skipWaitForUpdate = false, category = 'PG') {
    // Log removido para reduzir verbosidade

    try {
      // Apenas PG Games é suportado - não precisa clicar em botão de categoria

      // Se skipWaitForUpdate é true, pular todas as esperas e ir direto para buscar sinais
      if (skipWaitForUpdate) {
        // Log removido para reduzir verbosidade
        // Delay mínimo removido - DOM já está estável quando detectamos atualização
        // await this.page.waitForTimeout(0); // Removido completamente para envio mais rápido
      } else {
        // Aguardar a página carregar completamente apenas se não estiver pulando
        await this.page.waitForTimeout(5000);

        // Verificar status inicial
        const initialStatus = await this.getStatusCardInfo();

        // Se não há novos sinais, aguardar (mas não muito tempo para não travar)
        if (!initialStatus || !initialStatus.hasNewSignals) {
          await this.waitForNewSignals(30000); // Aguardar até 30 segundos
        }
      }

      // Apenas PG Games é suportado
      const categoryInfo = { 
        searchTexts: ['PG GAMES', 'PG GAME'], 
        type: 'pg-game', 
        platform: 'PG GAMES', 
        altType: 'pg-game-alt', 
        contextType: 'pg-game-context' 
      };

      // Buscar sinais usando seletores específicos - FOCAR NA CATEGORIA ESPECIFICADA
      const signals = await this.page.evaluate((catInfo) => {
        const results = [];

        // Procurar pelo elemento que armazena os jogos
        // Elemento com classe "absolute inset-0 rounded-full"
        const gameContainers = document.querySelectorAll('div.absolute.inset-0.rounded-full, div[class*="absolute"][class*="inset-0"][class*="rounded-full"]');

        // Também procurar por elementos que contenham essas classes (pode estar em diferentes combinações)
        const allDivs = Array.from(document.querySelectorAll('div'));
        const gameStorageElements = allDivs.filter(div => {
          const classes = div.className || '';
          return classes.includes('absolute') &&
            classes.includes('inset-0') &&
            classes.includes('rounded-full');
        });

        // Procurar por abas/categorias: apenas PG GAMES é suportado
        let gamesContainer = null;
        let activeCategory = null;

        // Estratégia 1: Procurar por botões/abas de categoria
        const categoryButtons = Array.from(document.querySelectorAll('button, div[role="button"], a, span.cursor-pointer'));
        const categoryButton = categoryButtons.find(btn => {
          const text = (btn.innerText || btn.textContent || '').toUpperCase();
          return catInfo.searchTexts.some(searchText => text.includes(searchText));
        });

        // Se encontrar botão da categoria, verificar se está ativo ou clicar nele
        if (categoryButton) {
          // Verificar se está ativo (pode ter classes como "active", "selected", etc)
          const isActive = categoryButton.className.includes('active') ||
            categoryButton.className.includes('selected') ||
            categoryButton.getAttribute('aria-selected') === 'true';

          if (!isActive) {
            // Tentar clicar para ativar (mas não vamos fazer isso aqui, apenas identificar)
            console.log(`${catInfo.searchTexts[0]} encontrado mas não está ativo`);
          }

          // Procurar o container relacionado
          // Pode estar próximo ao botão ou em um elemento pai
          let parent = categoryButton.parentElement;
          while (parent && !gamesContainer) {
            const children = Array.from(parent.querySelectorAll('div'));
            gamesContainer = children.find(div => {
              const classes = div.className || '';
              return classes.includes('absolute') && classes.includes('inset-0');
            });
            parent = parent.parentElement;
          }
        }

        // Estratégia 2: Procurar diretamente por elementos que contenham jogos da categoria
        // Procurar por texto da categoria e encontrar o container relacionado
        const categoryText = Array.from(document.querySelectorAll('*')).find(el => {
          const text = (el.innerText || el.textContent || '').toUpperCase();
          return catInfo.searchTexts.some(searchText => text.includes(searchText));
        });

        if (categoryText) {
          // Procurar container de jogos próximo
          let searchParent = categoryText.parentElement;
          for (let i = 0; i < 5 && searchParent; i++) {
            const containers = searchParent.querySelectorAll('div.absolute.inset-0, div[class*="absolute"][class*="inset-0"]');
            if (containers.length > 0) {
              gamesContainer = Array.from(containers).find(container => {
                // Verificar se contém jogos (imagens, links, etc)
                const hasGames = container.querySelectorAll('img, a, button').length > 0;
                return hasGames;
              });
              if (gamesContainer) break;
            }
            searchParent = searchParent.parentElement;
          }
        }

        // Estratégia 3: Se não encontrou, procurar por todos os containers e identificar qual é da categoria
        if (!gamesContainer && gameStorageElements.length > 0) {
          // Procurar qual container está visível/ativo e contém jogos
          gameStorageElements.forEach(container => {
            const style = window.getComputedStyle(container);
            const isVisible = style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0';

            if (isVisible) {
              // Verificar se contém elementos de jogo
              const hasGameElements = container.querySelectorAll('img[alt*="Logo"], a, button, [class*="game"]').length > 0;

              if (hasGameElements && !gamesContainer) {
                // Verificar contexto - procurar por texto da categoria próximo
                let context = container;
                for (let i = 0; i < 3; i++) {
                  context = context.parentElement;
                  if (context) {
                    const contextText = (context.innerText || context.textContent || '').toUpperCase();
                    if (catInfo.searchTexts.some(searchText => contextText.includes(searchText))) {
                      gamesContainer = container;
                      break;
                    }
                  }
                }
              }
            }
          });
        }

        // Estratégia 4: Buscar diretamente por elementos com data-nome
        // Baseado no HTML: <div class="game" data-nome="Fortune Mouse" data-bet-default="..." etc>
        const gameElements = document.querySelectorAll('div[data-nome], [data-nome][data-bet-default]');

        if (gameElements.length > 0) {
          console.log(`Encontrados ${gameElements.length} jogos com atributo data-nome`);

          gameElements.forEach((gameEl, index) => {
            // Usar data-nome diretamente como nome do jogo
            const gameName = gameEl.getAttribute('data-nome') || '';

            // Extrair valores diretamente do texto do card para garantir precisão
            // Buscar no texto completo do elemento
            const cardText = gameEl.innerText || gameEl.textContent || '';

            // Extrair Aposta Mínima do texto (formato: "Aposta Mínima: 64%")
            let betMin = '';
            const minMatch = cardText.match(/Aposta\s+M[ií]nima:\s*(\d+)%/i);
            if (minMatch) {
              betMin = minMatch[1];
            } else {
              // Fallback: usar atributo data-bet-default se não encontrar no texto
              betMin = gameEl.getAttribute('data-bet-default') || '';
            }

            // Extrair Aposta Padrão do texto (formato: "Aposta Padrão: 91%")
            let betDefault = '';
            const padraoMatch = cardText.match(/Aposta\s+Padr[ãa]o:\s*(\d+)%/i);
            if (padraoMatch) {
              betDefault = padraoMatch[1];
            } else {
              // Fallback: usar atributo data-bet-min se não encontrar no texto
              betDefault = gameEl.getAttribute('data-bet-min') || '';
            }

            // Extrair Aposta Máxima do texto (formato: "Aposta Máxima: 82%")
            let betMax = '';
            const maxMatch = cardText.match(/Aposta\s+M[áa]xima:\s*(\d+)%/i);
            if (maxMatch) {
              betMax = maxMatch[1];
            } else {
              // Fallback: usar atributo data-bet-max se não encontrar no texto
              betMax = gameEl.getAttribute('data-bet-max') || '';
            }

            // Extrair Distribuição do texto (formato: "Distribuição: 92%")
            let distribuicao = '';
            const distMatch = cardText.match(/Distribui[çc][ãa]o:\s*(\d+)%/i);
            if (distMatch) {
              distribuicao = distMatch[1];
            } else {
              // Fallback: usar atributo data-distribuicao se não encontrar no texto
              distribuicao = gameEl.getAttribute('data-distribuicao') || '';
            }

            const gameId = gameEl.getAttribute('data-game-id') || '';

            // Log de valores extraídos removido para reduzir verbosidade

            // Procurar link de jogo (pode ser windmillpg, cafetariapg, etc)
            const gameLink = gameEl.querySelector('a[href*="windmillpg"], a[href*="cafetariapg"], a[href*="game"], a[target="_blank"]');
            const href = gameLink ? gameLink.href : null;

            // Extrair imagem do jogo
            // Priorizar imagem dentro do div com classe "hover:opacity-75" (imagem principal do jogo)
            let imageUrl = null;

            // Primeiro, tentar encontrar a imagem dentro do div específico
            const imageContainer = gameEl.querySelector('div.hover\\:opacity-75 img, div[class*="hover"] img, div[class*="opacity"] img');
            if (imageContainer) {
              let imgUrl = imageContainer.getAttribute('srcset') || imageContainer.getAttribute('src');

              if (imgUrl) {
                // Se for srcset, pegar a URL maior (última)
                if (imgUrl.includes(',')) {
                  const urls = imgUrl.split(',').map(u => u.trim().split(' ')[0]);
                  imgUrl = urls[urls.length - 1]; // Pegar a maior resolução
                }

                // Converter URL relativa para absoluta
                if (imgUrl.startsWith('/')) {
                  imgUrl = 'https://www.reidoslotsinais.com' + imgUrl;
                } else if (imgUrl.startsWith('_next/image')) {
                  imgUrl = 'https://www.reidoslotsinais.com/' + imgUrl;
                } else if (!imgUrl.startsWith('http')) {
                  imgUrl = 'https://www.reidoslotsinais.com/' + imgUrl;
                }

                imageUrl = imgUrl;
              }
            }

            // Fallback: se não encontrou, procurar todas as imagens
            if (!imageUrl) {
              const gameImages = gameEl.querySelectorAll('img');

              for (const img of gameImages) {
                // Tentar pegar srcset primeiro (melhor qualidade)
                let imgUrl = img.getAttribute('srcset') || img.getAttribute('src');

                if (imgUrl) {
                  // Se for srcset, pegar a URL maior (última)
                  if (imgUrl.includes(',')) {
                    const urls = imgUrl.split(',').map(u => u.trim().split(' ')[0]);
                    imgUrl = urls[urls.length - 1]; // Pegar a maior resolução
                  }

                  // Converter URL relativa para absoluta se necessário
                  if (imgUrl.startsWith('/')) {
                    imgUrl = 'https://www.reidoslotsinais.com' + imgUrl;
                  } else if (imgUrl.startsWith('_next/image')) {
                    imgUrl = 'https://www.reidoslotsinais.com/' + imgUrl;
                  } else if (!imgUrl.startsWith('http')) {
                    imgUrl = 'https://www.reidoslotsinais.com/' + imgUrl;
                  }

                  // Preferir imagens que contenham "games" no caminho
                  if (imgUrl.includes('/games/') || imgUrl.includes('games')) {
                    imageUrl = imgUrl;
                    break;
                  } else if (!imageUrl) {
                    // Se não encontrou uma com "games", usar a primeira
                    imageUrl = imgUrl;
                  }
                }
              }
            }

            // Se ainda não encontrou, tentar pegar do custom-mask (background-image)
            if (!imageUrl) {
              const customMask = gameEl.querySelector('div.custom-mask');
              if (customMask) {
                const bgImage = customMask.style.backgroundImage;
                if (bgImage) {
                  // Extrair URL do background-image: url("...")
                  const match = bgImage.match(/url\(["']?([^"']+)["']?\)/);
                  if (match && match[1]) {
                    let bgUrl = match[1];
                    if (bgUrl.startsWith('/')) {
                      bgUrl = 'https://www.reidoslotsinais.com' + bgUrl;
                    } else if (!bgUrl.startsWith('http')) {
                      bgUrl = 'https://www.reidoslotsinais.com/' + bgUrl;
                    }
                    imageUrl = bgUrl;
                  }
                }
              }
            }

            // Extrair informações de apostas sugeridas
            let betBonus = '';
            let betConexaoMin = '';
            let betExtraMin = '';
            let betPadrao1 = '';
            let betPadrao2 = '';
            let betMaxima = '';

            // Procurar por seção MÍNIMA
            const secaoMinima = Array.from(gameEl.querySelectorAll('*')).find(el => {
              const text = el.textContent || '';
              return text.includes('MÍNIMA') || text.includes('Mínima');
            });

            if (secaoMinima) {
              // Estrutura HTML real:
              // <div class="text-[12px] uppercase flex justify-between">
              //   <span class="font-bold">Bet Bônus:</span>
              //   <span class="bg-green-500 text-white px-2 rounded text-[10px] font-bold flex text-center items-center justify-center">1,20</span>
              // </div>

              // Buscar todos os divs dentro da seção mínima
              const allDivs = Array.from(secaoMinima.querySelectorAll('div'));

              // Extrair Bet Bônus - procurar div que contém "Bet Bônus:" e pegar o span verde dentro dele
              for (const div of allDivs) {
                const divText = div.textContent || '';
                // Verificar se contém "Bet Bônus" mas NÃO contém os outros labels
                if ((divText.includes('Bet Bônus:') || divText.includes('BET BÔNUS:')) &&
                  !divText.includes('Bet Conexão:') && !divText.includes('Bet Extra:')) {
                  // Buscar spans dentro deste div específico
                  const spans = div.querySelectorAll('span');
                  for (const span of spans) {
                    // Verificar se é o span verde (valor)
                    if (span.classList.contains('bg-green-500') || span.classList.contains('text-white')) {
                      const value = span.textContent.trim();
                      // Verificar se é um número (não é o label)
                      if (value && /[\d,\.]/.test(value) && !value.includes('Bet')) {
                        betBonus = value;
                        // Remover vírgula e converter para ponto se necessário
                        betBonus = betBonus.replace(',', '.');
                        // Log removido para reduzir verbosidade
                        break;
                      }
                    }
                  }
                  if (betBonus) break;
                }
              }

              // Extrair Bet Conexão - procurar div que contém "Bet Conexão:" e pegar o span verde dentro dele
              for (const div of allDivs) {
                const divText = div.textContent || '';
                // Verificar se contém "Bet Conexão" mas NÃO contém os outros labels
                if ((divText.includes('Bet Conexão:') || divText.includes('BET CONEXÃO:')) &&
                  !divText.includes('Bet Bônus:') && !divText.includes('Bet Extra:')) {
                  // Buscar spans dentro deste div específico
                  const spans = div.querySelectorAll('span');
                  for (const span of spans) {
                    // Verificar se é o span verde (valor)
                    if (span.classList.contains('bg-green-500') || span.classList.contains('text-white')) {
                      const value = span.textContent.trim();
                      // Verificar se é um número (não é o label)
                      if (value && /[\d,\.]/.test(value) && !value.includes('Bet')) {
                        betConexaoMin = value;
                        // Remover vírgula e converter para ponto se necessário
                        betConexaoMin = betConexaoMin.replace(',', '.');
                        console.log(`✅ Bet Conexão extraído: ${betConexaoMin}`);
                        break;
                      }
                    }
                  }
                  if (betConexaoMin) break;
                }
              }

              // Extrair Bet Extra - procurar div que contém "Bet Extra:" e pegar o span verde dentro dele
              for (const div of allDivs) {
                const divText = div.textContent || '';
                // Verificar se contém "Bet Extra" mas NÃO contém os outros labels
                if ((divText.includes('Bet Extra:') || divText.includes('BET EXTRA:')) &&
                  !divText.includes('Bet Bônus:') && !divText.includes('Bet Conexão:')) {
                  // Buscar spans dentro deste div específico
                  const spans = div.querySelectorAll('span');
                  for (const span of spans) {
                    // Verificar se é o span verde (valor)
                    if (span.classList.contains('bg-green-500') || span.classList.contains('text-white')) {
                      const value = span.textContent.trim();
                      // Verificar se é um número (não é o label)
                      if (value && /[\d,\.]/.test(value) && !value.includes('Bet')) {
                        betExtraMin = value;
                        // Remover vírgula e converter para ponto se necessário
                        betExtraMin = betExtraMin.replace(',', '.');
                        // Log removido para reduzir verbosidade
                        break;
                      }
                    }
                  }
                  if (betExtraMin) break;
                }
              }
            }

            // Procurar por seção PADRÃO
            const secaoPadrao = Array.from(gameEl.querySelectorAll('*')).find(el => {
              const text = el.textContent || '';
              return text.includes('PADRÃO') || text.includes('Padrão');
            });

            if (secaoPadrao) {
              const betElementsPad = secaoPadrao.querySelectorAll('.bg-green-500, span.bg-green-500');
              betElementsPad.forEach((betEl, idx) => {
                const betText = betEl.textContent.trim();
                if (idx === 0) betPadrao1 = betText;
                if (idx === 1) betPadrao2 = betText;
              });
            }

            // Procurar por seção MÁXIMA
            const secaoMaxima = Array.from(gameEl.querySelectorAll('*')).find(el => {
              const text = el.textContent || '';
              return text.includes('MÁXIMA') || text.includes('Máxima');
            });

            if (secaoMaxima) {
              const betElementsMax = secaoMaxima.querySelectorAll('.bg-green-500, span.bg-green-500');
              if (betElementsMax.length > 0) {
                betMaxima = betElementsMax[0].textContent.trim();
              }
            }

            // Extrair texto completo do jogo
            const gameText = gameEl.innerText || gameEl.textContent || '';

            // Montar informações do sinal
            if (gameName) {
              let signalText = `🎮 ${gameName}\n\n`;

              if (betDefault || betMin || betMax) {
                signalText += `📊 Apostas:\n`;
                if (betMin) signalText += `  • Mínima: ${betMin}%\n`;
                if (betDefault) signalText += `  • Padrão: ${betDefault}%\n`;
                if (betMax) signalText += `  • Máxima: ${betMax}%\n`;
              }

              if (distribuicao) {
                signalText += `📈 Distribuição: ${distribuicao}%\n\n`;
              }

              if (betConexaoMin || betExtraMin || betPadrao1 || betPadrao2 || betMaxima) {
                signalText += `💰 Apostas Sugeridas:\n`;

                if (betConexaoMin || betExtraMin) {
                  signalText += `  Mínima:\n`;
                  if (betConexaoMin) signalText += `    • Bet Conexão: ${betConexaoMin}\n`;
                  if (betExtraMin) signalText += `    • Bet Extra: ${betExtraMin}\n`;
                }

                if (betPadrao1 || betPadrao2) {
                  signalText += `  Padrão:\n`;
                  if (betPadrao1) signalText += `    • ${betPadrao1}\n`;
                  if (betPadrao2) signalText += `    • ${betPadrao2}\n`;
                }

                if (betMaxima) {
                  signalText += `  Máxima:\n`;
                  signalText += `    • ${betMaxima}\n`;
                }
              }

              if (href) {
                signalText += `\n🔗 Link: ${href}`;
              }

              results.push({
                type: catInfo.type,
                index: index + 1,
                platform: catInfo.platform,
                gameName: gameName,
                gameId: gameId,
                betDefault: betDefault,
                betMin: betMin,
                betMax: betMax,
                distribuicao: distribuicao,
                possibilidadesGanhos: distribuicao, // Possibilidades de ganhos = distribuição
                betBonus: betBonus,
                betConexaoMin: betConexaoMin,
                betExtraMin: betExtraMin,
                betPadrao1: betPadrao1,
                betPadrao2: betPadrao2,
                betMaxima: betMaxima,
                text: signalText,
                href: href,
                imageUrl: imageUrl,
                rawText: gameText
              });
            }
          });
        }

        // Se encontrou o container da categoria mas não encontrou jogos com data-nome, tentar método alternativo
        if (results.length === 0 && gamesContainer) {
          console.log(`Container ${catInfo.platform} encontrado, buscando jogos alternativamente...`);

          // Procurar por jogos dentro do container
          const gameElementsAlt = gamesContainer.querySelectorAll('div[class*="game"], a[href*="game"], a[href*="windmillpg"], a[href*="cafetariapg"]');

          gameElementsAlt.forEach((gameEl, index) => {
            // Procurar nome do jogo em h3 ou texto destacado
            const gameNameEl = gameEl.querySelector('h3, h4, [class*="name"], [class*="title"]');
            const gameName = gameNameEl ? (gameNameEl.textContent || gameNameEl.innerText || '').trim() : '';

            // Procurar link
            const gameLink = gameEl.querySelector('a[href*="game"], a[href*="windmillpg"], a[href*="cafetariapg"]') || gameEl.closest('a[href*="game"]');
            const href = gameLink ? gameLink.href : null;

            // Extrair texto completo
            const gameText = gameEl.innerText || gameEl.textContent || '';

            if (gameName || gameText.trim().length > 10) {
              results.push({
                type: catInfo.altType,
                index: index + 1,
                platform: catInfo.platform,
                gameName: gameName || `Jogo ${index + 1}`,
                text: gameText.trim(),
                href: href
              });
            }
          });
        }

        // Se ainda não encontrou nada, fazer busca mais ampla mas filtrar apenas pela categoria
        if (results.length === 0) {
          // Procurar por todos os elementos que possam ser jogos
          const allPossibleGames = document.querySelectorAll('img[alt*="Logo"], a[href*="game"], a[href*="slot"]');

          allPossibleGames.forEach((el, index) => {
            // Verificar contexto - procurar por texto da categoria próximo
            let context = el;
            let isCategoryGame = false;

            for (let i = 0; i < 5; i++) {
              context = context.parentElement;
              if (!context) break;

              const contextText = (context.innerText || context.textContent || '').toUpperCase();
              // Apenas verificar se é PG GAMES (única categoria suportada)
              if (contextText.includes('PG GAMES') || contextText.includes('PG GAME')) {
                isCategoryGame = true;
                break;
              }
            }

            if (isCategoryGame) {
              const gameName = el.alt || el.title || el.innerText || `Jogo ${index + 1}`;
              const parentText = el.closest('div, section')?.innerText || '';

              results.push({
                type: catInfo.contextType,
                index: index + 1,
                platform: catInfo.platform,
                gameName: gameName,
                text: (gameName + ' ' + parentText).trim(),
                href: el.href || null
              });
            }
          });
        }

        // Remover duplicatas
        const uniqueResults = [];
        const seenKeys = new Set();

        results.forEach(result => {
          const key = `${result.gameName || 'unknown'}-${(result.text || '').substring(0, 50).toLowerCase()}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueResults.push(result);
          }
        });

        return uniqueResults;
      }, categoryInfo);

      // Log removido para reduzir verbosidade
      return signals;

    } catch (error) {
      console.error('❌ Erro ao buscar sinais:', error);
      return [];
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Navegador fechado');
    }
  }

  // Clicar no botão da categoria (PG Games, PP Games, WG Games)
  async clickCategoryButton(category) {
    try {
      let buttonTexts = [];
      if (category === 'PP') {
        buttonTexts = ['PP Games', 'PP GAMES', 'PP', 'pp games', 'pp'];
      } else if (category === 'WG') {
        buttonTexts = ['WG Games', 'WG GAMES', 'WG', 'wg games', 'wg'];
      } else if (category === 'PG') {
        buttonTexts = ['PG Games', 'PG GAMES', 'PG', 'pg games', 'pg'];
      }

      if (buttonTexts.length === 0) return false;

      // Procurar botão que contém qualquer um dos textos da categoria
      const clicked = await this.page.evaluate((texts) => {
        // Primeiro, procurar por spans com cursor-pointer (como o exemplo do usuário: <span class="cursor-pointer">PP Games</span>)
        const spans = Array.from(document.querySelectorAll('span.cursor-pointer, span[class*="cursor-pointer"]'));

        // Priorizar comparação exata
        for (const text of texts) {
          const span = spans.find(s => {
            const spanText = (s.textContent || s.innerText || '').trim();
            const searchText = text.trim();
            // Comparação exata primeiro
            return spanText.toUpperCase() === searchText.toUpperCase();
          });

          if (span) {
            console.log(`✅ Encontrado span com texto exato: "${span.textContent.trim()}"`);
            span.click();
            // Disparar evento de clique também para garantir
            span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
          }
        }

        // Se não encontrou com exato, tentar com includes
        for (const text of texts) {
          const span = spans.find(s => {
            const spanText = (s.textContent || s.innerText || '').trim().toUpperCase();
            const searchText = text.trim().toUpperCase();
            return spanText.includes(searchText) || searchText.includes(spanText);
          });

          if (span) {
            console.log(`✅ Encontrado span com texto parcial: "${span.textContent.trim()}"`);
            span.click();
            span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
          }
        }

        // Se não encontrou no span, procurar em todos os elementos clicáveis
        const allClickable = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"], div[class*="button"], span[class*="cursor"], span[class*="pointer"]'));

        for (const text of texts) {
          const element = allClickable.find(el => {
            const elText = (el.textContent || el.innerText || el.getAttribute('aria-label') || '').trim();
            const searchText = text.trim();
            return elText.toUpperCase() === searchText.toUpperCase() ||
              elText.toUpperCase().includes(searchText.toUpperCase());
          });

          if (element) {
            console.log(`✅ Encontrado elemento com texto: "${element.textContent || element.innerText}"`);
            element.click();
            return true;
          }
        }

        // Tentar também por atributos data-*
        for (const text of texts) {
          const element = allClickable.find(el => {
            const dataCategory = (el.getAttribute('data-category') || el.getAttribute('data-type') || '').toUpperCase();
            const searchText = text.toUpperCase();
            return dataCategory.includes(searchText);
          });

          if (element) {
            element.click();
            return true;
          }
        }

        return false;
      }, buttonTexts);

      if (clicked) {
        await this.page.waitForTimeout(1500); // Aguardar carregar (aumentado para garantir)
        console.log(`✅ Clicou no botão da categoria ${category}`);
        return true;
      } else {
        console.log(`⚠️ Botão da categoria ${category} não encontrado. Tentando variações...`);
        // Log dos botões disponíveis para debug (incluindo spans)
        const availableButtons = await this.page.evaluate(() => {
          const allElements = Array.from(document.querySelectorAll('button, a, div[role="button"], span.cursor-pointer, span[class*="cursor-pointer"]'));
          return allElements.slice(0, 15).map(b => (b.textContent || b.innerText || '').trim()).filter(t => t && t.length > 0);
        });
        console.log(`📋 Primeiros elementos encontrados: ${availableButtons.join(', ')}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Erro ao clicar no botão da categoria ${category}:`, error.message);
      return false;
    }
  }

  // Buscar jogos favoritos usando o campo de busca do site
  async searchFavoriteGames(favoriteGames, onGameFound = null, category = 'PG') {
    if (!favoriteGames || favoriteGames.length === 0) {
      return [];
    }

    // Apenas PG Games é suportado
    // Não precisa clicar em botão de categoria pois já está em PG por padrão

    console.log(`🔍 Buscando ${favoriteGames.length} jogos favoritos...`);
    const results = [];
    let processedCount = 0;
    let foundCount = 0;
    let errorCount = 0;

    // Função auxiliar para encontrar o campo de busca com retry
    const findSearchInput = async (maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Aguardar um pouco antes de procurar
          await this.page.waitForTimeout(200);
          
          const searchInput = await this.page.$('input[placeholder*="Pesquise"], input[placeholder*="pesquise"], input[type="text"]');
          
          if (searchInput) {
            return searchInput;
          }
          
          // Se não encontrou, tentar aguardar mais um pouco
          if (attempt < maxRetries) {
            await this.page.waitForTimeout(500);
          }
        } catch (error) {
          if (attempt < maxRetries) {
            await this.page.waitForTimeout(500);
          }
        }
      }
      return null;
    };

    for (let i = 0; i < favoriteGames.length; i++) {
      const favoriteGame = favoriteGames[i];
      processedCount++;
      
      try {
        console.log(`📋 Processando jogo ${processedCount}/${favoriteGames.length}: "${favoriteGame}"`);
        
        // Encontrar o campo de busca com retry
        let searchInput = await findSearchInput();
        
        // Se não encontrou, tentar recarregar a página e procurar novamente
        if (!searchInput) {
          console.log(`⚠️ Campo de busca não encontrado para "${favoriteGame}". Tentando recarregar página...`);
          try {
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.page.waitForTimeout(2000);
            await this.acceptPopups();
            await this.page.waitForTimeout(1000);
            
            // Não precisa clicar em categoria pois já está em PG por padrão
            searchInput = await findSearchInput();
          } catch (reloadError) {
            console.error(`❌ Erro ao recarregar página: ${reloadError.message}`);
          }
        }
        
        if (!searchInput) {
          console.error(`❌ Campo de busca não encontrado após tentativas para "${favoriteGame}". Pulando...`);
          errorCount++;
          continue;
        }

        // LIMPEZA ROBUSTA DO CAMPO ANTES DE PREENCHER
        // Primeiro, limpar completamente o campo usando múltiplos métodos
        console.log(`🧹 Limpando campo de busca antes de buscar "${favoriteGame}"...`);
        
        // Método 1: Limpar via evaluate
        await this.page.evaluate((input) => {
          if (input) {
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('keydown', { bubbles: true, key: 'Delete' }));
            input.dispatchEvent(new Event('keyup', { bubbles: true, key: 'Delete' }));
          }
        }, searchInput);
        await this.page.waitForTimeout(300);
        
        // Método 2: Limpar via teclado (Ctrl+A + Delete) com verificação
        try {
          await searchInput.click({ clickCount: 3 });
          await this.page.waitForTimeout(300);
          
          // Verificar o valor antes de tentar selecionar
          const valueBeforeSelect = await this.page.evaluate((input) => {
            return input ? input.value : '';
          }, searchInput);
          
          if (valueBeforeSelect && valueBeforeSelect.trim() !== '') {
            console.log(`📝 Valor antes de selecionar: "${valueBeforeSelect}"`);
            
            // Tentar selecionar tudo com Ctrl+A
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            await this.page.waitForTimeout(300);
            
            // Verificar se o texto foi selecionado (verificando selectionStart e selectionEnd)
            const isSelected = await this.page.evaluate((input) => {
              if (!input) return false;
              const start = input.selectionStart || 0;
              const end = input.selectionEnd || 0;
              const length = input.value.length;
              // Se a seleção cobre todo o texto, foi selecionado
              return start === 0 && end === length && length > 0;
            }, searchInput);
            
            if (isSelected) {
              console.log(`✅ Texto selecionado com sucesso. Deletando...`);
              await this.page.keyboard.press('Delete');
              await this.page.waitForTimeout(400);
            } else {
              console.log(`⚠️ Texto não foi selecionado. Apagando manualmente...`);
              // Apagar manualmente caractere por caractere
              const length = valueBeforeSelect.length;
              for (let i = 0; i < length; i++) {
                await this.page.keyboard.press('Backspace');
                await this.page.waitForTimeout(50);
              }
              await this.page.waitForTimeout(300);
            }
          }
        } catch (keyboardError) {
          console.log(`⚠️ Erro ao limpar via teclado: ${keyboardError.message}`);
        }
        
        // Verificar se está realmente vazio
        const isEmptyAfterClean = await this.page.evaluate((input) => {
          return input ? input.value.trim() === '' : false;
        }, searchInput);
        
        if (!isEmptyAfterClean) {
          console.log(`⚠️ Campo ainda não está vazio após limpeza. Tentando método mais agressivo...`);
          // Método mais agressivo: re-encontrar o input e limpar manualmente
          const freshInput = await this.page.$('input[placeholder*="Pesquise"], input[placeholder*="pesquise"], input[type="text"]');
          if (freshInput) {
            await freshInput.click({ clickCount: 3 });
            await this.page.waitForTimeout(200);
            
            // Obter o valor atual
            const currentValue = await this.page.evaluate((input) => {
              return input ? input.value : '';
            }, freshInput);
            
            // Apagar manualmente se ainda houver texto
            if (currentValue && currentValue.trim() !== '') {
              console.log(`🧹 Apagando manualmente: "${currentValue}"`);
              const length = currentValue.length;
              // Ir para o final do texto
              for (let i = 0; i < length; i++) {
                await this.page.keyboard.press('ArrowRight');
                await this.page.waitForTimeout(20);
              }
              // Apagar tudo
              for (let i = 0; i < length; i++) {
                await this.page.keyboard.press('Backspace');
                await this.page.waitForTimeout(50);
              }
              await this.page.waitForTimeout(300);
            }
            
            // Limpar via evaluate também
            await this.page.evaluate((input) => {
              if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, freshInput);
            await this.page.waitForTimeout(400);
            
            // Verificar novamente
            const finalCheck = await this.page.evaluate((input) => {
              return input ? input.value.trim() === '' : false;
            }, freshInput);
            
            if (finalCheck) {
              console.log(`✅ Campo limpo com sucesso após método agressivo`);
              searchInput = freshInput; // Usar o input atualizado
            } else {
              console.error(`❌ Campo ainda não está vazio após todos os métodos`);
            }
          }
        } else {
          console.log(`✅ Campo limpo com sucesso`);
        }

        // Preencher o campo com o nome do jogo
        console.log(`✍️ Preenchendo campo de busca com: "${favoriteGame}"`);
        
        // Método 1: Tentar definir diretamente via evaluate
        await this.page.evaluate((input, value) => {
          if (input) {
            input.focus();
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('keyup', { bubbles: true }));
          }
        }, searchInput, favoriteGame);
        
        await this.page.waitForTimeout(600);
        
        // Verificar se foi definido corretamente
        let currentValue = await this.page.evaluate((input) => {
          return input ? input.value : '';
        }, searchInput);
        
        // Se não funcionou, tentar digitar manualmente
        if (currentValue !== favoriteGame) {
          console.log(`🔄 Valor não corresponde. Esperado: "${favoriteGame}", Encontrado: "${currentValue}". Tentando digitar manualmente...`);
          
          // Verificar se está vazio antes de digitar
          const isEmpty = await this.page.evaluate((input) => {
            return input ? input.value.trim() === '' : false;
          }, searchInput);
          
          if (!isEmpty) {
            console.log(`🧹 Campo não está vazio. Limpando antes de digitar...`);
            // Limpar novamente
            await searchInput.click({ clickCount: 3 });
            await this.page.waitForTimeout(300);
            
            const valueToClear = await this.page.evaluate((input) => {
              return input ? input.value : '';
            }, searchInput);
            
            if (valueToClear && valueToClear.trim() !== '') {
              // Tentar Ctrl+A primeiro
              await this.page.keyboard.down('Control');
              await this.page.keyboard.press('KeyA');
              await this.page.keyboard.up('Control');
              await this.page.waitForTimeout(300);
              
              // Verificar se selecionou
              const isSelected = await this.page.evaluate((input) => {
                if (!input) return false;
                const start = input.selectionStart || 0;
                const end = input.selectionEnd || 0;
                const length = input.value.length;
                return start === 0 && end === length && length > 0;
              }, searchInput);
              
              if (isSelected) {
                await this.page.keyboard.press('Delete');
                await this.page.waitForTimeout(400);
              } else {
                // Apagar manualmente
                console.log(`⚠️ Ctrl+A não funcionou. Apagando manualmente...`);
                const length = valueToClear.length;
                for (let i = 0; i < length; i++) {
                  await this.page.keyboard.press('Backspace');
                  await this.page.waitForTimeout(50);
                }
                await this.page.waitForTimeout(300);
              }
              
              // Limpar via evaluate também
              await this.page.evaluate((input) => {
                if (input) {
                  input.value = '';
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, searchInput);
              await this.page.waitForTimeout(400);
            }
          }
          
          // Verificar se está vazio agora
          const isEmptyNow = await this.page.evaluate((input) => {
            return input ? input.value.trim() === '' : false;
          }, searchInput);
          
          if (isEmptyNow) {
            console.log(`✅ Campo está vazio. Digitando: "${favoriteGame}"`);
            // Digitar o valor com delay maior para garantir
            await searchInput.type(favoriteGame, { delay: 100 });
            await this.page.waitForTimeout(800);
            
            // Verificar novamente
            currentValue = await this.page.evaluate((input) => {
              return input ? input.value : '';
            }, searchInput);
          }
        }
        
        // AGUARDAR ATÉ O VALOR ESTAR CORRETO (sem pressa)
        let attempts = 0;
        const maxAttempts = 10;
        while (currentValue !== favoriteGame && attempts < maxAttempts) {
          attempts++;
          console.log(`⏳ Aguardando valor correto... Tentativa ${attempts}/${maxAttempts}. Atual: "${currentValue}", Esperado: "${favoriteGame}"`);
          
          await this.page.waitForTimeout(500);
          
          // Tentar definir novamente
          await this.page.evaluate((input, value) => {
            if (input) {
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, searchInput, favoriteGame);
          
          await this.page.waitForTimeout(500);
          
          // Verificar novamente
          currentValue = await this.page.evaluate((input) => {
            return input ? input.value : '';
          }, searchInput);
        }
        
        if (currentValue !== favoriteGame) {
          console.error(`❌ Não foi possível definir o valor "${favoriteGame}" no campo de busca após ${maxAttempts} tentativas. Valor atual: "${currentValue}"`);
          errorCount++;
          continue; // Pular este jogo e continuar para o próximo
        }
        
        console.log(`✅ Campo preenchido corretamente com: "${currentValue}"`);

        // Verificar se o valor ainda está no campo antes de buscar resultados
        // AGUARDAR ATÉ O VALOR ESTAR CORRETO ANTES DE BUSCAR
        let valueBeforeSearch = await this.page.evaluate((input) => {
          return input ? input.value : '';
        }, searchInput);
        
        let searchAttempts = 0;
        const maxSearchAttempts = 15;
        
        while (valueBeforeSearch !== favoriteGame && searchAttempts < maxSearchAttempts) {
          searchAttempts++;
          console.log(`⏳ Aguardando valor correto antes de buscar... Tentativa ${searchAttempts}/${maxSearchAttempts}`);
          console.log(`   Esperado: "${favoriteGame}"`);
          console.log(`   Atual: "${valueBeforeSearch}"`);
          
          // Tentar definir novamente
          await this.page.evaluate((input, value) => {
            if (input) {
              input.focus();
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('keyup', { bubbles: true }));
            }
          }, searchInput, favoriteGame);
          
          await this.page.waitForTimeout(800);
          
          // Verificar novamente
          valueBeforeSearch = await this.page.evaluate((input) => {
            return input ? input.value : '';
          }, searchInput);
        }
        
        if (valueBeforeSearch !== favoriteGame) {
          console.error(`❌ Valor não está correto após ${maxSearchAttempts} tentativas. Esperado: "${favoriteGame}", Encontrado: "${valueBeforeSearch}"`);
          console.error(`   Pulando busca para este jogo...`);
          errorCount++;
          continue; // Pular este jogo
        }
        
        console.log(`✅ Valor confirmado antes de buscar: "${valueBeforeSearch}"`);

        // VERIFICAÇÃO FINAL: Confirmar que o valor no campo está correto antes de buscar
        const finalCheck = await this.page.evaluate((input) => {
          return input ? input.value : '';
        }, searchInput);
        
        if (finalCheck !== favoriteGame) {
          console.error(`❌ ERRO CRÍTICO: Valor no campo não está correto antes de buscar!`);
          console.error(`   Esperado: "${favoriteGame}"`);
          console.error(`   Encontrado: "${finalCheck}"`);
          console.error(`   Pulando busca para este jogo...`);
          errorCount++;
          continue;
        }
        
        console.log(`✅ Valor confirmado no campo antes de buscar: "${finalCheck}"`);
        
        // Aguardar os resultados aparecerem com múltiplas tentativas
        let resultsAppeared = false;
        for (let waitAttempt = 0; waitAttempt < 6; waitAttempt++) {
          try {
            // Aguardar até que elementos com data-nome apareçam
            await this.page.waitForSelector('div[data-nome], [data-nome]', { timeout: 2000 });
            
            // Verificar se realmente há elementos visíveis
            const hasVisibleResults = await this.page.evaluate(() => {
              const elements = document.querySelectorAll('div[data-nome], [data-nome]');
              return Array.from(elements).some(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              });
            });
            
            if (hasVisibleResults) {
              resultsAppeared = true;
              break;
            }
          } catch (waitError) {
            // Se não aparecer, aguardar mais um pouco e tentar novamente
            await this.page.waitForTimeout(600);
          }
        }
        
        if (!resultsAppeared) {
          console.log(`⚠️ Resultados não apareceram para "${favoriteGame}" após múltiplas tentativas`);
        }
        
        // Aguardar mais tempo para garantir que os resultados estão completamente carregados
        await this.page.waitForTimeout(2000);
        
        // VERIFICAÇÃO ADICIONAL: Verificar o valor no campo novamente antes de buscar
        const valueBeforeSearchFinal = await this.page.evaluate((input) => {
          return input ? input.value : '';
        }, searchInput);
        
        if (valueBeforeSearchFinal !== favoriteGame) {
          console.error(`❌ ERRO: Valor no campo mudou durante a espera! Esperado: "${favoriteGame}", Encontrado: "${valueBeforeSearchFinal}"`);
          errorCount++;
          continue;
        }
        
        console.log(`✅ Valor confirmado novamente antes de buscar: "${valueBeforeSearchFinal}"`);

        // Buscar o jogo nos resultados com múltiplas estratégias
        const gameData = await this.page.evaluate((gameName) => {
          // Normalizar o nome buscado
          const normalizedSearch = gameName.toLowerCase().trim().replace(/\s+/g, ' ');

          // Estratégia 1: Procurar por todos os elementos com data-nome
          let allGameElements = document.querySelectorAll('div[data-nome], [data-nome], div.game[data-nome]');
          
          // Estratégia 2: Se não encontrou, procurar por elementos visíveis que possam ser jogos
          if (allGameElements.length === 0) {
            // Aguardar um pouco mais (simulado)
            allGameElements = document.querySelectorAll('div[data-nome], [data-nome]');
          }

          // Log para debug
          console.log(`🔍 Buscando "${gameName}" - Encontrados ${allGameElements.length} elementos com data-nome`);

          // Encontrar o que corresponde ao nome buscado (BUSCA RIGOROSA)
          let gameEl = null;
          let exactMatch = null;
          let wordMatch = null;
          
          // Criar palavras do nome buscado (filtrar palavras muito curtas)
          const searchWords = normalizedSearch.split(' ').filter(w => w.length > 1); // Palavras com mais de 1 caractere
          const searchWithoutSpaces = normalizedSearch.replace(/\s+/g, '').replace(/[^\w]/g, '');
          
          console.log(`🔍 Buscando jogo: "${gameName}"`);
          console.log(`   Palavras-chave: ${searchWords.join(', ')}`);
          
          for (const el of allGameElements) {
            const foundName = el.getAttribute('data-nome') || '';
            const normalizedFound = foundName.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
            const foundWithoutSpaces = normalizedFound.replace(/\s+/g, '').replace(/[^\w]/g, '');

            // 1. Verificar correspondência EXATA (mais confiável)
            if (normalizedFound === normalizedSearch || foundWithoutSpaces === searchWithoutSpaces) {
              exactMatch = el;
              console.log(`   ✅ Correspondência EXATA encontrada: "${foundName}"`);
              break;
            }
            
            // 2. Verificar se TODAS as palavras do nome buscado estão no nome encontrado
            if (searchWords.length > 0) {
              const foundWords = normalizedFound.split(' ').filter(w => w.length > 1);
              
              // TODAS as palavras do buscado devem estar no encontrado
              const allWordsPresent = searchWords.every(searchedWord => {
                return foundWords.some(foundWord => {
                  // Correspondência exata da palavra
                  if (foundWord === searchedWord) return true;
                  // Ou a palavra está contida (ex: "fortune" em "fortunes")
                  if (foundWord.includes(searchedWord) || searchedWord.includes(foundWord)) {
                    const diff = Math.abs(foundWord.length - searchedWord.length);
                    return diff <= 2; // Permitir diferença de até 2 caracteres
                  }
                  return false;
                });
              });
              
              if (allWordsPresent && !wordMatch) {
                wordMatch = el;
                console.log(`   ✅ Todas palavras encontradas: "${foundName}"`);
              }
            }
          }

          // Priorizar correspondência exata, depois por palavras (NÃO usar correspondência parcial - muito permissiva)
          gameEl = exactMatch || wordMatch;
          
          if (!gameEl) {
            console.log(`   ⚠️ Nenhuma correspondência válida encontrada`);
          }

          if (!gameEl) {
            // Estratégia alternativa: buscar por texto visível na página
            const searchWords = normalizedSearch.split(' ').filter(w => w.length > 2);
            const allTextElements = Array.from(document.querySelectorAll('*'));
            
            for (const el of allTextElements) {
              const text = (el.innerText || el.textContent || '').trim();
              if (text.length > 100) continue; // Ignorar textos muito longos
              
              const normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');
              const textWithoutSpaces = normalizedText.replace(/\s+/g, '');
              const searchWithoutSpaces = normalizedSearch.replace(/\s+/g, '');
              
              // Verificar correspondência exata
              let matches = (normalizedText === normalizedSearch || textWithoutSpaces === searchWithoutSpaces);
              
              // Se não encontrou exato, tentar por palavras-chave
              if (!matches && searchWords.length > 0) {
                matches = searchWords.every(word => normalizedText.includes(word));
              }
              
              // Se não encontrou, tentar correspondência parcial
              if (!matches) {
                matches = (normalizedText.includes(normalizedSearch) || normalizedSearch.includes(normalizedText));
              }
              
              if (matches) {
                // Procurar o elemento pai que tenha data-nome
                let parent = el.parentElement;
                for (let i = 0; i < 6 && parent; i++) {
                  if (parent.getAttribute('data-nome')) {
                    gameEl = parent;
                    break;
                  }
                  parent = parent.parentElement;
                }
                if (gameEl) break;
              }
            }
          }

          if (!gameEl) {
            // Log dos nomes encontrados para debug
            const foundNames = Array.from(allGameElements).slice(0, 10).map(el => el.getAttribute('data-nome') || '').filter(n => n);
            console.log(`⚠️ Jogo "${gameName}" não encontrado. Primeiros nomes encontrados: ${foundNames.join(', ')}`);
            return null;
          }

          const foundGameName = gameEl.getAttribute('data-nome') || '';

          // Extrair valores diretamente do texto do card para garantir precisão
          const cardText = gameEl.innerText || gameEl.textContent || '';

          // Extrair Aposta Mínima do texto (formato: "Aposta Mínima: 64%")
          let betMin = '';
          const minMatch = cardText.match(/Aposta\s+M[ií]nima:\s*(\d+)%/i);
          if (minMatch) {
            betMin = minMatch[1];
          } else {
            betMin = gameEl.getAttribute('data-bet-default') || '';
          }

          // Extrair Aposta Padrão do texto (formato: "Aposta Padrão: 91%")
          let betDefault = '';
          const padraoMatch = cardText.match(/Aposta\s+Padr[ãa]o:\s*(\d+)%/i);
          if (padraoMatch) {
            betDefault = padraoMatch[1];
          } else {
            betDefault = gameEl.getAttribute('data-bet-min') || '';
          }

          // Extrair Aposta Máxima do texto (formato: "Aposta Máxima: 82%")
          let betMax = '';
          const maxMatch = cardText.match(/Aposta\s+M[áa]xima:\s*(\d+)%/i);
          if (maxMatch) {
            betMax = maxMatch[1];
          } else {
            betMax = gameEl.getAttribute('data-bet-max') || '';
          }

          // Extrair Distribuição do texto (formato: "Distribuição: 92%")
          let distribuicao = '';
          const distMatch = cardText.match(/Distribui[çc][ãa]o:\s*(\d+)%/i);
          if (distMatch) {
            distribuicao = distMatch[1];
          } else {
            distribuicao = gameEl.getAttribute('data-distribuicao') || '';
          }

          const gameId = gameEl.getAttribute('data-game-id') || '';

          // Procurar link
          const gameLink = gameEl.querySelector('a[href*="windmillpg"], a[href*="cafetariapg"], a[href*="sedapg"], a[target="_blank"]');
          const href = gameLink ? gameLink.href : null;

          // Extrair imagem
          const imageContainer = gameEl.querySelector('div.hover\\:opacity-75 img, div[class*="hover"] img');
          let imageUrl = null;

          if (imageContainer) {
            let imgUrl = imageContainer.getAttribute('srcset') || imageContainer.getAttribute('src');
            if (imgUrl) {
              if (imgUrl.includes(',')) {
                const urls = imgUrl.split(',').map(u => u.trim().split(' ')[0]);
                imgUrl = urls[urls.length - 1];
              }
              if (imgUrl.startsWith('/')) {
                imgUrl = 'https://www.reidoslotsinais.com' + imgUrl;
              } else if (imgUrl.startsWith('_next/image')) {
                imgUrl = 'https://www.reidoslotsinais.com/' + imgUrl;
              } else if (!imgUrl.startsWith('http')) {
                imgUrl = 'https://www.reidoslotsinais.com/' + imgUrl;
              }
              imageUrl = imgUrl;
            }
          }

          // Extrair apostas sugeridas
          let betBonus = '';
          let betConexaoMin = '';
          let betExtraMin = '';
          let betPadrao1 = '';
          let betPadrao2 = '';
          let betMaxima = '';

          // Procurar seção MÍNIMA
          const secaoMinima = Array.from(gameEl.querySelectorAll('*')).find(el => {
            const text = el.textContent || '';
            return text.includes('MÍNIMA') || text.includes('Mínima');
          });

          if (secaoMinima) {
            // Estrutura HTML real:
            // <div class="text-[12px] uppercase flex justify-between">
            //   <span class="font-bold">Bet Bônus:</span>
            //   <span class="bg-green-500 text-white px-2 rounded text-[10px] font-bold flex text-center items-center justify-center">1,20</span>
            // </div>

            // Buscar todos os divs dentro da seção mínima
            const allDivs = Array.from(secaoMinima.querySelectorAll('div'));

            // Extrair Bet Bônus - procurar div que contém "Bet Bônus:" e pegar o span verde dentro dele
            for (const div of allDivs) {
              const divText = div.textContent || '';
              // Verificar se contém "Bet Bônus" mas NÃO contém os outros labels
              if ((divText.includes('Bet Bônus:') || divText.includes('BET BÔNUS:')) &&
                !divText.includes('Bet Conexão:') && !divText.includes('Bet Extra:')) {
                // Buscar spans dentro deste div específico
                const spans = div.querySelectorAll('span');
                for (const span of spans) {
                  // Verificar se é o span verde (valor)
                  if (span.classList.contains('bg-green-500') || span.classList.contains('text-white')) {
                    const value = span.textContent.trim();
                    // Verificar se é um número (não é o label)
                    if (value && /[\d,\.]/.test(value) && !value.includes('Bet')) {
                      betBonus = value;
                      // Remover vírgula e converter para ponto se necessário
                      betBonus = betBonus.replace(',', '.');
                      break;
                    }
                  }
                }
                if (betBonus) break;
              }
            }

            // Extrair Bet Conexão - procurar div que contém "Bet Conexão:" e pegar o span verde dentro dele
            for (const div of allDivs) {
              const divText = div.textContent || '';
              // Verificar se contém "Bet Conexão" mas NÃO contém os outros labels
              if ((divText.includes('Bet Conexão:') || divText.includes('BET CONEXÃO:')) &&
                !divText.includes('Bet Bônus:') && !divText.includes('Bet Extra:')) {
                // Buscar spans dentro deste div específico
                const spans = div.querySelectorAll('span');
                for (const span of spans) {
                  // Verificar se é o span verde (valor)
                  if (span.classList.contains('bg-green-500') || span.classList.contains('text-white')) {
                    const value = span.textContent.trim();
                    // Verificar se é um número (não é o label)
                    if (value && /[\d,\.]/.test(value) && !value.includes('Bet')) {
                      betConexaoMin = value;
                      // Remover vírgula e converter para ponto se necessário
                      betConexaoMin = betConexaoMin.replace(',', '.');
                      break;
                    }
                  }
                }
                if (betConexaoMin) break;
              }
            }

            // Extrair Bet Extra - procurar div que contém "Bet Extra:" e pegar o span verde dentro dele
            for (const div of allDivs) {
              const divText = div.textContent || '';
              // Verificar se contém "Bet Extra" mas NÃO contém os outros labels
              if ((divText.includes('Bet Extra:') || divText.includes('BET EXTRA:')) &&
                !divText.includes('Bet Bônus:') && !divText.includes('Bet Conexão:')) {
                // Buscar spans dentro deste div específico
                const spans = div.querySelectorAll('span');
                for (const span of spans) {
                  // Verificar se é o span verde (valor)
                  if (span.classList.contains('bg-green-500') || span.classList.contains('text-white')) {
                    const value = span.textContent.trim();
                    // Verificar se é um número (não é o label)
                    if (value && /[\d,\.]/.test(value) && !value.includes('Bet')) {
                      betExtraMin = value;
                      // Remover vírgula e converter para ponto se necessário
                      betExtraMin = betExtraMin.replace(',', '.');
                      break;
                    }
                  }
                }
                if (betExtraMin) break;
              }
            }
          }

          // Procurar seção PADRÃO
          const secaoPadrao = Array.from(gameEl.querySelectorAll('*')).find(el => {
            const text = el.textContent || '';
            return text.includes('PADRÃO') || text.includes('Padrão');
          });

          if (secaoPadrao) {
            const betElementsPad = secaoPadrao.querySelectorAll('.bg-green-500, span.bg-green-500');
            betElementsPad.forEach((betEl, idx) => {
              const betText = betEl.textContent.trim();
              if (idx === 0) betPadrao1 = betText;
              if (idx === 1) betPadrao2 = betText;
            });
          }

          // Procurar seção MÁXIMA
          const secaoMaxima = Array.from(gameEl.querySelectorAll('*')).find(el => {
            const text = el.textContent || '';
            return text.includes('MÁXIMA') || text.includes('Máxima');
          });

          if (secaoMaxima) {
            const betElementsMax = secaoMaxima.querySelectorAll('.bg-green-500, span.bg-green-500');
            if (betElementsMax.length > 0) {
              betMaxima = betElementsMax[0].textContent.trim();
            }
          }

          return {
            gameName: foundGameName,
            betMin,
            betDefault,
            betMax,
            distribuicao,
            gameId,
            href,
            imageUrl,
            betBonus,
            betConexaoMin,
            betExtraMin,
            betPadrao1,
            betPadrao2,
            betMaxima
          };
        }, favoriteGame);

        if (gameData) {
          // VALIDAÇÃO RIGOROSA: Verificar se o jogo encontrado realmente corresponde ao nome buscado
          const foundName = gameData.gameName || '';
          const normalizedFound = foundName.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
          const normalizedSearched = favoriteGame.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
          
          console.log(`🔍 Validando correspondência:`);
          console.log(`   Buscado: "${favoriteGame}" (normalizado: "${normalizedSearched}")`);
          console.log(`   Encontrado: "${foundName}" (normalizado: "${normalizedFound}")`);
          
          // Verificar correspondência EXATA primeiro (mais confiável)
          const isExactMatch = normalizedFound === normalizedSearched;
          
          // Verificar se TODAS as palavras do nome buscado estão no nome encontrado
          const searchedWords = normalizedSearched.split(' ').filter(w => w.length > 1); // Palavras com mais de 1 caractere
          const foundWords = normalizedFound.split(' ').filter(w => w.length > 1);
          
          // TODAS as palavras do buscado devem estar no encontrado
          const allWordsMatch = searchedWords.length > 0 && 
            searchedWords.every(searchedWord => {
              // Verificar se a palavra está no nome encontrado (exata ou como substring)
              return foundWords.some(foundWord => {
                // Correspondência exata da palavra
                if (foundWord === searchedWord) return true;
                // Ou a palavra buscada está contida na palavra encontrada (ex: "fortune" em "fortunes")
                if (foundWord.includes(searchedWord) || searchedWord.includes(foundWord)) {
                  // Mas apenas se a diferença for pequena (ex: plural, singular)
                  const diff = Math.abs(foundWord.length - searchedWord.length);
                  return diff <= 2; // Permitir diferença de até 2 caracteres
                }
                return false;
              });
            });
          
          // Verificar correspondência parcial (mais restritiva)
          // O nome encontrado deve conter o nome buscado OU vice-versa
          // Mas apenas se tiverem pelo menos 60% de similaridade
          let isPartialMatch = false;
          if (normalizedFound.includes(normalizedSearched) || normalizedSearched.includes(normalizedFound)) {
            // Calcular similaridade: quantas palavras em comum
            const commonWords = searchedWords.filter(sw => 
              foundWords.some(fw => fw === sw || fw.includes(sw) || sw.includes(fw))
            );
            const similarity = commonWords.length / Math.max(searchedWords.length, foundWords.length);
            // Só aceitar se pelo menos 60% das palavras coincidem
            isPartialMatch = similarity >= 0.6;
          }
          
          // VALIDAÇÃO FINAL: Apenas aceitar se for correspondência exata OU todas as palavras coincidem
          // NÃO aceitar correspondência parcial para evitar erros como "Fortune Snake" -> "Gladiator's Glory"
          const isValidMatch = isExactMatch || allWordsMatch;
          
          if (!isValidMatch) {
            console.error(`❌ ERRO CRÍTICO: Jogo encontrado "${foundName}" NÃO corresponde ao buscado "${favoriteGame}"!`);
            console.error(`   - Correspondência exata: ${isExactMatch}`);
            console.error(`   - Todas palavras coincidem: ${allWordsMatch}`);
            console.error(`   - Correspondência parcial: ${isPartialMatch} (REJEITADA - muito permissiva)`);
            console.error(`   Pulando este jogo...`);
            errorCount++;
            // Limpar campo e continuar para próximo jogo
            await this.page.evaluate((input) => {
              if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, searchInput);
            await this.page.waitForTimeout(500);
            continue;
          }
          
          console.log(`✅ Validação passou: Jogo "${foundName}" corresponde a "${favoriteGame}"`);
          
          // Apenas PG Games é suportado
          const signal = {
            type: 'pg-game',
            index: results.length + 1,
            platform: 'PG GAMES',
            gameName: gameData.gameName,
            gameId: gameData.gameId,
            betDefault: gameData.betDefault,
            betMin: gameData.betMin,
            betMax: gameData.betMax,
            distribuicao: gameData.distribuicao,
            possibilidadesGanhos: gameData.distribuicao,
            betBonus: gameData.betBonus,
            betConexaoMin: gameData.betConexaoMin,
            betExtraMin: gameData.betExtraMin,
            betPadrao1: gameData.betPadrao1,
            betPadrao2: gameData.betPadrao2,
            betMaxima: gameData.betMaxima,
            href: gameData.href,
            imageUrl: gameData.imageUrl,
            text: `${gameData.gameName} - ${gameData.distribuicao}%`
          };

          results.push(signal);
          foundCount++;
          const matchType = isExactMatch ? 'exato' : (allWordsMatch ? 'palavras' : 'parcial');
          console.log(`✅ Jogo encontrado e adicionado: "${gameData.gameName}" (${foundCount}/${favoriteGames.length}) [Match: ${matchType}]`);

          // Se há callback, chamar imediatamente para enviar o sinal
          if (onGameFound && typeof onGameFound === 'function') {
            try {
              await onGameFound(signal);
              console.log(`📤 Sinal enviado para: "${gameData.gameName}"`);
            } catch (error) {
              const gameName = gameData?.gameName || favoriteGame || 'Jogo desconhecido';
              console.error(`❌ Erro ao processar callback para jogo "${gameName}": ${error.message}`);
              if (error.stack) {
                console.error(`   Detalhes: ${error.stack.substring(0, 200)}`);
              }
            }
          }
        } else {
          console.log(`⚠️ Jogo "${favoriteGame}" não encontrado nos resultados da busca`);
          errorCount++;
        }

        // Limpar o campo de busca completamente para próxima busca
        // Usar múltiplos métodos para garantir limpeza completa
        console.log(`🧹 Limpando campo de busca após processar "${favoriteGame}"...`);
        
        try {
          // Método 1: Limpar via evaluate
          await this.page.evaluate((input) => {
            if (input) {
              input.focus();
              input.value = '';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('keydown', { bubbles: true, key: 'Delete' }));
              input.dispatchEvent(new Event('keyup', { bubbles: true, key: 'Delete' }));
            }
          }, searchInput);
          await this.page.waitForTimeout(200);
          
          // Método 2: Limpar via teclado
          try {
            await searchInput.click({ clickCount: 3 });
            await this.page.waitForTimeout(100);
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            await this.page.waitForTimeout(100);
            await this.page.keyboard.press('Delete');
            await this.page.waitForTimeout(200);
          } catch (keyboardError) {
            // Ignorar erros de teclado
          }
          
          // Verificar se está realmente vazio
          const isEmpty = await this.page.evaluate((input) => {
            return input ? input.value.trim() === '' : false;
          }, searchInput);
          
          if (!isEmpty) {
            console.log(`⚠️ Campo ainda não está vazio. Tentando limpeza mais agressiva...`);
            // Re-encontrar o input e limpar novamente
            const freshInput = await this.page.$('input[placeholder*="Pesquise"], input[placeholder*="pesquise"], input[type="text"]');
            if (freshInput) {
              await freshInput.click({ clickCount: 3 });
              await this.page.waitForTimeout(100);
              await this.page.keyboard.press('Backspace');
              await this.page.keyboard.press('Delete');
              await this.page.evaluate((input) => {
                if (input) {
                  input.value = '';
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, freshInput);
              await this.page.waitForTimeout(200);
            }
          } else {
            console.log(`✅ Campo limpo com sucesso`);
          }
        } catch (clearError) {
          console.error(`⚠️ Erro ao limpar campo: ${clearError.message}`);
          // Se falhar ao limpar, tentar encontrar o input novamente
          const newSearchInput = await findSearchInput();
          if (newSearchInput) {
            await this.page.evaluate((input) => {
              if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, newSearchInput);
          }
        }
        
        // Aguardar um pouco antes de processar o próximo jogo para garantir estabilidade
        await this.page.waitForTimeout(400);

      } catch (error) {
        errorCount++;
        const errorMsg = error.message || '';
        
        // Se o erro for de contexto perdido, tentar recarregar a página
        if (errorMsg.includes('Cannot find context') || 
            errorMsg.includes('Execution context was destroyed') ||
            errorMsg.includes('Session closed')) {
          console.error(`❌ Erro ao buscar jogo "${favoriteGame}": Contexto do DOM perdido`);
          console.error(`   Tentando recarregar página e continuar...`);
          try {
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.page.waitForTimeout(2000);
            await this.acceptPopups();
            await this.page.waitForTimeout(1000);
            
            // Não precisa clicar em categoria pois já está em PG por padrão
            console.log(`✅ Página recarregada. Continuando com próximo jogo...`);
          } catch (reloadError) {
            console.error(`   Erro ao recarregar página: ${reloadError.message}`);
          }
        } else {
          console.error(`❌ Erro ao buscar jogo "${favoriteGame}": ${errorMsg}`);
          if (error.stack) {
            console.error(`   Detalhes: ${error.stack.substring(0, 200)}`);
          }
        }
      }
    }

    // Log final com resumo
    console.log(`\n📊 Resumo da busca de jogos favoritos:`);
    console.log(`   Total de jogos: ${favoriteGames.length}`);
    console.log(`   Processados: ${processedCount}`);
    console.log(`   Encontrados: ${foundCount}`);
    console.log(`   Erros: ${errorCount}`);
    console.log(`   Taxa de sucesso: ${((foundCount / favoriteGames.length) * 100).toFixed(1)}%\n`);
    
    return results;
  }

  async scrape(waitForNew = false, favoriteGames = null, category = 'PG', keepBrowserOpen = false, skipWaitForUpdate = false) {
    try {
      // Log para debug
      if (keepBrowserOpen) {
        // Log removido para reduzir verbosidade
      }

      // Se o navegador já está aberto, recarregar a página para garantir valores atualizados
      if (this.browser && this.page && !this.page.isClosed()) {
        console.log('🔄 Recarregando página para buscar valores atualizados do site...');
        try {
          // Aumentar timeout para 60 segundos e usar estratégia mais tolerante
          await this.page.reload({
            waitUntil: 'domcontentloaded',
            timeout: 60000 // Aumentado de 30s para 60s
          });
          await this.acceptPopups();
          // Aguardar um pouco para garantir que a página carregou completamente
          await this.page.waitForTimeout(1000);
        } catch (reloadError) {
          console.log('⚠️ Erro ao recarregar página (timeout):', reloadError.message);
          console.log('🔄 Tentando navegar novamente ao site ao invés de recarregar...');

          // Se reload falhou, tentar navegar novamente
          try {
            await this.navigateToSite();
            await this.acceptPopups();
            await this.page.waitForTimeout(1000);
            console.log('✅ Navegação alternativa bem-sucedida!');
          } catch (navError) {
            console.log('⚠️ Erro na navegação alternativa:', navError.message);
            console.log('🔄 Fechando e reinicializando navegador...');

            // Última tentativa: fechar e reinicializar
            try {
              await this.close();
            } catch (closeError) {
              // Ignorar erros ao fechar
            }

            await this.init();
            await this.navigateToSite();
            await this.acceptPopups();
            await this.page.waitForTimeout(1000);
            console.log('✅ Navegador reinicializado com sucesso!');
          }
        }
      } else {
        // Se não há navegador, inicializar
        await this.init();
        await this.navigateToSite();
        await this.acceptPopups();
      }

      // Se waitForNew é true, aguardar novos sinais antes de buscar
      if (waitForNew) {
        await this.waitForNewSignals(300000); // 5 minutos
      }

      // Se há jogos favoritos, usar busca por campo de pesquisa
      let signals = [];
      if (favoriteGames && favoriteGames.length > 0) {
        // Log removido para reduzir verbosidade
        signals = await this.searchFavoriteGames(favoriteGames, this.onGameFoundCallback || null, category);

        // Se não encontrou todos, buscar também pelo método normal
        if (signals.length < favoriteGames.length) {
          const normalSignals = await this.getSignalsBySelector(skipWaitForUpdate);
          // Adicionar apenas os que não foram encontrados na busca
          const foundNames = signals.map(s => (s.gameName || '').toLowerCase());
          normalSignals.forEach(signal => {
            const signalName = (signal.gameName || signal.title || '').toLowerCase();
            if (!foundNames.includes(signalName)) {
              signals.push(signal);
            }
          });
        }
      } else {
        // Buscar sinais normalmente (passar categoria)
        signals = await this.getSignalsBySelector(skipWaitForUpdate, category);
      }

      if (signals.length === 0) {
        signals = await this.getSignals();
      }

      // Adicionar informações do status card (apenas se não estiver pulando atualização para economizar tempo)
      if (!skipWaitForUpdate) {
        const statusInfo = await this.getStatusCardInfo();
        if (statusInfo) {
          signals.forEach(signal => {
            signal.statusInfo = {
              lastUpdate: statusInfo.lastUpdate,
              nextUpdate: statusInfo.nextUpdate
            };
          });
        }
      }

      return signals;
    } catch (error) {
      console.error('❌ Erro no scraping:', error);
      throw error;
    } finally {
      // Só fechar o navegador se não foi solicitado para mantê-lo aberto
      if (!keepBrowserOpen) {
        await this.close();
      } else {
        // Log removido para reduzir verbosidade
      }
    }
  }

  async monitorStatus(keepBrowserOpen = false) {
    // Método para monitorar continuamente o status sem fechar o navegador
    try {
      if (!this.browser || !this.page) {
        await this.init();
        await this.navigateToSite();
        await this.acceptPopups();
      }

      const statusInfo = await this.getStatusCardInfo();
      return statusInfo;
    } catch (error) {
      console.error('❌ Erro ao monitorar status:', error);
      if (!keepBrowserOpen) {
        await this.close();
      }
      return null;
    }
  }
}

export default SiteScraper;

