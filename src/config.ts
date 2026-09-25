export const REPO_URL = "https://github.com/aspine/aspine5";

export const HEADLESS = true;

export const ASPEN_LOGIN_URL =
	"https://aspen.cpsd.us/aspen/logonSSO.do?deploymentId=ma-cambridge&districtId=*dst&idpName=Cambridge%20Google%20SAML";

export const ASPEN_ORIGIN = "https://aspen.cpsd.us";

export const ASPEN_DEPLOYMENT_ID = "ma-cambridge";

export const ASPEN_TIMEOUT_MS = 15_000;

export const ASPEN_CONCURRENCY = 8;

export const BROWSER_ARGS = [
	"--no-sandbox",
	"--disable-setuid-sandbox",
	"--no-startup-window",
	"--disable-dev-shm-usage"
];

export const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 };

export const NAVIGATION_TIMEOUT_MS = 60_000;

export const SELECTOR_TIMEOUT_MS = 15_000;

export const AFTER_EMAIL_TIMEOUT_MS = 15_000;

export const AFTER_PASSWORD_TIMEOUT_MS = 30_000;

export const BEFORE_CLICK_MS = 754;

export const AFTER_CLICK_MS = 500;

export const CAPTCHA_TTL_MS = 180_000;

export const SNACKBAR_MS = 6_000;

export const LOG_TIMINGS = true;

export const SERVER_CACHE_MS = 60_000;

export const SESSION_MEMO_MS = 600_000;

export const SESSION_TTL_MS = 1_800_000;

export const WARM_LOGIN_PAGES = 15;

export const GC_INTERVAL_MS = 60_000;

export const WARM_LOGIN_TTL_MS = 120_000;

export const LUNCHES = ["A", "B", "C"] as const;

export type Lunch = (typeof LUNCHES)[number];

export const LUNCH_PERIOD = "3";

export const LUNCH_BY_FLOOR: Readonly<Record<string, Lunch>> = {
	"1": "A",
	"2": "A",
	"3": "C",
	"4": "B",
	"5": "B"
};

export const BELL_SCHEDULE = {
	A: [
		["1", "8:30", "9:50"],
		["Falcon Block", "9:55", "10:10"],
		["2", "10:15", "11:35"],
		["Lunch", "11:40", "12:10"],
		["3", "12:15", "1:35"],
		["4", "1:40", "3:00"]
	],
	B: [
		["1", "8:30", "9:50"],
		["Falcon Block", "9:55", "10:10"],
		["2", "10:15", "11:35"],
		["3", "11:40", "12:20"],
		["Lunch", "12:20", "12:50"],
		["3", "12:55", "1:35"],
		["4", "1:40", "3:00"]
	],
	C: [
		["1", "8:30", "9:50"],
		["Falcon Block", "9:55", "10:10"],
		["2", "10:15", "11:35"],
		["3", "11:40", "1:00"],
		["Lunch", "1:05", "1:35"],
		["4", "1:40", "3:00"]
	]
} as const satisfies Record<Lunch, readonly (readonly [string, string, string])[]>;
