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
	VIEWPORT,
	WARM_LOGIN_PAGES,
	WARM_LOGIN_TTL_MS
} from "@/config";

puppeteer.use(stealthPlugin());

const EMAIL_INPUT = "#identifierId";
const PASSWORD_INPUT = 'input[type="password"]:not([aria-hidden="true"])';
const CAPTCHA_IMAGE = "#captchaimg";
const CAPTCHA_INPUT = 'input[name="ca"]';
const DISCONNECTED = /connection closed|target closed|session closed|detached|protocol error|net::err_/i;

export type LoginResult = { sessionId: string } | { loginId: string; captcha: string };

let browser: Promise<Browser> | null = null;
const pendingCaptchas = new Map<string, { page: Page; loginUrl: string }>();
const warmPages: {
	loginUrl: string;
	expires: number;
	page: Promise<Page>;
}[] = [];

export const isDisconnect = (error: unknown) => error instanceof Error && DISCONNECTED.test(error.message);

const getBrowser = async (): Promise<Browser> => {
	const pending = browser;
	const current = pending ? await pending.catch(() => null) : null;
	if (current?.connected) return current;
	if (browser !== pending) return getBrowser();
	void current?.close().catch(() => undefined);
	const next: Promise<Browser> = (
		puppeteer.launch({
			headless: HEADLESS,
			args: BROWSER_ARGS,
			waitForInitialPage: false
		}) as unknown as Promise<Browser>
	).then(
		launched => {
			launched.on("disconnected", () => {
				if (browser !== next) return;
				browser = null;
				warmPages.length = 0;
			});
			return launched;
		},
		error => {
			if (browser === next) browser = null;
			throw error;
		}
	);
	browser = next;
	return next;
};

export const closeBrowser = async () => {
	const current = browser;
	browser = null;
	warmPages.length = 0;
	await (await current?.catch(() => null))?.close();
};

const openLoginPage = async (loginUrl: string) => {
	const context = await (await getBrowser()).createBrowserContext();
	try {
		const page = await context.newPage();
		await page.setViewport(VIEWPORT);
		page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
		await page.goto(loginUrl);
		return page;
	} catch (error) {
		await context.close().catch(() => undefined);
		throw error;
	}
};

const closeWarm = (page: Promise<Page>) =>
	void page.then(opened => opened.browserContext().close()).catch(() => undefined);

export const warmLogin = (loginUrl = ASPEN_LOGIN_URL, now = Date.now()) => {
	const fresh = warmPages.filter(
		entry => entry.loginUrl === loginUrl && entry.expires - now > WARM_LOGIN_TTL_MS / 2
	).length;
	if (fresh >= WARM_LOGIN_PAGES) return undefined;
	if (warmPages.length >= WARM_LOGIN_PAGES) closeWarm(warmPages.shift()!.page);
	const entry = {
		loginUrl,
		expires: now + WARM_LOGIN_TTL_MS,
		page: openLoginPage(loginUrl)
	};
	warmPages.push(entry);
	const drop = () => {
		const index = warmPages.indexOf(entry);
		if (index >= 0) warmPages.splice(index, 1);
		return index >= 0;
	};
	entry.page.catch(drop);
	setTimeout(() => {
		if (drop()) closeWarm(entry.page);
	}, WARM_LOGIN_TTL_MS);
	return entry.page;
};

const takeLoginPage = async (loginUrl: string) => {
	const index = warmPages.findLastIndex(entry => entry.loginUrl === loginUrl);
	const [entry] = index >= 0 ? warmPages.splice(index, 1) : [];
	const warm = entry ? await entry.page.catch(() => null) : null;
	return warm && !warm.isClosed() && warm.browser().connected
		? { page: warm, warm: true }
		: { page: await openLoginPage(loginUrl), warm: false };
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
		return url.hostname === aspenHost && !/logon|saml|sso/i.test(url.pathname);
	};
	while (!onAspen()) {
		const url = new URL(page.url());

		if (url.hostname === "accounts.google.com" && /\/signin\/rejected(?:\/|$)/.test(url.pathname)) {
			throw new Error("Google rejected this sign-in");
		}

		if (Date.now() > deadline) throw new Error(`stuck at ${page.url()}`);
		await Bun.sleep(100);
	}
};

