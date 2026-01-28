import fs from 'fs';
import path from 'path';

class ConfigManager {
  constructor() {
    this.configFile = path.join(process.cwd(), 'bot-config.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const config = JSON.parse(data);
        // Log removido para reduzir verbosidade
        return config;
      } else {
        // Log removido para reduzir verbosidade
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configurações do cache:', error);
      console.log('📂 Usando configurações padrão.');
    }
    
    // Configurações padrão
    const defaultConfig = {
      siteName: process.env.SITE_NAME || 'Rei dos Slots Sinais',
      affiliateLink: process.env.AFFILIATE_LINK || '',
      categories: {
        PG: true,
        PP: true,
        WG: true
      },
      botRunning: true,
      currentRotation: 'FAVORITES' // FAVORITES, RANDOM
    };
    
    // Salvar configurações padrão no cache na primeira vez
    this.config = defaultConfig;
    this.saveConfig();
    console.log('💾 Configurações padrão salvas no cache.');
    
    return defaultConfig;
  }

  saveConfig() {
    try {
      // Garantir que o diretório existe
      const dir = path.dirname(this.configFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Salvar configurações
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('❌ Erro ao salvar configurações no cache:', error);
      console.error('   Arquivo:', this.configFile);
      return false;
    }
  }

  getSiteName() {
    // Recarregar do arquivo para garantir valores atualizados
    this.reloadConfig();
    return this.config.siteName || process.env.SITE_NAME || 'Rei dos Slots Sinais';
  }

  getAffiliateLink() {
    // Recarregar do arquivo para garantir valores atualizados
    this.reloadConfig();
    return this.config.affiliateLink || process.env.AFFILIATE_LINK || '';
  }

  // Método para recarregar configurações do arquivo sem logar
  reloadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const config = JSON.parse(data);
        // Atualizar todas as configurações do arquivo
        this.config = config;
      }
    } catch (error) {
      // Ignorar erros silenciosamente ao recarregar
      // Se houver erro, manter configurações atuais em memória
    }
  }

  setSiteName(name) {
    this.config.siteName = name;
    const saved = this.saveConfig();
    if (saved) {
      console.log(`💾 Nome do site salvo no cache: ${name}`);
    } else {
      console.error('❌ Erro ao salvar nome do site no cache');
    }
    return saved;
  }

  setAffiliateLink(link) {
    this.config.affiliateLink = link;
    const saved = this.saveConfig();
    if (saved) {
      console.log(`💾 Link afiliado salvo no cache: ${link}`);
    } else {
      console.error('❌ Erro ao salvar link afiliado no cache');
    }
    return saved;
  }

  getConfig() {
    return {
      siteName: this.getSiteName(),
      affiliateLink: this.getAffiliateLink(),
      categories: this.getCategories(),
      botRunning: this.isBotRunning(),
      currentRotation: this.getCurrentRotation()
    };
  }

  // Métodos para categorias
  getCategories() {
    return this.config.categories || {
      WG: true
    };
  }

  setCategory(category, enabled) {
    if (!this.config.categories) {
      this.config.categories = {};
    }
    this.config.categories[category.toUpperCase()] = enabled;
    return this.saveConfig();
  }

  isCategoryEnabled(category) {
    const categories = this.getCategories();
    return categories[category.toUpperCase()] !== false;
  }

  // Métodos para status do bot
  isBotRunning() {
    return this.config.botRunning !== false;
  }

  setBotRunning(running) {
    this.config.botRunning = running;
    return this.saveConfig();
  }

  // Métodos para rotação (agora usado para alternar entre favoritos e aleatórios)
  getCurrentRotation() {
    return this.config.currentRotation || 'FAVORITES';
  }

  setCurrentRotation(rotation) {
    this.config.currentRotation = rotation;
    return this.saveConfig();
  }

  toggleRotation() {
    const current = this.getCurrentRotation();
    const next = current === 'FAVORITES' ? 'RANDOM' : 'FAVORITES';
    this.setCurrentRotation(next);
    return next;
  }

  isFavoritesMode() {
    return this.getCurrentRotation() === 'FAVORITES';
  }

  isRandomMode() {
    return this.getCurrentRotation() === 'RANDOM';
  }
}

export default ConfigManager;

