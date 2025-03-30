require("dotenv").config();
const { Telegraf } = require("telegraf");
const LocalSession = require("telegraf-session-local");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(new LocalSession({ database: "session.json" }).middleware());
const YT_DLP_PATH = path.join(__dirname, "yt-dlp.exe");
const MP3_DIR = path.join(__dirname, "../public/mp3");
const MP4_DIR = path.join(__dirname, "../public/mp4");

if (!fs.existsSync(MP3_DIR)) fs.mkdirSync(MP3_DIR, { recursive: true });
if (!fs.existsSync(MP4_DIR)) fs.mkdirSync(MP4_DIR, { recursive: true });

function deleteFile(filePath) {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑 Deleted: ${filePath}`);
        }
    }, 5000);
}

function downloadVideo(url, chatId, ctx) {
    try {
        const fileId = Date.now();
        const fileName = `video_${fileId}.mp4`;
        const filePath = path.join(MP4_DIR, fileName);

        ctx.session[chatId] = { url, fileName };

        exec(`"${YT_DLP_PATH}" -o "${filePath}" "${url}"`, (error) => {
            if (error) {
                console.error("❌ Yuklab olishda xato:", error);
                return ctx.reply("❌ Video yuklab bo‘lmadi.");
            }

            ctx.replyWithVideo(
                { source: filePath },
                {
                    caption: `🎵 Musiqa yuklab olish uchun 👇👇\n[MediaDownloader](https://t.me/sector_downloader_bot)`,
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "🎵 Download Music", callback_data: `music_${fileId}` }
                        ]]
                    }
                }
            ).then(() => deleteFile(filePath));
        });
    } catch (error) {
        console.log(error);
    }
}

bot.on("callback_query", async (ctx) => {
    try {
        const chatId = ctx.callbackQuery.message.chat.id;
        const sessionData = ctx.session[chatId];

        if (!sessionData || !sessionData.url) {
            return ctx.answerCbQuery("❌ Musiqa URL topilmadi.");
        }

        const { url } = sessionData;
        const fileId = Date.now();
        const audioFile = `music_${fileId}.mp3`;
        const audioPath = path.join(MP3_DIR, audioFile);

        const loadingMessage = await ctx.reply("⏳ Musiqa yuklanmoqda...");

        exec(`"${YT_DLP_PATH}" -x --audio-format mp3 -o "${audioPath}" "${url}"`, async (error) => {
            if (error) {
                console.error("❌ Musiqa yuklab olishda xato:", error);
                await ctx.deleteMessage(loadingMessage.message_id);
                return ctx.reply("❌ Musiqa yuklab bo‘lmadi.");
            }

            await ctx.deleteMessage(loadingMessage.message_id);
            await ctx.replyWithAudio(
                { source: audioPath },
                {
                    caption: `📥 Yuklab olingan musiqa`,
                    parse_mode: "Markdown",
                }
            ).then(() => deleteFile(audioPath));
        });
    } catch (error) {
        console.error("❌ Callback query handlerda xatolik:", error);
    }
});

bot.on("text", async (ctx) => {
    const url = ctx.message.text;
    if (!url.includes("instagram.com") && !url.includes("youtube.com") && !url.includes("youtu.be")) {
        return ctx.reply("❌ Iltimos, faqat Instagram yoki YouTube havolasini yuboring.");
    }
    downloadVideo(url, ctx.chat.id, ctx);
});

(async () => {
    try {
        bot.launch();
        console.log("🚀 Bot ishga tushdi!");
    } catch (error) {
        console.error("❌ Botni ishga tushirishda xatolik:", error);
    }
})();

process.on('SIGINT', async () => {
    console.log("❌ Bot to‘xtatilmoqda...");
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log("❌ Bot server tomonidan to‘xtatildi...");
    bot.stop();
    process.exit(0);
});
