const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const logFile = fs.createWriteStream('out.log', { flags: 'a' });

const CAPTCHA_API_KEY = '2CAPTCHA_API_KEY';

const log = (message) => logFile.write(`${new Date().toISOString()} - ${message}\n`);

async function solveCaptcha(siteKey, pageUrl) {
    try {
        const response = await axios.post(
            `http://2captcha.com/in.php?key=${CAPTCHA_API_KEY}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`
        );

        const requestId = response.data.request;
        log(`Request to solve reCAPTCHA with ID: ${requestId}`);

        await new Promise(resolve => setTimeout(resolve, 20000));

        while (true) {
            const result = await axios.get(
                `http://2captcha.com/res.php?key=${CAPTCHA_API_KEY}&action=get&id=${requestId}&json=1`
            );

            if (result.data.status === 1) {
                log('reCAPTCHA solved successfully');
                return result.data.request;
            } else if (result.data.request !== 'CAPCHA_NOT_READY') {
                throw new Error('Failed to solve reCAPTCHA');
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    } catch (error) {
        log('Error solving reCAPTCHA: ' + error.message);
        throw error;
    }
}

async function loginAndDownloadProfilePic() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    try {
        log('Opening LinkedIn');
        await page.goto('https://www.linkedin.com/login');

        await page.type('#username', 'your_email');
        await page.type('#password', 'your_password');

        log('Clicking "Sign In" button');
        await page.click('[type="submit"]');
        await page.waitForNavigation();

        log('Checking login status');
        const loginError = await page.$('.form__input--error');
        if (loginError) {
            log('Login error. Check your credentials.');
            return;
        }

        const captchaElement = await page.$('.g-recaptcha');
        if (captchaElement) {
            log('reCAPTCHA detected. Solving using 2Captcha...');
            const siteKey = await page.evaluate(() => document.querySelector('.g-recaptcha').getAttribute('data-sitekey'));
            const captchaSolution = await solveCaptcha(siteKey, page.url());

            await page.evaluate(`document.getElementById("g-recaptcha-response").innerHTML="${captchaSolution}";`);

            log('reCAPTCHA solution inserted. Confirming...');
            await page.click('[type="submit"]');
            await page.waitForNavigation();
        }

        const profilePic = await page.$('img.profile-card-profile-picture');
        if (profilePic) {
            const profilePicSrc = await profilePic.getProperty('src');
            const profilePicUrl = await profilePicSrc.jsonValue();

            log('Profile picture URL obtained: ' + profilePicUrl);

            const imagePage = await browser.newPage();
            const viewSource = await imagePage.goto(profilePicUrl);
            fs.writeFileSync('profile_picture.jpg', await viewSource.buffer());

            log('Profile picture saved as profile_picture.jpg');
        } else {
            log('Profile picture not found');
        }

    } catch (error) {
        log('Error: ' + error.message);
    } finally {
        await browser.close();
    }
}

loginAndDownloadProfilePic();