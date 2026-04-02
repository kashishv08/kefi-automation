import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

const ORG_ID = "fbb76062-fc40-4565-9aab-fc67c2a1d1bc";
const COOKIE = "__Secure-next-auth.session-token=e0c4f1b9-1d21-4b8d-8078-5d9aaf203f22";

const limit = pLimit(3);

// --- helpers ----
async function fetchHTML(url) {
    const { data } = await axios.get(url);
    return data;
}

function base64ToBuffer(base64) {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return null;

    return {
        mime: match[1],
        buffer: Buffer.from(match[2], "base64")
    };
}

function getExtensionFromMime(mime) {
    if (mime === "image/png") return "png";
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    return "png";
}

async function getUploadUrl(mime) {
    const ext = getExtensionFromMime(mime);
    const filename = `image-${Date.now()}.${ext}`;

    const res = await axios.post(
        "https://app.heymantle.com/api/organizations/assets/upload",
        {
            filename,
            contentType: mime
        },
        {
            headers: {
                "Content-Type": "application/json",
                "x-mantle-org-id": ORG_ID,
                cookie: COOKIE,
                origin: "https://app.heymantle.com",
                referer: "https://app.heymantle.com/",
                "user-agent": "Mozilla/5.0"
            }
        }
    );

    return res.data;
}

async function uploadToSignedUrl(signedUrl, buffer, mime) {
    await axios.put(signedUrl, buffer, {
        headers: { "Content-Type": mime },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });
}

async function processImage($, img) {
    const src = $(img).attr("src");
    if (!src || !src.startsWith("data:image")) return;

    try {
        const file = base64ToBuffer(src);
        if (!file) return;

        const uploadData = await getUploadUrl(file.mime);

        await uploadToSignedUrl(uploadData.signedUrl, file.buffer, file.mime);

        $(img).attr("src", uploadData.downloadUrl);

    } catch (err) {
        console.error("ERROR:", err.response?.data || err.message);
    }
}

async function processPage(url) {
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const container = $(".content.ql-editor");
    if (!container.length) throw new Error("Content container not found");

    const images = container.find("img").toArray();

    await Promise.all(
        images.map((img) => limit(() => processImage($, img)))
    );

    const iframes = container.find("iframe").toArray();
    iframes.forEach((iframe) => {
        let src = $(iframe).attr("src");
        if (src) {
            try {
                const urlObj = new URL(src);
                if (urlObj.searchParams.get("origin") === "https://keficommerce.user.com") {
                    urlObj.searchParams.delete("origin");
                    $(iframe).attr("src", urlObj.toString());
                }
            } catch (e) {
                // Fallback for relative URLs or anything URL constructor can't parse
                src = src.replace("?origin=https://keficommerce.user.com&", "?")
                           .replace("?origin=https://keficommerce.user.com", "")
                           .replace("&origin=https://keficommerce.user.com", "");
                $(iframe).attr("src", src);
            }
        }
    });

    return container.html();
}

// ============ ✅ NEW VERCEL HANDLER (ESM) ============

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Use POST only" });
        }

        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "Missing URL" });

        const resultHTML = await processPage(url);

        return res.status(200).send(resultHTML);

    } catch (err) {
        console.error("API ERROR:", err);
        return res.status(500).json({ error: err.message });
    }
}