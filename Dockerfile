FROM node:20-bookworm

# ffmpeg va python o'rnatish
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp o'rnatish
RUN pip3 install --break-system-packages yt-dlp

# Ishchi papka
WORKDIR /app

# package.json ni nusxalash
COPY package*.json ./

# npm paketlarni o'rnatish
RUN npm install

# Qolgan fayllarni nusxalash
COPY . .

# Port
EXPOSE 8080

# Botni ishga tushirish
CMD ["npm", "start"]