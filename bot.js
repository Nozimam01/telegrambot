require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const yts = require("yt-search");

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("🔥 V13 PRO BOT RUNNING"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("PORT:", PORT));

// ================= BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

// ================= TEMP =================
const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

// ================= JOB CONTROL =================
const queue = [];
let running = false;

// ================= QUEUE =================
function addJob(job) {
  queue.push(job);
  if (!running) worker();
}

async function worker() {
  running = true;

  while (queue.length) {
    const job = queue.shift();
    const msg = await job.ctx.reply("⏳ Fayl yuklab olinmoqda va tayyorlanyapti, iltimos kuting...").catch(() => null);

    try {
      const file = await download(job.url, job.type);

      if (msg) {
        await job.ctx.telegram.editMessageText(job.ctx.chat.id, msg.message_id, null, "🚀 Fayl tayyor! Telegramga yuborilmoqda...").catch(() => {});
      }

      if (job.type === "audio") {
        await job.ctx.replyWithAudio({
          source: file,
          title: job.title || "Audio",
          performer: job.author || "Unknown"
        });
      } else {
        await job.ctx.replyWithVideo({
          source: file,
          caption: job.title || "Video"
        });
      }

      if (fs.existsSync(file)) fs.unlinkSync(file);
      if (msg) await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    } catch (e) {
      console.log("DOWNLOAD ERROR:", e.message);
      
      let errorText = "❌ Yuklab bo'lmadi yoki xatolik yuz berdi.";
      if (e.message === "TOO_LARGE") {
        errorText = "⚠️ Fayl hajmi juda katta! Maksimal limit: 2 GB.";
      } else if (e.message === "TIMEOUT") {
        errorText = "❌ Kutish vaqti tugadi (Timeout). Server yuklamani yakunlay olmadi.";
      }

      job.ctx.reply(errorText);
      if (msg) await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    }
  }

  running = false;
}

// ================= OPTIMIZED DOWNLOAD WITH 2GB LIMIT =================
function download(url, type) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const commonArgs = [
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      "--socket-timeout", "20",
      "--retries", "3",
      "--fragment-retries", "5",
      "--max-filesize", "2G", // <--- MANA SHU YERDA MAX 2GB LIMIT QO'YILDI (2G = 2 Gigabayt)
      "--extractor-args", "youtube:player_client=android,web", 
      "-o", out,
      url
    ];

    let specificArgs = [];
    if (type === "audio") {
      specificArgs = ["-x", "--audio-format", "mp3", "--audio-quality", "5"];
    } else {
      specificArgs = ["-f", "bv[height<=480][ext=mp4]+ba[ext=m4a]/b[ext=mp4]"];
    }

    const args = ["yt-dlp", ...specificArgs, ...commonArgs];
    const proc = spawn(args[0], args.slice(1));
    let killed = false;
    let isTooLarge = false;

    // yt-dlp xatoliklarini kuzatish
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      // Agar yt-dlp fayl hajmi kattaligi uchun to'xtasa
      if (s.includes("File is larger than max-filesize")) {
        isTooLarge = true;
      }
    });

    // 2GB faylni yuklash uchun Railway/Render'ga vaqt kerak, shuning uchun timeoutni 7 daqiqa qildik
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
      reject(new Error("TIMEOUT"));
    }, 420000); 

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;
      
      if (isTooLarge) {
        return reject(new Error("TOO_LARGE"));
      }

      if (code !== 0) return reject(new Error(`yt-dlp failed with code ${code}`));

      const file = fs.readdirSync(DIR).find(f => f.includes(id));
      if (!file) return reject(new Error("File not found"));

      resolve(path.join(DIR, file));
    });
  });
}

// ================= START =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply(
    "🚀 V13 PRO MEDIA BOT",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Kino (Trailer)", "movie"),
        Markup.button.callback("🎵 Musiqa", "music")
      ]
    ])
  );
});

// ================= MODE =================
bot.action("movie", (ctx) => {
  ctx.session.mode = "movie";
  ctx.answerCbQuery();
  ctx.reply("🎬 Kino nomini yozing (Sizga uning trailerini topib beraman):");
});

bot.action("music", (ctx) => {
  ctx.session.mode = "music";
  ctx.answerCbQuery();
  ctx.reply("🎵 Qo‘shiq nomini yozing:");
});

// ================= SEARCH =================
async function search(ctx, q) {
  try {
    const r = await yts(q);
    const videos = r.videos.slice(0, 8);
    if (!videos.length) return ctx.reply("Hech narsa topilmadi 😕");

    ctx.session.list = videos;

    return ctx.reply(
      "📋 Natijalar:",
      Markup.inlineKeyboard(
        videos.map((v, i) => [
          Markup.button.callback(v.title.slice(0, 35), `sel_${i}`)
        ])
      )
    );
  } catch (err) {
    ctx.reply("Qidiruvda xatolik yuz berdi.");
  }
}

// ================= TEXT =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (/https?:\/\//.test(text)) {
    ctx.session.link = text;
    return ctx.reply(
      "📥 Format:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "link_video"),
          Markup.button.callback("🎵 MP3", "link_audio")
        ]
      ])
    );
  }

  if (!ctx.session.mode)
    return ctx.reply("Avval Kino yoki Musiqa tanlang");

  const q = ctx.session.mode === "movie" ? text + " trailer" : text;
  await search(ctx, q);
});

// ================= SELECT =================
bot.action(/sel_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return ctx.reply("Ma'lumot topilmadi, qaytadan urinib ko'ring.");

  const url = `https://youtube.com/watch?v=${v.videoId}`;
  addJob({
    ctx,
    url,
    type: ctx.session.mode === "music" ? "audio" : "video",
    title: v.title,
    author: v.author?.name
  });
});

// ================= LINK =================
bot.action("link_video", (ctx) => {
  ctx.answerCbQuery();
  addJob({ ctx, url: ctx.session.link, type: "video" });
});

bot.action("link_audio", (ctx) => {
  ctx.answerCbQuery();
  addJob({ ctx, url: ctx.session.link, type: "audio" });
});

// ================= LAUNCH =================
bot.launch().then(() => console.log("🔥 V13 PRO STABLE READY"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));