require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const yts = require("yt-search");
const ffmpegPath = require("ffmpeg-static");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= SYSTEM =================

const isWindows = os.platform() === "win32";

const YTDLP = isWindows
  ? path.join(__dirname, "bin", "yt-dlp.exe")
  : "yt-dlp";

const FFMPEG = isWindows
  ? path.join(__dirname, "bin")
  : path.dirname(ffmpegPath);

// ================= SESSION =================

bot.use(session());

// ================= DOWNLOAD FOLDER =================

const DOWNLOAD_DIR = path.join(__dirname, "downloads");

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// ================= SAFE TEXT =================

function safeText(text = "") {
  return text
    .toString()
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .slice(0, 50);
}

// ================= FILTER =================

function cleanVideos(videos = []) {
  return videos
    .filter(v => v && v.videoId)
    .slice(0, 10);
}

// ================= LINK REGEX =================

const LINK_REGEX =
/(https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)\/\S+)/i;

// ================= START =================

bot.start(async (ctx) => {

    ctx.session.mode = null;
    ctx.session.movies = [];
    ctx.session.songs = [];
    ctx.session.link = null;

    await ctx.reply(
        "🎬 Assalomu alaykum!\n\nKerakli bo'limni tanlang.",
        Markup.inlineKeyboard([
            [
                Markup.button.callback("🎬 Kino", "mode_movie"),
                Markup.button.callback("🎵 Musiqa", "mode_music")
            ]
        ])
    );

});

// ================= MODE =================

bot.action("mode_movie", async (ctx)=>{

    await ctx.answerCbQuery();

    ctx.session.mode="movie";

    ctx.reply("🎬 Kino nomini yuboring.");

});

bot.action("mode_music", async (ctx)=>{

    await ctx.answerCbQuery();

    ctx.session.mode="music";

    ctx.reply("🎵 Qo'shiq nomini yuboring.");

});

// ================= SEARCH =================

async function searchMovie(ctx,query){

    try{

        const result=await yts(query+" official trailer");

        const videos=cleanVideos(result.videos);

        if(!videos.length)
            return ctx.reply("❌ Hech narsa topilmadi.");

        ctx.session.movies=videos;

        return ctx.reply(

            "🎬 Natijalar",

            Markup.inlineKeyboard(

                videos.map((video,index)=>[
                    Markup.button.callback(
                        safeText(video.title),
                        `movie_${index}`
                    )
                ])

            )

        );

    }catch(err){

        console.log(err);

        ctx.reply("❌ YouTube qidiruvida xatolik.");

    }

}

async function searchMusic(ctx,query){

    try{

        const result=await yts(query);

        const videos=cleanVideos(result.videos);

        if(!videos.length)
            return ctx.reply("❌ Hech narsa topilmadi.");

        ctx.session.songs=videos;

        return ctx.reply(

            "🎵 Natijalar",

            Markup.inlineKeyboard(

                videos.map((video,index)=>[
                    Markup.button.callback(
                        safeText(video.title),
                        `song_${index}`
                    )
                ])

            )

        );

    }catch(err){

        console.log(err);

        ctx.reply("❌ YouTube qidiruvida xatolik.");

    }

}

// ================= TEXT ROUTER =================

bot.on("text", async (ctx) => {
  try {
    const text = ctx.message.text.trim();

    if (LINK_REGEX.test(text)) {
      ctx.session.link = text;

      return ctx.reply(
        "📥 Formatni tanlang:",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("🎥 Video", "link_video"),
            Markup.button.callback("🎵 MP3", "link_mp3")
          ]
        ])
      );
    }

    if (!ctx.session.mode) {
      return ctx.reply("🎬 Avval Kino yoki 🎵 Musiqa bo'limini tanlang.");
    }

    if (ctx.session.mode === "movie") {
      return searchMovie(ctx, text);
    }

    if (ctx.session.mode === "music") {
      return searchMusic(ctx, text);
    }

  } catch (err) {
    console.log(err);
    ctx.reply("❌ Xatolik yuz berdi.");
  }
});

// ================= DOWNLOAD FUNCTION =================