const readSessionId = async (page: Page, loginUrl: string) => {
	const aspenHost = new URL(loginUrl).hostname;
	const deadline = Date.now() + SELECTOR_TIMEOUT_MS;
	const fromCookie = async () =>
		(await page.browserContext().cookies()).find(
			cookie => cookie.name === "JSESSIONID" && cookie.domain === aspenHost
		)?.value;
	let cookie = await fromCookie();
	while (!cookie && Date.now() < deadline) {
		await Bun.sleep(100);
		cookie = await fromCookie();
	}
	const sessionId = cookie ?? /jsessionid=([^;?&#/]+)/i.exec(page.url())?.[1];
	if (!sessionId) throw new Error("no JSESSIONID");
	return sessionId;
};

const submitPassword = async (page: Page, password: string, loginUrl: string): Promise<LoginResult> => {
	await typeInto(page, PASSWORD_INPUT, password);
	await waitForAspen(page, loginUrl);
	return { sessionId: await readSessionId(page, loginUrl) };
};

const holdCaptcha = async (page: Page, loginUrl: string): Promise<LoginResult> => {
	await page.waitForFunction(
		selector => document.querySelector<HTMLImageElement>(selector)?.complete,
		{ timeout: SELECTOR_TIMEOUT_MS },
		CAPTCHA_IMAGE
	);
	const image = await (await page.$(CAPTCHA_IMAGE))!.screenshot({
		encoding: "base64"
	});
	const loginId = randomUUID();
	pendingCaptchas.set(loginId, { page, loginUrl });
	setTimeout(() => {
		if (pendingCaptchas.delete(loginId))
			void page
				.browserContext()
				.close()
				.catch(() => undefined);
	}, CAPTCHA_TTL_MS);
	return { loginId, captcha: `data:image/png;base64,${image}` };
};

const run = async (page: Page, steps: () => Promise<LoginResult>) => {
	try {
		const result = await steps();
		if ("sessionId" in result)
			await page
				.browserContext()
				.close()
				.catch(() => undefined);
		return result;
	} catch (error) {
		await page
			.browserContext()
			.close()
			.catch(() => undefined);
		throw error;
	}
};

const signIn = (page: Page, username: string, password: string, loginUrl: string) =>
	run(page, async () => {
		await typeInto(page, EMAIL_INPUT, username);
		const next = await page.waitForSelector(`${CAPTCHA_IMAGE}, ${PASSWORD_INPUT}`, {
			visible: true,
			timeout: AFTER_EMAIL_TIMEOUT_MS
		});
		return (await next!.evaluate(element => element.id === "captchaimg"))
			? holdCaptcha(page, loginUrl)
			: submitPassword(page, password, loginUrl);
	});

export const startLogin = async (username: string, password: string, loginUrl = ASPEN_LOGIN_URL) => {
	const first = await takeLoginPage(loginUrl).catch(() => null);
	try {
		if (!first) throw new Error("connection closed");
		return await signIn(first.page, username, password, loginUrl);
	} catch (error) {
		const staleWarm = first?.warm === true && error instanceof Error && error.name === "TimeoutError";
		if (!isDisconnect(error) && !staleWarm) throw error;
		return signIn(await openLoginPage(loginUrl), username, password, loginUrl);
	}
};

export const continueLogin = async (loginId: string, answer: string, password: string) => {
	const pending = pendingCaptchas.get(loginId);
	if (!pending) throw new Error("captcha expired");
	pendingCaptchas.delete(loginId);
	return run(pending.page, async () => {
		await typeInto(pending.page, CAPTCHA_INPUT, answer);
		return submitPassword(pending.page, password, pending.loginUrl);
	});
};
