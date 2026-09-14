import { ASPEN_DEPLOYMENT_ID, ASPEN_ORIGIN, ASPEN_TIMEOUT_MS } from "@/config";

export type Row = Record<string, unknown>;

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

const sessionQueues = new Map<string, Promise<unknown>>();

const inSessionQueue = <T>(sessionId: string, task: () => Promise<T>) => {
	const next = (sessionQueues.get(sessionId) ?? Promise.resolve())
		.catch(() => undefined)
		.then(task);
	sessionQueues.set(sessionId, next);
	void next
		.catch(() => undefined)
		.finally(() => {
			if (sessionQueues.get(sessionId) === next)
				sessionQueues.delete(sessionId);
		});
	return next;
};

export const aspenFetch = (
	sessionId: string,
	path: string,
	form?: Record<string, string>
) =>
	inSessionQueue(sessionId, async (): Promise<AspenResponse> => {
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
	});

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
