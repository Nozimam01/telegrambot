require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const yts = require("yt-search");

//================ EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("Bot Running 🚀"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server:", PORT));

//================ BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

//================ TEMP =================
const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

//================ QUEUE =================
const queue = [];
let running = false;

function addJob(job) {
  queue.push(job);
  if (!running) worker();
}

async function worker() {
  running = true;

  while (queue.length > 0) {
    const job = queue.shift();

    const { ctx, url, type } = job;

    try {
      const msg = await ctx.telegram.sendMessage(
        ctx.chat.id,
        "⏳ Yuklanmoqda..."
      );

      const file = await download(url, type);

      if (type === "audio") {
        await ctx.telegram.sendAudio(ctx.chat.id, {
          source: file
        });
      } else {
        await ctx.telegram.sendDocument(ctx.chat.id, {
          source: file
        });
      }

      fs.unlinkSync(file);

      await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
    } catch (e) {
      console.log("JOB ERROR:", e.message);
      ctx.telegram.sendMessage(ctx.chat.id, "❌ Xatolik yuz berdi");
    }
  }

  running = false;
}

//================ DOWNLOAD ENGINE =================
function download(url, type = "video") {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const base = [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--restrict-filenames",
      "--socket-timeout", "15",
      "--retries", "2",
      "--fragment-retries", "2"
    ];

    const args =
      type === "audio"
        ? [...base, "-x", "--audio-format", "mp3", "-o", out, url]
        : [...base, "-f", "bv*+ba/b", "--merge-output-format", "mp4", "-o", out, url];

    const proc = execFile("yt-dlp", args);

    let done = false;

    proc.on("error", reject);

    proc.on("exit", (code) => {
      if (done) return;

      if (code !== 0) return reject(new Error("yt-dlp error"));

      const file = fs.readdirSync(DIR).find(f => f.includes(id));
      if (!file) return reject(new Error("File not found"));

      resolve(path.join(DIR, file));
    });

    setTimeout(() => {
      if (!done) {
        proc.kill("SIGKILL");
        reject(new Error("TIMEOUT"));
      }
    }, 5 * 60 * 1000);
  });
}

//================ START =================
bot.start((ctx) => {
  ctx.session = {};

  ctx.reply(
    "🎬 Media Bot",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Kino", "movie"),
        Markup.button.callback("🎵 Musiqa", "music")
      ]
    ])
  );
});

//================ MODE =================
bot.action("movie", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino nomi:");
});

bot.action("music", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomi:");
});

//================ SEARCH =================
async function search(ctx, q) {
  const r = await yts(q);
  const videos = r.videos.slice(0, 10);

  if (!videos.length) return ctx.reply("❌ Topilmadi");

  ctx.session.list = videos;

  ctx.reply(
    "📋 Natijalar",
    Markup.inlineKeyboard(
      videos.map((v, i) => [
        Markup.button.callback(`${i + 1}. ${v.title.slice(0, 30)}`, `sel_${i}`)
      ])
    )
  );
}

//================ TEXT =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (!ctx.session.mode)
    return ctx.reply("Avval menu tanlang");

  if (ctx.session.mode === "movie")
    return search(ctx, text + " trailer");

  if (ctx.session.mode === "music")
    return search(ctx, text);
});

//================ SELECT =================
bot.action(/sel_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  const url = `https://youtube.com/watch?v=${v.videoId}`;

  ctx.reply(
    "Format tanlang",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎥 Video", `vid_${ctx.match[1]}`),
        Markup.button.callback("🎵 MP3", `aud_${ctx.match[1]}`)
      ]
    ])
  );
});

//================ VIDEO =================
bot.action(/vid_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  addJob({
    ctx,
    url: `https://youtube.com/watch?v=${v.videoId}`,
    type: "video"
  });
});

//================ AUDIO =================
bot.action(/aud_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  addJob({
    ctx,
    url: `https://youtube.com/watch?v=${v.videoId}`,
    type: "audio"
  });
});

//================ LINK SUPPORT =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (/https?:\/\//.test(text)) {
    return ctx.reply(
      "Format:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "lvid"),
          Markup.button.callback("🎵 MP3", "laud")
        ]
      ])
    );
  }
});

bot.action("lvid", async (ctx) => {
  await ctx.answerCbQuery();

  addJob({
    ctx,
    url: ctx.session.link,
    type: "video"
  });
});

bot.action("laud", async (ctx) => {
  await ctx.answerCbQuery();

  addJob({
    ctx,
    url: ctx.session.link,
    type: "audio"
  });
});

//================ LAUNCH =================
bot.launch();
console.log("🚀 STABLE MEDIA BOT V3 RUNNING");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));