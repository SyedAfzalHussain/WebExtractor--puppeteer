const express = require('express');
const puppeteer = require('puppeteer'); // Puppeteer for headless browsing
const cors = require('cors');
const fs = require('fs');
const app = express();
const PORT = 3000;

app.use(cors());

// Helper function to extract emails using regex
function extractEmails(text) {
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return text.match(emailPattern) || [];
}
app.get('/extract-links', async (req, res) => {
    let baseUrl = req.query.url;
    console.log('Requested URL:', baseUrl);

    if (!baseUrl) {
        return res.status(400).send({ error: 'URL is required' });
    }

    let allLinks = [];

    try {
        const browser = await puppeteer.launch();

        for (let i = 0; i < 2000; i = i + 15) {
            const url = `${baseUrl}?fi=${i}`;  // Create the URL with the appropriate query parameter
            const page = await browser.newPage();

            let retries = 3;
            while (retries > 0) {
                try {
                    // Go to the page without timeout
                    await page.goto(url, { waitUntil: 'networkidle0' });
                    break; // If successful, exit the loop
                } catch (err) {
                    console.error(`Error navigating to ${url}: ${err}`);
                    if (err.message.includes('ERR_TOO_MANY_REDIRECTS')) {
                        console.error(`Too many redirects for URL: ${url}. Skipping...`);
                        retries = 0; // Skip this URL entirely
                    } else {
                        retries--;
                        if (retries === 0) {
                            console.log(`Skipping ${url} after multiple failed attempts`);
                        }
                    }
                }
            }

            if (retries === 0) {
                await page.close();
                continue; // Skip to the next iteration of the loop
            }

            // Extract links with the specified class name 'hz-pro-ctl'
            const links = await page.$$eval('a.hz-pro-ctl[href^="http"]', (anchors) => {
                return anchors.map(anchor => anchor.href);
            });

            allLinks = allLinks.concat(links);  // Concatenate the newly extracted links with the previous ones
            console.log(`Fetched ${links.length} links from page: ${url} and check for i = ${i} below cond : ${i % 15 === 0}`);

            if (i % 15 === 0) {
                const extractedLinks = [];
                for (const link of allLinks) {
                    const page = await browser.newPage();
                    let retriesInner = 3;

                    while (retriesInner > 0) {
                        try {
                            await page.goto(link, { waitUntil: 'domcontentloaded' }); // Go to each link without timeout
                            break; // If successful, exit the loop
                        } catch (err) {
                            console.error(`Error navigating to ${link}: ${err}`);
                            if (err.message.includes('ERR_TOO_MANY_REDIRECTS')) {
                                console.error(`Too many redirects for URL: ${link}. Skipping...`);
                                retriesInner = 0; // Skip this URL entirely
                            } else {
                                retriesInner--;
                                if (retriesInner === 0) {
                                    console.log(`Skipping ${link} after multiple failed attempts`);
                                }
                            }
                        }
                    }

                    if (retriesInner === 0) {
                        await page.close();
                        continue; // Skip to the next link
                    }

                    const extractedHref = await page.$$eval('.sc-mwxddt-0.hfcspU a', (anchors) => {
                        if (anchors.length > 0) {
                            return anchors[0].href;
                        }
                        return null;
                    });

                    if (extractedHref) {
                        extractedLinks.push(extractedHref);  // Save the extracted href link
                        console.log(`Extracted link from ${link}: ${extractedHref}`);
                    }

                    await page.close();
                }

                fs.appendFileSync('extractedLinks.txt', extractedLinks.join('\n') + '\n', 'utf-8');
                console.log(`Links up to ${i} saved to extractedLinks.txt`);

                allLinks = [];
            }
        }

        await browser.close();  // Close the browser instance

        // Final response after all links are processed
        res.send({ message: 'Links processed and saved to extractedLinks.txt' });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ error: 'Error fetching or parsing the URL' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