function download(url, type) {

  return new Promise((resolve, reject) => {

    const base = Date.now();

    const output = path.join(
      DOWNLOAD_DIR,
      `${base}.%(ext)s`
    );

    let args = [];

    if (type === "audio") {

      args = [
        "-f",
        "bestaudio",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--ffmpeg-location",
        FFMPEG,
        "-o",
        output,
        url
      ];

    } else {

      args = [
        "-f",
        "bestvideo[height<=720]+bestaudio/best[height<=720]",
        "--merge-output-format",
        "mp4",
        "--ffmpeg-location",
        FFMPEG,
        "-o",
        output,
        url
      ];

    }

    execFile(
      YTDLP,
      args,
      (err) => {

        if (err)
          return reject(err);

        const file = fs.readdirSync(DOWNLOAD_DIR).find(f => {

          if (!f.startsWith(String(base)))
            return false;

          if (type === "audio")
            return f.endsWith(".mp3");

          return (
            f.endsWith(".mp4") ||
            f.endsWith(".mkv") ||
            f.endsWith(".webm")
          );

        });

        if (!file)
          return reject(new Error("FILE_NOT_FOUND"));

        resolve(
          path.join(DOWNLOAD_DIR, file)
        );

      }
    );

  });

}

// ================= LINK VIDEO =================

bot.action("link_video", async (ctx) => {

  await ctx.answerCbQuery();

  if (!ctx.session.link)
    return ctx.reply("❌ Link topilmadi.");

  await ctx.reply("📥 Video yuklanmoqda...");

  try {

    const file = await download(
      ctx.session.link,
      "video"
    );

    await ctx.replyWithVideo({
      source: file
    });

    fs.unlinkSync(file);

  } catch (err) {

    console.log(err);

    ctx.reply("❌ Video yuklab bo'lmadi.");

  }

});

// ================= LINK MP3 =================

bot.action("link_mp3", async (ctx) => {

  await ctx.answerCbQuery();

  if (!ctx.session.link)
    return ctx.reply("❌ Link topilmadi.");

  await ctx.reply("🎵 Audio yuklanmoqda...");

  try {

    const file = await download(
      ctx.session.link,
      "audio"
    );

    await ctx.replyWithAudio({
      source: file
    });

    fs.unlinkSync(file);

  } catch (err) {

    console.log(err);

    ctx.reply("❌ Audio yuklab bo'lmadi.");

  }

});

// ================= MOVIE DOWNLOAD =================

bot.action(/movie_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const video = ctx.session.movies?.[Number(ctx.match[1])];

  if (!video) {
    return ctx.reply("❌ Video topilmadi.");
  }

  await ctx.reply("🎬 Video yuklanmoqda...");

  try {
    const file = await download(
      `https://www.youtube.com/watch?v=${video.videoId}`,
      "video"
    );

    await ctx.replyWithVideo({
      source: file,
      caption: safeText(video.title)
    });

    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }

  } catch (err) {
    console.error(err);
    ctx.reply("❌ Video yuklab bo'lmadi.");
  }
});

// ================= SONG DOWNLOAD =================

bot.action(/song_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const song = ctx.session.songs?.[Number(ctx.match[1])];

  if (!song) {
    return ctx.reply("❌ Audio topilmadi.");
  }

  await ctx.reply("🎵 Audio yuklanmoqda...");

  try {
    const file = await download(
      `https://www.youtube.com/watch?v=${song.videoId}`,
      "audio"
    );

    await ctx.replyWithAudio({
      source: file,
      title: safeText(song.title),
      performer: safeText(song.author?.name || "Unknown")
    });

    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }

  } catch (err) {
    console.error(err);
    ctx.reply("❌ Audio yuklab bo'lmadi.");
  }
});

// ================= GLOBAL ERROR =================

bot.catch((err, ctx) => {
  console.error("BOT ERROR:", err);

  if (ctx) {
    ctx.reply("❌ Xatolik yuz berdi. Qayta urinib ko'ring.");
  }
});

// ================= START BOT =================

bot.launch()
  .then(() => {
    console.log("🚀 Telegram bot ishga tushdi.");
    console.log(`🖥 Platforma: ${process.platform}`);
  })
  .catch((err) => {
    console.error("Launch error:", err);
  });

// ================= STOP BOT =================

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));