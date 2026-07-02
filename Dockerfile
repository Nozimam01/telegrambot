FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    && pip3 install --break-system-packages yt-dlp \
    && which yt-dlp \
    && yt-dlp --version \
    && rm -rf /var/lib/apt/lists/*

    RUN which yt-dlp && yt-dlp --version

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "start"]