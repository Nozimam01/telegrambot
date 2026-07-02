require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= EXPRESS =================
const app = express();

app.get("/", (req, res) => {
    res.send("Bot is running 🚀");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log("Server running on", PORT);
});

// ================= SESSION =================
bot.use(session());

bot.use((ctx, next) => {
    if (!ctx.session) ctx.session = {};
    return next();
});

// ================= TEMP =================
const DOWNLOAD_DIR = "/tmp";

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// ================= SAFE TEXT =================
function safeText(text = "") {
    return text
        .toString()
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
        .replace(/[\uD800-\uDFFF]/g, "")
        .slice(0, 60);
}

// ================= LINK REGEX =================
const LINK_REGEX =
/(https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)\/\S+)/i;

// ================= DOWNLOAD =================

function download(url, type) {

    return new Promise((resolve, reject) => {

        const base = Date.now();

        const output = path.join(DOWNLOAD_DIR, `${base}.%(ext)s`);

        const args =
            type === "audio"
                ? [
                      "-x",
                      "--audio-format",
                      "mp3",
                      "--ffmpeg-location",
                      "/usr/bin",
                      "-o",
                      output,
                      url
                  ]
                : [
                      "-f",
                      "bestvideo+bestaudio/best",
                      "--merge-output-format",
                      "mp4",
                      "--ffmpeg-location",
                      "/usr/bin",
                      "-o",
                      output,
                      url
                  ];

        execFile(
    "/usr/local/bin/yt-dlp",
    args,
    (err, stdout, stderr) => {
                const file = fs
                    .readdirSync(DOWNLOAD_DIR)
                    .find(f => f.startsWith(String(base)));

                if (!file)
                    return reject(new Error("Downloaded file not found"));

                resolve(path.join(DOWNLOAD_DIR, file));
            }
        );
    });
}

// ================= SEARCH =================

async function search(ctx, query, mode) {

    const result = await yts(query);

    const videos = result.videos
        .filter(v => v.videoId)
        .slice(0, 10);

    if (!videos.length)
        return ctx.reply("❌ Hech narsa topilmadi.");

    ctx.session.list = videos;

    return ctx.reply(

        "📌 Natijalar",

        Markup.inlineKeyboard(

            videos.map((v, i) => [

                Markup.button.callback(

                    safeText(v.title),

                    `${mode}_${i}`

                )

            ])

        )

    );

}

// ================= START =================

bot.start(async (ctx) => {

    ctx.session = {};

    return ctx.reply(

        "🎬 Media Botga xush kelibsiz!\n\nKerakli bo'limni tanlang.",

        Markup.inlineKeyboard([
            [
                Markup.button.callback("🎬 Kino", "movie_mode"),
                Markup.button.callback("🎵 Musiqa", "music_mode")
            ]
        ])

    );

});

// ================= MODE =================

bot.action("movie_mode", async (ctx) => {

    await ctx.answerCbQuery();

    ctx.session.mode = "movie";

    return ctx.reply("🎬 Kino nomini yuboring");

});

bot.action("music_mode", async (ctx) => {

    await ctx.answerCbQuery();

    ctx.session.mode = "music";

    return ctx.reply("🎵 Qo'shiq nomini yuboring");

});

// ================= TEXT =================

bot.on("text", async (ctx) => {

    const text = ctx.message.text.trim();

    if (LINK_REGEX.test(text)) {

        ctx.session.link = text;

        return ctx.reply(

            "📥 Formatni tanlang",

            Markup.inlineKeyboard([
                [
                    Markup.button.callback("🎥 Video", "download_video"),
                    Markup.button.callback("🎵 MP3", "download_audio")
                ]
            ])

        );

    }

    if (!ctx.session.mode) {

        return ctx.reply(
            "Avval 🎬 Kino yoki 🎵 Musiqa tugmasini tanlang."
        );

    }

    if (ctx.session.mode === "movie") {

        return search(
            ctx,
            text + " official trailer",
            "movie"
        );

    }

    if (ctx.session.mode === "music") {

        return search(
            ctx,
            text,
            "music"
        );

    }

});

// ================= MOVIE BUTTON =================

bot.action(/movie_(\d+)/, async (ctx) => {

    await ctx.answerCbQuery();

    const video = ctx.session.list?.[Number(ctx.match[1])];

    if (!video)
        return ctx.reply("❌ Topilmadi");

    try {

        await ctx.reply("⏳ Video yuklanmoqda...");

        const file = await download(

            `https://youtube.com/watch?v=${video.videoId}`,

            "video"

        );

        const size = fs.statSync(file).size;

        if (size > 49 * 1024 * 1024) {

            await ctx.replyWithDocument({

                source: file,

                filename: path.basename(file)

            });

        } else {

            await ctx.replyWithVideo({

                source: file,

                caption: safeText(video.title)

            });

        }

        fs.unlinkSync(file);

    }

    catch (e) {

        console.log(e);

        ctx.reply("❌ Video yuklab bo'lmadi");

    }

});

// ================= MUSIC BUTTON =================

bot.action(/music_(\d+)/, async (ctx) => {

    await ctx.answerCbQuery();

    const song = ctx.session.list?.[Number(ctx.match[1])];

    if (!song)
        return ctx.reply("❌ Topilmadi");

    try {

        await ctx.reply("⏳ MP3 yuklanmoqda...");

        const file = await download(

            `https://youtube.com/watch?v=${song.videoId}`,

            "audio"

        );

        await ctx.replyWithAudio({

            source: file,

            title: safeText(song.title),

            performer: safeText(song.author?.name || "Unknown")

        });

        fs.unlinkSync(file);

    }

    catch (e) {

        console.log(e);

        ctx.reply("❌ MP3 yuklab bo'lmadi");

    }

});


// ================= LINK DOWNLOAD VIDEO =================

bot.action("download_video", async (ctx) => {

    await ctx.answerCbQuery();

    const url = ctx.session.link;

    if (!url)
        return ctx.reply("❌ Link topilmadi");

    try {

        await ctx.reply("⏳ Video yuklanmoqda...");

        const file = await download(url, "video");

        const size = fs.statSync(file).size;

        if (size > 49 * 1024 * 1024) {

            await ctx.replyWithDocument({
                source: file,
                filename: path.basename(file)
            });

        } else {

            await ctx.replyWithVideo({
                source: file
            });

        }

        fs.unlinkSync(file);

    } catch (e) {

        console.log(e);

        ctx.reply("❌ Video yuklab bo'lmadi");

    }

});

// ================= LINK DOWNLOAD AUDIO =================

bot.action("download_audio", async (ctx) => {

    await ctx.answerCbQuery();

    const url = ctx.session.link;

    if (!url)
        return ctx.reply("❌ Link topilmadi");

    try {

        await ctx.reply("🎵 MP3 yuklanmoqda...");

        const file = await download(url, "audio");

        await ctx.replyWithAudio({
            source: file
        });

        fs.unlinkSync(file);

    } catch (e) {

        console.log(e);

        ctx.reply("❌ MP3 yuklab bo'lmadi");

    }

});



const { execSync } = require("child_process");

try {
    console.log("YT-DLP PATH:", execSync("which yt-dlp").toString());
    console.log("YT-DLP VERSION:", execSync("yt-dlp --version").toString());
} catch (e) {
    console.error("YT-DLP NOT FOUND", e);
}

// ================= LAUNCH =================

bot.launch({
    dropPendingUpdates: true
});

console.log("🚀 BOT FULLY RUNNING");

// ================= STOP =================

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));