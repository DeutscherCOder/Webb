const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Startseite
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Render Proxy Surfer</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #1a1a1a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .container { text-align: center; background: #2d2d2d; padding: 40px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                input { padding: 12px; width: 300px; border-radius: 5px; border: 1px solid #444; background: #333; color: white; margin-right: 10px; }
                button { padding: 12px 24px; border-radius: 5px; border: none; background: #e50914; color: white; cursor: pointer; font-weight: bold; }
                button:hover { background: #b20710; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Web Unblocker</h1>
                <form action="/navigate" method="GET">
                    <input type="text" name="url" placeholder="youtube.com" required>
                    <button type="submit">Surfen</button>
                </form>
                <p><small>Hinweis: YouTube funktioniert nur eingeschränkt (Sicherheits-Blockaden).</small></p>
            </div>
        </body>
        </html>
    `);
});

// Hilfsroute für die Eingabe
app.get('/navigate', (req, res) => {
    let target = req.query.url;
    if (!target.startsWith('http')) {
        target = 'https://' + target;
    }
    // Leite weiter zur Proxy-URL
    res.redirect(`/proxy/${target}`);
});

// Die Haupt-Logik
app.get('/proxy/*', async (req, res) => {
    // URL zusammenbasteln aus allem, was nach /proxy/ kommt
    const rawUrl = req.params[0];
    const queryParams = new URLSearchParams(req.query).toString();
    const targetUrl = queryParams ? `${rawUrl}?${queryParams}` : rawUrl;

    console.log(`Rufe auf: ${targetUrl}`);

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                // Wir tarnen uns als normaler Chrome Browser auf Windows
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': new URL(targetUrl).origin // Manche Seiten prüfen, woher man kommt
            },
            responseType: 'arraybuffer', // Wichtig für Bilder/Videos
            validateStatus: () => true // Auch Fehlerseiten (404) anzeigen
        });

        const contentType = response.headers['content-type'];

        // Wenn es eine Webseite (HTML) ist -> Links umschreiben
        if (contentType && contentType.includes('text/html')) {
            const html = response.data.toString('utf-8');
            const $ = cheerio.load(html);
            const baseUrl = new URL(targetUrl);

            // Diese Funktion macht aus jedem Link einen Renderer-Link
            const makeProxyUrl = (originalUrl) => {
                if (!originalUrl) return originalUrl;
                if (originalUrl.startsWith('data:')) return originalUrl;
                if (originalUrl.startsWith('#')) return originalUrl;
                
                try {
                    // Absolute URL berechnen (löst ../ und ./ auf)
                    const absolute = new URL(originalUrl, baseUrl.href).href;
                    return `/proxy/${absolute}`;
                } catch (e) {
                    return originalUrl;
                }
            };

            // HTML Tags bearbeiten
            // Links (a href)
            $('a').each((_, el) => {
                const href = $(el).attr('href');
                if (href) $(el).attr('href', makeProxyUrl(href));
            });

            // Bilder, Videos, Audio, Iframes, Scripts (src)
            $('img, video, audio, iframe, script, source').each((_, el) => {
                const src = $(el).attr('src');
                if (src) $(el).attr('src', makeProxyUrl(src));
            });

            // Formulare (action)
            $('form').each((_, el) => {
                const action = $(el).attr('action');
                if (action) $(el).attr('action', makeProxyUrl(action));
            });

            // CSS Links
            $('link[rel="stylesheet"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href) $(el).attr('href', makeProxyUrl(href));
            });

            res.set('Content-Type', 'text/html');
            res.send($.html());
        } else {
            // Bei Bildern, CSS, JS etc. einfach Daten durchreichen
            res.set('Content-Type', contentType);
            res.send(response.data);
        }

    } catch (error) {
        console.error("Proxy Fehler:", error.message);
        // Bei Fehler trotzdem eine Seite anzeigen
        res.status(500).send(`
            <div style="color:white; background:red; padding:20px;">
                <h2>Fehler beim Laden der Seite</h2>
                <p>Konnte ${targetUrl} nicht laden.</p>
                <p>Grund: ${error.message}</p>
                <a href="/" style="color:white;">Zurück zur Startseite</a>
            </div>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`Proxy Server läuft auf Port ${PORT}`);
});
