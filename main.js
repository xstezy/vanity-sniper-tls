"use strict";

const tls = require("tls");
const WebSocket = require("ws");
const net = require("net");
const extractJsonFromString = require("extract-json-from-string");
const fs = require("fs").promises;

const tlsSocket = tls.connect({
    host: "canary.discord.com",
    port: 443,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.2",
    rejectUnauthorized: false,
    handshakeTimeout: 1000,
    servername: "canary.discord.com",
});

let vanity;
let mfaToken = "";
const guilds = {};
const token = "NjY1NjY0MDIyNzI0NDc2OTM5.GBHrcU.87MNauR3QcdBxYBUqqrEG_BOcXobdeQ1jLy6RQ";
const server = "1367979026697945248";
const channel = "1376273162479599786";

async function updateMfaToken() {
    try {
        const content = await fs.readFile("mfa_token.txt", "utf8");
        mfaToken = content.trim();
        console.log("[MFA TOKEN] Güncellendi:", mfaToken.slice(0, 10) + "...");
    } catch (err) {
        console.log("MFA token okunamadı:", err.message);
    }
}
updateMfaToken();
setInterval(updateMfaToken, 30000);

tlsSocket.on("data", async (data) => {
    const ext = extractJsonFromString(data.toString());
    const find = ext.find((e) => e.code || e.message);

    if (find) {
        const requestBody = JSON.stringify({
            content: `@everyone ${vanity}\n\`\`\`json\n${JSON.stringify(find)}\n\`\`\``,
        });
        const contentLength = Buffer.byteLength(requestBody);
        tlsSocket.write(
            `POST /api/channels/${channel}/messages HTTP/1.1\r\n` +
            `Host: canary.discord.com\r\n` +
            `Authorization: ${token}\r\n` +
            `Content-Type: application/json\r\n` +
            `Content-Length: ${contentLength}\r\n` +
            `\r\n` +
            requestBody
        );
    }
});

tlsSocket.on("error", (error) => {
    console.log(`TLS Error`, error);
    process.exit();
});

tlsSocket.on("end", () => {
    console.log("TLS Connection Closed");
    process.exit();
});

tlsSocket.on("secureConnect", () => {
    const websocket = new WebSocket("wss://gateway.discord.gg/");

    websocket.onclose = (event) => {
        console.log(`WebSocket Connection Closed ${event.reason} ${event.code}`);
        process.exit();
    };

    websocket.onmessage = (message) => {
        const { d, op, t } = JSON.parse(message.data);

        if (t === "GUILD_UPDATE") {
            const find = guilds[d.guild_id];
            if (find && find !== d.vanity_url_code) {
                const requestBody = JSON.stringify({ code: find });
                tlsSocket.write(
                    `PATCH /api/v6/guilds/${server}/vanity-url HTTP/1.1\r\n` +
                    `Host: canary.discord.com\r\n` +
                    `Authorization: ${token}\r\n` +
                    `User-Agent: Chrome/124\r\n` +
                    `X-Super-Properties: eyJicm93c2VyIjoiQ2hyb21lIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiQ2hyb21lIiwiY2xpZW50X2J1aWxkX251bWJlciI6MzU1NjI0fQ==\r\n` +
                    `Content-Type: application/json\r\n` +
                    `X-Discord-MFA-Authorization: ${mfaToken}\r\n` +
                    `Content-Length: ${requestBody.length}\r\n` +
                    `\r\n` +
                    requestBody
                );
                vanity = find;
            }
        } else if (t === "READY") {
            d.guilds.forEach((guild) => {
                if (guild.vanity_url_code) {
                    guilds[guild.id] = guild.vanity_url_code;
                }
            });
            console.log(guilds);
        } else if (op === 10) {
            websocket.send(JSON.stringify({
                op: 2,
                d: {
                    token: token,
                    intents: 513 << 0,
                    properties: {
                        os: "linux",
                        browser: "firefox",
                        device: "firefox",
                    },
                },
            }));
            setInterval(() => websocket.send(JSON.stringify({ op: 1, d: {}, s: null, t: "heartbeat" })), d.heartbeat_interval);
        } else if (op === 7) {
            process.exit();
        }
    };
});

setInterval(() => {
    tlsSocket.write("GET / HTTP/1.1\r\nHost: canary.discord.com\r\n\r\n");
}, 500);

net.createServer((s) => {
    s.on("data", (c) => {
        if (c.includes("POST /mfa-update")) {
            try {
                const body = c.subarray(c.indexOf("\r\n\r\n") + 4).toString();
                const { mfaToken: newToken } = JSON.parse(body);
                if (newToken) {
                    mfaToken = newToken;
                    s.end("HTTP/1.1 200 OK\r\n\r\n{\"success\":true}");
                    console.log("MFA Token Güncellendi (manuel post):", mfaToken.slice(0, 10) + "...");
                } else {
                    s.end("HTTP/1.1 400 Bad Request\r\n\r\n");
                }
            } catch (e) {
                s.end("HTTP/1.1 400 Bad Request\r\n\r\n");
                console.log("MFA Güncelleme Hatası:", e.message);
            }
        }
    });
}).listen(6977);

const restartSocket = net.connect(8006, "localhost")
    .on("error", () => { console.log("Restart Bağlantı Hatası"); })
    .on("connect", () => {
        restartSocket.end(
            "POST /restart HTTP/1.1\r\n" +
            "Host: localhost\r\n" +
            "Content-Type: application/json\r\n" +
            "Content-Length: 16\r\n" +
            "\r\n" +
            '{"restart":true}'
        );
        console.log("Restart İsteği Gönderildi");
    });
