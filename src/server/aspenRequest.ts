import { AsyncLocalStorage } from "node:async_hooks";
import {
	ASPEN_CONCURRENCY,
	ASPEN_DEPLOYMENT_ID,
	ASPEN_ORIGIN,
	ASPEN_TIMEOUT_MS,
	LOG_TIMINGS
} from "@/config";

export type Row = Record<string, unknown>;

type Meter = { requests: number; aspenMs: number };

type Waiter = { exclusive: boolean; start: () => void };

type Lane = { active: number; exclusive: boolean; waiting: Waiter[] };

const CLASS_FIELD_SET = "fsnX2ClsMbl++++++";
const TERM_FIELD_SET = "fsnX2ClsMbl+++";
const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " "
};

export const sessionError = () => new Error("session");

export type AspenResponse = {
	status: number;
	url: string;
	contentType: string;
	body: ArrayBuffer;
};

const lanes = new Map<string, Lane>();
const meters = new AsyncLocalStorage<Meter>();

const pump = (sessionId: string, lane: Lane) => {
	for (let next = lane.waiting[0]; next; next = lane.waiting[0]) {
		const fits = next.exclusive
			? lane.active === 0
			: !lane.exclusive && lane.active < ASPEN_CONCURRENCY;
		if (!fits) return;
		lane.waiting.shift();
		lane.active++;
		lane.exclusive = next.exclusive;
		next.start();
	}
	if (lane.active === 0) lanes.delete(sessionId);
};

const inSessionLane = <T>(
	sessionId: string,
	exclusive: boolean,
	task: () => Promise<T>
) =>
	new Promise<T>((resolve, reject) => {
		const lane = lanes.get(sessionId) ?? {
			active: 0,
			exclusive: false,
			waiting: []
		};
		lanes.set(sessionId, lane);
		lane.waiting.push({
			exclusive,
			start: () =>
				void task()
					.then(resolve, reject)
					.finally(() => {
						lane.active--;
						if (lane.active === 0) lane.exclusive = false;
						pump(sessionId, lane);
					})
		});
		pump(sessionId, lane);
	});

export const measured = async <T>(label: string, task: () => Promise<T>) => {
	if (!LOG_TIMINGS) return task();
	const meter: Meter = { requests: 0, aspenMs: 0 };
	const startedAt = performance.now();
	try {
		return await meters.run(meter, task);
	} finally {
		console.log(
			`${label} ${Math.round(performance.now() - startedAt)}ms · aspen ${meter.requests} req ${Math.round(meter.aspenMs)}ms`
		);
	}
};

const requestOnce = (
	sessionId: string,
	path: string,
	form: Record<string, string> | undefined,
	exclusive: boolean,
	meter: Meter | undefined
) =>
	inSessionLane(sessionId, exclusive, async (): Promise<AspenResponse> => {
		const startedAt = performance.now();
		try {
			const response = await fetch(`${ASPEN_ORIGIN}/aspen/${path}`, {
				method: form ? "POST" : "GET",
				signal: AbortSignal.timeout(ASPEN_TIMEOUT_MS),
				headers: {
					Cookie: `JSESSIONID=${sessionId}; deploymentId=${ASPEN_DEPLOYMENT_ID}`
				},
				...(form && { body: new URLSearchParams(form) })
			});
			return {
				status: response.status,
				url: response.url,
				contentType: response.headers.get("content-type") ?? "",
				body: await response.arrayBuffer()
			};
		} finally {
			if (meter) {
				meter.requests++;
				meter.aspenMs += performance.now() - startedAt;
			}
		}
	});

export const aspenFetch = async (
	sessionId: string,
	path: string,
	form?: Record<string, string>
) => {
	const meter = meters.getStore();
	if (form || !path.startsWith("rest/"))
		return requestOnce(sessionId, path, form, true, meter);
	const response = await requestOnce(
		sessionId,
		path,
		form,
		false,
		meter
	).catch(() => null);
	if (response && response.status < 500) return response;
	console.error(`aspen ${response?.status ?? "error"} retry alone`);
	return requestOnce(sessionId, path, form, true, meter);
};

export const responseText = (response: AspenResponse) =>
	new TextDecoder().decode(response.body);

export const toResponse = (
	response: AspenResponse,
	contentType = response.contentType
) =>
	new Response(response.body, {
		status: response.status,
		headers: { "Content-Type": contentType }
	});

export const aspenPage = async (sessionId: string, path: string) => {
	const response = await aspenFetch(sessionId, path);
	if (
		response.status === 401 ||
		response.status === 403 ||
		/logon|aspen-login/i.test(response.url)
	)
		throw sessionError();
	return responseText(response);
};

export const pageTitle = (html: string) =>
	/<title>([^<]*)/i.exec(html)?.[1]?.trim() ?? "untitled";

export const aspenJson = async (
	sessionId: string,
	path: string
): Promise<unknown> => {
	const response = await aspenFetch(sessionId, path);
	switch (response.status) {
		case 200:
			return JSON.parse(responseText(response)) as unknown;
		case 401:
		case 403:
			throw sessionError();
		default:
			throw new Error(`aspen ${response.status}`);
	}
};

export const rows = (value: unknown) =>
	Array.isArray(value)
		? value.filter(
				(row): row is Row => row !== null && typeof row === "object"
			)
		: [];

export const asRow = (value: unknown): Row =>
	value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Row)
		: {};

export const text = (value: unknown) =>
	typeof value === "string"
		? value.trim()
		: typeof value === "number"
			? String(value)
			: "";

export const numberOf = (value: unknown) => {
	const parsed =
		typeof value === "number" ? value : Number.parseFloat(text(value));
	return Number.isFinite(parsed) ? parsed : null;
};

export const dateOf = (value: unknown) =>
	typeof value === "number" ? new Date(value).toISOString().slice(0, 10) : "";

export const decodeEntities = (value: string) =>
	value.replace(/&(#\d+|\w+);/g, (match, entity: string) =>
		entity.startsWith("#")
			? String.fromCharCode(Number(entity.slice(1)))
			: (ENTITIES[entity] ?? match)
	);

export const stripTags = (html: string) =>
	decodeEntities(html.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();

const listQuery = (
	studentOid: string,
	year: string,
	term: string,
	fieldSet: string
) =>
	`count=50&customParams=${encodeURIComponent(`selectedYear|${year};selectedTerm|${term}`)}&selectedStudent=${encodeURIComponent(studentOid)}&fieldSetOid=${fieldSet}&filter=%23%23%23all&offset=1&sort=default&unique=true`;

export const classListPath = (studentOid: string, year: string, term: string) =>
	`rest/lists/academics.classes.list?${listQuery(studentOid, year, term, CLASS_FIELD_SET)}`;

export const gradeTermsPath = (studentOid: string, year: string) =>
	`rest/lists/academics.classes.list/studentGradeTerms?${listQuery(studentOid, year, "current", TERM_FIELD_SET)}`;

export const classPath = (classOid: string, resource: string) =>
	`rest/studentSchedule/${encodeURIComponent(classOid)}/${resource}`;
