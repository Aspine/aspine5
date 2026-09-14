export const REPO_URL = "https://github.com/aspine/aspine5";

export const HEADLESS = true;

export const ASPEN_LOGIN_URL =
	"https://aspen.cpsd.us/aspen/logonSSO.do?deploymentId=ma-cambridge&districtId=*dst&idpName=Cambridge%20Google%20SAML";

export const ASPEN_ORIGIN = "https://aspen.cpsd.us";

export const ASPEN_DEPLOYMENT_ID = "ma-cambridge";

export const ASPEN_TIMEOUT_MS = 15_000;

export const ASPEN_CONCURRENCY = 8;

export const BROWSER_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

export const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 };

export const NAVIGATION_TIMEOUT_MS = 60_000;

export const SELECTOR_TIMEOUT_MS = 15_000;

export const AFTER_EMAIL_TIMEOUT_MS = 15_000;

export const AFTER_PASSWORD_TIMEOUT_MS = 30_000;

export const BEFORE_CLICK_MS = 754;

export const AFTER_CLICK_MS = 500;

export const CAPTCHA_TTL_MS = 180_000;

export const LOGIN_LIMIT = 5;

export const LOGIN_WINDOW_MS = 600_000;

export const SNACKBAR_MS = 6_000;

export const LOG_TIMINGS = true;

export const SERVER_CACHE_MS = 60_000;

export const SESSION_MEMO_MS = 600_000;

export const WARM_LOGIN_PAGES = 2;

export const WARM_LOGIN_TTL_MS = 120_000;

export const LUNCHES = ["A", "B", "C"] as const;

export type Lunch = (typeof LUNCHES)[number];

// This is from 2022, change to be based on floor of class according to new schedule. Im probably going to forgot to do this, so somebody else should
export const BELL_SCHEDULES = {
	mondayToWednesday: {
		A: [
			["1", "8:35", "10:00"],
			["2", "10:05", "11:30"],
			["Lunch", "11:30", "12:00"],
			["3", "12:05", "1:30"],
			["4", "1:35", "3:00"]
		],
		B: [
			["1", "8:35", "10:00"],
			["2", "10:05", "11:30"],
			["3", "11:32", "12:17"],
			["Lunch", "12:17", "12:47"],
			["3", "12:50", "1:30"],
			["4", "1:35", "3:00"]
		],
		C: [
			["1", "8:35", "10:00"],
			["2", "10:05", "11:30"],
			["3", "11:35", "1:00"],
			["Lunch", "1:00", "1:30"],
			["4", "1:35", "3:00"]
		]
	},
	thursdayFriday: {
		A: [
			["1", "8:35", "9:50"],
			["Falcon Block", "9:55", "10:30"],
			["2", "10:35", "11:50"],
			["Lunch", "11:50", "12:20"],
			["3", "12:25", "1:40"],
			["4", "1:45", "3:00"]
		],
		B: [
			["1", "8:35", "9:50"],
			["Falcon Block", "9:55", "10:30"],
			["2", "10:35", "11:50"],
			["3", "11:52", "12:32"],
			["Lunch", "12:32", "1:02"],
			["3", "1:05", "1:40"],
			["4", "1:45", "3:00"]
		],
		C: [
			["1", "8:35", "9:50"],
			["Falcon Block", "9:55", "10:30"],
			["2", "10:35", "11:50"],
			["3", "11:55", "1:10"],
			["Lunch", "1:10", "1:40"],
			["4", "1:45", "3:00"]
		]
	}
} as const satisfies Record<
	string,
	Record<Lunch, readonly (readonly [string, string, string])[]>
>;
