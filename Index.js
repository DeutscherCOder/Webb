const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware, um JSON und URL-encoded Daten zu verarbeiten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Startseite mit Eingabefeld
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Mein Render Proxy</title>
                <style>
                    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #222; color: #fff; }
                    form { text-align: center; }
                    input { padding: 10px; width: 300px; border-radius: 5px; border: none; }
                    button { padding: 10px 20px; border-radius: 5px; border: none; background: #007bff; color: white; cursor: pointer; }
                </style>
            </head>
            <body>
                <form action="/navigate" method="GET">
                    <h1>Web Surfer</h1>
                    <input type="text" name="url" placeholder="https://example.com" required />
                    <button type="submit">Los geht's</button>
                </form>
            </body>
        </html>
    `);
});

// Hilfsroute, um Formulareingaben umzuleiten
app.get('/navigate', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
    }
    res.redirect(`/proxy/${targetUrl}`);
});

// Die Haupt-Proxy-Logik
app.get('/proxy/*', async (req, res) => {
    // Die URL extrahieren (alles nach /proxy/)
    const rawUrl = req.params[0]; 
    // Falls Query-Parameter dabei waren (z.B. ?v=123 bei YouTube), müssen die wieder dran
    const queryParams = new URLSearchParams(req.query).toString();
    const targetUrl = queryParams ? `${rawUrl}?${queryParams}` : rawUrl;

    try {
        // Wir tun so, als wären wir ein normaler Browser (User-Agent Spoofing)
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            responseType: 'arraybuffer' // Wichtig für Bilder/Binärdaten
        });

        const contentType = response.headers['content-type'];

        // Wenn es HTML ist, müssen wir die Links umschreiben
        if (contentType && contentType.includes('text/html')) {
            const html = response.data.toString('utf-8');
            const $ = cheerio.load(html);
            const baseUrl = new URL(targetUrl);

            // Funktion zum Umschreiben von URLs
            const rewriteUrl = (originalLink) => {
                if (!originalLink) return originalLink;
                if (originalLink.startsWith('data:')) return originalLink; // Base64 ignorieren
                if (originalLink.startsWith('#')) return originalLink; // Anker ignorieren

                try {
                    // Absolute URL erstellen (falls relativ, z.B. /style.css)
                    const absoluteUrl = new URL(originalLink, baseUrl.href).href;
                    // Zurück auf unseren Proxy leiten
                    return `/proxy/${absoluteUrl}`;
                } catch (e) {
                    return originalLink;
                }
            };

            // Alle Links (a href), Bilder (img src), Skripte und Stylesheets umschreiben
            $('a').each((i, el) => { $(el).attr('href', rewriteUrl($(el).attr('href'))); });
            $('img').each((i, el) => { $(el).attr('src', rewriteUrl($(el).attr('src'))); });
            $('link').each((i, el) => { $(el).attr('href', rewriteUrl($(el).attr('href'))); });
            $('script').each((i, el) => { $(el).attr('src', rewriteUrl($(el).attr('src'))); });
            $('form').each((i, el) => { $(el).attr('action', rewriteUrl($(el).attr('action'))); });

            res.set('Content-Type', 'text/html');
            res.send($.html());
        } else {
            // Wenn es ein Bild, CSS oder JS ist, einfach durchleiten
            res.set('Content-Type', contentType);
            res.send(response.data);
        }

    } catch (error) {
        console.error(error);
        res.status(500).send(`Fehler beim Laden der Seite: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Proxy läuft auf Port ${PORT}`);
});
