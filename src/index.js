require("dotenv").config();
const { Telegraf } = require("telegraf");
const LocalSession = require("telegraf-session-local");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(new LocalSession({ database: "session.json" }).middleware());
const YT_DLP_PATH = path.join(__dirname, "yt-dlp.exe");

// Video yuklab olish funksiyasi
function downloadVideo(url, chatId, ctx) {
    try {
        const fileId = Date.now();
        const fileName = `video_${fileId}.mp4`;

        // URL saqlab qo'yamiz
        ctx.session[chatId] = { url, fileName };

        exec(`"${YT_DLP_PATH}" -o ${fileName} "${url}"`, (error) => {
            if (error) {
                console.error("❌ Yuklab olishda xato:", error);
                return ctx.reply("❌ Video yuklab bo‘lmadi.");
            }

            ctx.replyWithVideo(
                { source: fileName },
                {
                    caption: `🎵 Musiqa yuklab olish uchun 👇👇\n@MediaDownloader`,
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "🎵 Download Music", callback_data: `music_${fileId}` }
                        ]]
                    }
                }
            );
        });
    } catch (error) {
        console.log(error);
    }
}

// Callback tugma bosilganda musiqa yuklab olish
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

        // ⏳ Yuklanmoqda... xabarini yuborish
        const loadingMessage = await ctx.reply("⏳");

        // **Musiqani yuklab olish**
        exec(`"${YT_DLP_PATH}" -x --audio-format mp3 -o "${audioFile}" "${url}"`, async (error) => {
            if (error) {
                console.error("❌ Musiqa yuklab olishda xato:", error);
                await ctx.deleteMessage(loadingMessage.message_id);
                return ctx.reply("❌ Musiqa yuklab bo‘lmadi.");
            }

            // ⏳ Yuklanmoqda... xabarini o‘chirish
            await ctx.deleteMessage(loadingMessage.message_id);

            // **Musiqani yuborish**
            await ctx.replyWithAudio(
                { source: audioFile },
                {
                    caption: `📥 Yuklab olingan musiqa`,
                    parse_mode: "Markdown",
                }
            );

            fs.unlinkSync(audioFile); // Faylni o‘chiramiz
        });

    } catch (error) {
        console.error("❌ Callback query handlerda xatolik:", error);
    }
});


// Botga link yuborilganda ishlaydi
bot.on("text", async (ctx) => {
    const url = ctx.message.text;
    if (!url.includes("instagram.com") && !url.includes("youtube.com") && !url.includes("youtu.be")) {
        return ctx.reply("❌ Iltimos, faqat Instagram yoki YouTube havolasini yuboring.");
    }

    downloadVideo(url, ctx.chat.id, ctx);
});

// Botni ishga tushirish
(async () => {
    try {
        bot.launch();
        console.log("🚀 Bot ishga tushdi!");
    } catch (error) {
        console.error("❌ Botni ishga tushirishda xatolik:", error);
    }
})();

// To‘xtatish eventlari
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
