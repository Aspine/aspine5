import { ASPEN_DEPLOYMENT_ID, ASPEN_ORIGIN, ASPEN_TIMEOUT_MS } from "@/config";

type Feature = (sessionId: string, query: URLSearchParams) => Promise<Response>;

const CLASS_FIELD_SET = "fsnX2ClsMbl++++++";
const TERM_FIELD_SET = "fsnX2ClsMbl+++";
const STRUTS_TOKEN_FIELD = "org.apache.struts.taglib.html.TOKEN";
const STRUTS_TOKEN =
	/name="org\.apache\.struts\.taglib\.html\.TOKEN" value="([^"]+)"/;
const RECENT_PREFERENCES =
	'<?xml version="1.0" encoding="UTF-8"?><preference-set><pref id="dateRange" type="int">4</pref></preference-set>';

const aspenFetch = (
	sessionId: string,
	path: string,
	form?: Record<string, string>
) =>
	fetch(`${ASPEN_ORIGIN}/aspen/${path}`, {
		method: form ? "POST" : "GET",
		signal: AbortSignal.timeout(ASPEN_TIMEOUT_MS),
		headers: {
			Cookie: `JSESSIONID=${sessionId}; deploymentId=${ASPEN_DEPLOYMENT_ID}`
		},
		...(form && { body: new URLSearchParams(form) })
	});

const param = (query: URLSearchParams, name: string) =>
	encodeURIComponent(query.get(name) ?? "");

const studentOid = async (sessionId: string) => {
	const response = await aspenFetch(sessionId, "rest/users/students");
	const students = (await response.json()) as { studentOid: string }[];
	return students[0]!.studentOid;
};

const classList = async (
	sessionId: string,
	query: URLSearchParams,
	path: string,
	term: string,
	fieldSet: string
) => {
	const customParams = `selectedYear|${query.get("year") ?? "current"};selectedTerm|${term}`;
	return aspenFetch(
		sessionId,
		`${path}?count=50&customParams=${encodeURIComponent(customParams)}&selectedStudent=${encodeURIComponent(await studentOid(sessionId))}&fieldSetOid=${fieldSet}&filter=%23%23%23all&offset=1&sort=default&unique=true`
	);
};

const schedule: Feature = async sessionId =>
	aspenFetch(
		sessionId,
		"studentScheduleContextList.do?navkey=myInfo.sch.list"
	);

const stats: Feature = async (sessionId, query) => {
	let token = "";
	const step = async (path: string, form?: Record<string, string>) => {
		const response = await aspenFetch(
			sessionId,
			path,
			form && { [STRUTS_TOKEN_FIELD]: token, ...form }
		);
		const html = await response.text();
		token = STRUTS_TOKEN.exec(html)?.[1] ?? token;
		return new Response(html, {
			status: response.status,
			headers: { "Content-Type": "text/html" }
		});
	};
	await step("portalClassList.do?navkey=academics.classes.list");
	await step("portalClassList.do", {
		userEvent: "950",
		termFilter: query.get("termOid") ?? "",
		yearFilter: query.get("year") ?? "current"
	});
	await step("portalClassList.do", {
		userEvent: "2100",
		userParam: query.get("classOid") ?? ""
	});
	await step("portalAssignmentList.do?navkey=academics.classes.list.gcd");
	await step("portalAssignmentList.do", {
		userEvent: "2210",
		gradeTermOid: query.get("termOid") ?? ""
	});
	return step("portalAssignmentList.do", {
		userEvent: "2100",
		userParam: query.get("assignmentOid") ?? ""
	});
};

const features: Record<string, Feature> = {
	student: async sessionId => aspenFetch(sessionId, "rest/users/students"),
	gradeTerms: (sessionId, query) =>
		classList(
			sessionId,
			query,
			"rest/lists/academics.classes.list/studentGradeTerms",
			"current",
			TERM_FIELD_SET
		),
	classes: (sessionId, query) =>
		classList(
			sessionId,
			query,
			"rest/lists/academics.classes.list",
			query.get("term") ?? "current",
			CLASS_FIELD_SET
		),
	currentTerm: async (sessionId, query) =>
		aspenFetch(
			sessionId,
			`rest/studentSchedule/${param(query, "classOid")}/gradeTerms`
		),
	academics: async (sessionId, query) =>
		aspenFetch(
			sessionId,
			`rest/studentSchedule/${param(query, "classOid")}/academics`
		),
	assignments: async (sessionId, query) =>
		aspenFetch(
			sessionId,
			`rest/studentSchedule/${param(query, "classOid")}/categoryDetails/${query.get("kind") === "upcoming" ? "upcoming" : "pastDue"}?gradeTermOid=${param(query, "termOid")}`
		),
	recent: async sessionId =>
		aspenFetch(
			sessionId,
			`studentRecentActivityWidget.do?${new URLSearchParams({ preferences: RECENT_PREFERENCES })}`
		),
	schedule,
	reports: async sessionId => aspenFetch(sessionId, "rest/reports"),
	report: async (sessionId, query) =>
		aspenFetch(sessionId, `rest/reports/${param(query, "id")}/file`),
	stats,
	logout: async () => new Response("ok")
};

export const getFeature = (name: string) =>
	Object.hasOwn(features, name) ? features[name] : undefined;
