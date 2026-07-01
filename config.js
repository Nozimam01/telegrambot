module.exports = {
    apps: [
        {
            name: "media-bot",
            script: "./bot.js",
            watch: false,
            autorestart: true,
            max_restarts: 10,
            env: {
                NODE_ENV: "production",
                BOT_TOKEN: process.env.BOT_TOKEN,
                ADMIN1: process.env.ADMIN1,
                ADMIN2: process.env.ADMIN2,
                ADMIN3: process.env.ADMIN3,
                PORT: process.env.PORT || 4000
            }
        }
    ]
};