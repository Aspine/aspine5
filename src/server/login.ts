import { randomUUID } from "node:crypto";
import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import {
	AFTER_CLICK_MS,
	AFTER_EMAIL_TIMEOUT_MS,
	AFTER_PASSWORD_TIMEOUT_MS,
	ASPEN_LOGIN_URL,
	BEFORE_CLICK_MS,
	BROWSER_ARGS,
	CAPTCHA_TTL_MS,
	HEADLESS,
	NAVIGATION_TIMEOUT_MS,
	SELECTOR_TIMEOUT_MS,
	VIEWPORT
} from "@/config";

puppeteer.use(stealthPlugin());

const EMAIL_INPUT = "#identifierId";
const PASSWORD_INPUT = 'input[type="password"]:not([aria-hidden="true"])';
const CAPTCHA_IMAGE = "#captchaimg";
const CAPTCHA_INPUT = 'input[name="ca"]';

export type LoginResult =
	{ sessionId: string } | { loginId: string; captcha: string };

let browser: Promise<Browser> | null = null;
const pendingCaptchas = new Map<string, { page: Page; loginUrl: string }>();

const getBrowser = () =>
	(browser ??= (
		puppeteer.launch({
			headless: HEADLESS,
			args: BROWSER_ARGS
		}) as unknown as Promise<Browser>
	).catch(error => {
		browser = null;
		throw error;
	}));

export const closeBrowser = async () => {
	const current = browser;
	browser = null;
	await (await current)?.close();
};

const typeInto = async (page: Page, selector: string, value: string) => {
	const input = await page.waitForSelector(selector, {
		visible: true,
		timeout: SELECTOR_TIMEOUT_MS
	});
	await Bun.sleep(BEFORE_CLICK_MS);
	await input!.click();
	await Bun.sleep(AFTER_CLICK_MS);
	await input!.type(value);
	await input!.press("Enter");
};

const waitForAspen = async (page: Page, loginUrl: string) => {
	const aspenHost = new URL(loginUrl).hostname;
	const deadline = Date.now() + AFTER_PASSWORD_TIMEOUT_MS;
	const onAspen = () => {
		const url = new URL(page.url());
		return (
			url.hostname === aspenHost && !/logon|saml|sso/i.test(url.pathname)
		);
	};
	while (!onAspen()) {
		if (Date.now() > deadline) throw new Error(`stuck at ${page.url()}`);
		await Bun.sleep(200);
	}
	await page
		.waitForNetworkIdle({ idleTime: 300, timeout: SELECTOR_TIMEOUT_MS })
		.catch(() => undefined);
};

const readSessionId = async (page: Page) => {
	const fromUrl = /jsessionid=([^;?&#/]+)/i.exec(page.url())?.[1];
	const cookies = await page.browserContext().cookies();
	const sessionId =
		fromUrl ?? cookies.find(cookie => cookie.name === "JSESSIONID")?.value;
	if (!sessionId) throw new Error("no JSESSIONID");
	return sessionId;
};

const submitPassword = async (
	page: Page,
	password: string,
	loginUrl: string
): Promise<LoginResult> => {
	await typeInto(page, PASSWORD_INPUT, password);
	await waitForAspen(page, loginUrl);
	return { sessionId: await readSessionId(page) };
};

const holdCaptcha = async (
	page: Page,
	loginUrl: string
): Promise<LoginResult> => {
	await page.waitForFunction(
		selector =>
			document.querySelector<HTMLImageElement>(selector)?.complete,
		{ timeout: SELECTOR_TIMEOUT_MS },
		CAPTCHA_IMAGE
	);
	const image = await (await page.$(CAPTCHA_IMAGE))!.screenshot({
		encoding: "base64"
	});
	const loginId = randomUUID();
	pendingCaptchas.set(loginId, { page, loginUrl });
	setTimeout(() => {
		if (pendingCaptchas.delete(loginId)) void page.browserContext().close();
	}, CAPTCHA_TTL_MS);
	return { loginId, captcha: `data:image/png;base64,${image}` };
};

const run = async (page: Page, steps: () => Promise<LoginResult>) => {
	try {
		const result = await steps();
		if ("sessionId" in result) await page.browserContext().close();
		return result;
	} catch (error) {
		await page
			.browserContext()
			.close()
			.catch(() => undefined);
		throw error;
	}
};

export const startLogin = async (
	username: string,
	password: string,
	loginUrl = ASPEN_LOGIN_URL
) => {
	const context = await (await getBrowser()).createBrowserContext();
	const page = await context.newPage();
	return run(page, async () => {
		await page.setViewport(VIEWPORT);
		page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
		await page.goto(loginUrl);
		await typeInto(page, EMAIL_INPUT, username);
		const next = await page.waitForSelector(
			`${CAPTCHA_IMAGE}, ${PASSWORD_INPUT}`,
			{ visible: true, timeout: AFTER_EMAIL_TIMEOUT_MS }
		);
		return (await next!.evaluate(element => element.id === "captchaimg"))
			? holdCaptcha(page, loginUrl)
			: submitPassword(page, password, loginUrl);
	});
};

export const continueLogin = async (
	loginId: string,
	answer: string,
	password: string
) => {
	const pending = pendingCaptchas.get(loginId);
	if (!pending) throw new Error("captcha expired");
	pendingCaptchas.delete(loginId);
	return run(pending.page, async () => {
		await typeInto(pending.page, CAPTCHA_INPUT, answer);
		return submitPassword(pending.page, password, pending.loginUrl);
	});
};
