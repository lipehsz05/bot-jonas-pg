# Usar imagem Node.js oficial
FROM node:20-slim

# Instalar Chromium e dependências necessárias
RUN apt-get update && apt-get install -y \
  chromium \
  chromium-driver \
  fonts-liberation \
  libnss3 \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libxss1 \
  libasound2 \
  libgbm1 \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /home/node

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências do Node.js
RUN npm ci --only=production

# Copiar código da aplicação
COPY . .

# Criar diretório para autenticação do WhatsApp
RUN mkdir -p .wwebjs_auth && chown -R node:node /home/node

# Mudar para usuário não-root
USER node

# Expor porta (se necessário)
# EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "start"]
