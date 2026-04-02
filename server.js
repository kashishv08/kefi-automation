import http from "http";
import handler from "./api/script.js";

const PORT = 3000;

const server = http.createServer(async (req, res) => {
    // Add Vercel-like response helpers
    res.status = (statusCode) => {
        res.statusCode = statusCode;
        return res;
    };
    
    res.json = (data) => {
        if (!res.hasHeader("Content-Type")) {
            res.setHeader("Content-Type", "application/json");
        }
        res.end(JSON.stringify(data));
    };
    
    res.send = (data) => {
        if (!res.hasHeader("Content-Type")) {
            res.setHeader("Content-Type", "text/html");
        }
        res.end(data);
    };

    // Body parsing for POST requests
    if (req.method === "POST") {
        let body = "";
        req.on("data", chunk => {
            body += chunk.toString();
        });
        
        req.on("end", async () => {
            try {
                req.body = body ? JSON.parse(body) : {};
            } catch (e) {
                req.body = {};
            }
            // Forward to the Vercel handler
            await handler(req, res);
        });
    } else {
        // Fallback for non-POST if handler expects to handle it
        req.body = {};
        await handler(req, res);
    }
});

server.listen(PORT, () => {
    console.log(`Local test server running on http://localhost:${PORT}`);
    console.log(`You can test via Postman: POST http://localhost:${PORT} with JSON body {"url": "https://..."}`);
});
