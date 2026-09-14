import { SERVER_CACHE_MS, SESSION_MEMO_MS } from "@/config";
import type {
	Assignment,
	AssignmentStats,
	Category,
	ClassData,
	RecentData,
	ScheduleRow,
	StudentData
} from "@/lib/types";
import {
	aspenFetch,
	aspenJson,
	aspenPage,
	asRow,
	classListPath,
	classPath,
	dateOf,
	decodeEntities,
	gradeTermsPath,
	numberOf,
	pageTitle,
	responseText,
	rows,
	sessionError,
	stripTags,
	text,
	toResponse,
	type Row
} from "@/server/aspenRequest";

type Feature = (sessionId: string, query: URLSearchParams) => Promise<Response>;

type Term = { id: string; oid: string };

type Stored = { status: number; contentType: string; body: ArrayBuffer };

type Expiring<T> = { expires: number; value: Promise<T> };

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const STRUTS_TOKEN_FIELD = "org.apache.struts.taglib.html.TOKEN";
const STRUTS_TOKEN =
	/name="org\.apache\.struts\.taglib\.html\.TOKEN" value="([^"]+)"/;
const RECENT_PATH = `studentRecentActivityWidget.do?${new URLSearchParams({
	preferences:
		'<?xml version="1.0" encoding="UTF-8"?><preference-set><pref id="dateRange" type="int">4</pref></preference-set>'
})}`;
const SCHEDULE_PATH = "studentScheduleContextList.do?navkey=myInfo.sch.list";
const LIST_ROW = /<tr[^>]*class="listCell[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
const LIST_CELL = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const ATTENDANCE_FLAGS = [
	["excused", "Excused"],
	["absent", "Absent"],
	["tardy", "Tardy"],
	["dismissed", "Dismissed"]
] as const;
const HOME_FEATURES = ["recent", "schedule", "reports"];

const stored = new Map<string, Expiring<Stored>>();
const memo = new Map<string, Expiring<unknown>>();

const expiring = <T>(
	map: Map<string, Expiring<T>>,
	key: string,
	lifetime: number,
	load: () => Promise<T>
) => {
	const now = Date.now();
	map.forEach(
		(entry, entryKey) => entry.expires < now && map.delete(entryKey)
	);
	const hit = map.get(key);
	if (hit) return hit.value;
	const value = load();
	map.set(key, { expires: now + lifetime, value });
	value.catch(() => map.delete(key));
	return value;
};

const remember = <T>(key: string, load: () => Promise<T>) =>
	expiring(memo, key, SESSION_MEMO_MS, load) as Promise<T>;

const toAssignment = (row: Row): Assignment => {
	const element = rows(row.scoreElements)[0] ?? {};
	const special =
		element.specialCode === true ? text(element.gradebookScore) : "";
	return {
		oid: text(row.oid),
		name: text(row.name),
		categoryOid: text(row.categoryOid),
		category: text(row.category),
		score: special ? null : numberOf(element.score),
		maxScore: numberOf(element.pointMax) ?? numberOf(row.totalPoints),
		special,
		assigned: dateOf(row.assignedDate),
		due: dateOf(row.dueDate),
		feedback: text(row.remark)
	};
};

const isCategory = (row: Row) =>
	text(row.categoryOid) !== "" && text(row.category) !== "Gradebook average";

const toCategory =
	(quarter: string) =>
	(row: Row): Category => ({
		oid: text(row.categoryOid),
		name: text(row.category),
		weight:
			([quarter, ...QUARTERS]
				.map(key => numberOf(row[`percentage${key}`]))
				.find(weight => weight !== null) ?? 0) / 100
	});

const byDueDate = (first: Assignment, second: Assignment) =>
	second.due.localeCompare(first.due);

const grades: Feature = async (sessionId, query) => {
	const year = query.get("year") === "previous" ? "previous" : "current";
	const student = await remember(`${sessionId} student`, async () => {
		const [row] = rows(await aspenJson(sessionId, "rest/users/students"));
		if (!row) throw sessionError();
		return row;
	});
	const studentOid = text(student.studentOid);
	const readClassList = async (term: string) =>
		rows(await aspenJson(sessionId, classListPath(studentOid, year, term)));

	const termsLoad = remember(
		`${sessionId} terms ${year}`,
		async (): Promise<Term[]> =>
			rows(await aspenJson(sessionId, gradeTermsPath(studentOid, year)))
				.map(row => ({ id: text(row.gradeTermId), oid: text(row.oid) }))
				.filter(term => QUARTERS.includes(term.id))
	);
	const classRowsLoad = readClassList("all").then(list =>
		list.filter(row => row.relSscMstOid_relMstCskOid_cskGrdInpHide !== true)
	);
	const termGradesLoad = termsLoad
		.then(terms => Promise.all(terms.map(term => readClassList(term.oid))))
		.then(lists =>
			lists.map(
				list =>
					new Map(
						list.map(row => [
							text(row.oid),
							text(row.cfTermAverage)
						])
					)
			)
		);
	const academicsLoad = classRowsLoad.then(classRows =>
		Promise.all(
			classRows.map(row =>
				aspenJson(
					sessionId,
					classPath(text(row.oid), "academics")
				).then(asRow)
			)
		)
	);
	const currentIndexLoad =
		year === "current"
			? classRowsLoad.then(classRows =>
					classRows[0]
						? remember(`${sessionId} currentTerm`, async () =>
								numberOf(
									asRow(
										await aspenJson(
											sessionId,
											classPath(
												text(classRows[0]!.oid),
												"gradeTerms"
											)
										)
									).currentTermIndex
								)
							)
						: null
				)
			: Promise.resolve(null);
	academicsLoad.catch(() => undefined);

	const [terms, classRows, termGrades, currentIndex] = await Promise.all([
		termsLoad,
		classRowsLoad,
		termGradesLoad,
		currentIndexLoad
	]);
	const requestedIndex = terms.findIndex(
		term => term.id === query.get("quarter")
	);
	const quarterIndex =
		requestedIndex >= 0
			? requestedIndex
			: (currentIndex ?? terms.length - 1);
	const quarter = terms[quarterIndex] ?? { id: "Q1", oid: "" };
	const inQuarter = (oid: string) =>
		termGrades[quarterIndex]?.has(oid) ?? false;

	const readAssignments = async (oid: string) =>
		inQuarter(oid) && quarter.oid
			? (
					await Promise.all(
						["pastDue", "upcoming"].map(async kind =>
							rows(
								await aspenJson(
									sessionId,
									`${classPath(oid, `categoryDetails/${kind}`)}?gradeTermOid=${encodeURIComponent(quarter.oid)}`
								)
							)
						)
					)
				).flat()
			: [];

	const [academics, assignments] = await Promise.all([
		academicsLoad,
		Promise.all(classRows.map(row => readAssignments(text(row.oid))))
	]);

	return Response.json({
		name: text(student.name),
		year,
		quarter: quarter.id,
		quarterOid: quarter.oid,
		currentQuarter:
			currentIndex === null ? null : (terms[currentIndex]?.id ?? null),
		quarters: terms.map(term => term.id),
		classes: classRows.map((row, index): ClassData => {
			const oid = text(row.oid);
			const summary = academics[index] ?? {};
			return {
				oid,
				name: text(row.relSscMstOid_mstDescription),
				teacher: text(rows(row.relSscMstOid_mstStaffView)[0]?.name),
				grades: Object.fromEntries(
					terms.map((term, termIndex) => [
						term.id,
						termGrades[termIndex]?.get(oid) ?? ""
					])
				),
				inQuarter: inQuarter(oid),
				categories: rows(summary.averageSummary)
					.filter(isCategory)
					.map(toCategory(quarter.id)),
				assignments: (assignments[index] ?? [])
					.map(toAssignment)
					.sort(byDueDate),
				attendance: Object.fromEntries(
					rows(summary.attendanceSummary).map(entry => [
						text(entry.type).toLowerCase(),
						numberOf(entry.total) ?? 0
					])
				)
			};
		})
	} satisfies StudentData);
};

const xmlElements = (xml: string, tag: string) =>
	[...xml.matchAll(new RegExp(`<${tag}\\s([^>]*)`, "g"))].map(
		match =>
			Object.fromEntries(
				[...(match[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)].map(
					attribute => [
						attribute[1] ?? "",
						decodeEntities(attribute[2] ?? "")
					]
				)
			) as Record<string, string | undefined>
	);

const schedulePage = async (
	sessionId: string,
	retries = 1
): Promise<string> => {
	const html = await aspenPage(sessionId, SCHEDULE_PATH);
	if (html.includes("Current schedule")) return html;
	if (retries > 0) return schedulePage(sessionId, retries - 1);
	throw new Error(`schedule page ${pageTitle(html)}`);
};

const recent: Feature = async sessionId => {
	const xml = await aspenPage(sessionId, RECENT_PATH);
	if (/<html/i.test(xml)) throw new Error(`recent page ${pageTitle(xml)}`);
	return Response.json({
		attendance: xmlElements(xml, "periodAttendance").map(entry => ({
			date: entry.date ?? "",
			classname: entry.classname ?? "",
			period: entry.period ?? "",
			event:
				ATTENDANCE_FLAGS.filter(([key]) => entry[key] === "true")
					.map(([, label]) => label)
					.join(" ") ||
				(entry.code ?? "")
		})),
		activity: xmlElements(xml, "gradebookScore").map(entry => ({
			date: entry.date ?? "",
			classname: entry.classname ?? "",
			assignment: entry.assignmentname ?? "",
			score: entry.grade ?? ""
		}))
	} satisfies RecentData);
};

const schedule: Feature = async sessionId => {
	const html = await schedulePage(sessionId);
	const tableRows = [...html.matchAll(LIST_ROW)].map(match =>
		[...(match[1] ?? "").matchAll(LIST_CELL)].map(cell =>
			stripTags(cell[1] ?? "")
		)
	);
	return Response.json(
		tableRows
			.filter(cells => cells.length >= 7)
			.map(
				([
					,
					course = "",
					name = "",
					term = "",
					scheduleCode = "",
					room = "",
					teacher = ""
				]) => ({
					course,
					name,
					term,
					schedule: scheduleCode,
					room,
					teacher
				})
			) satisfies ScheduleRow[]
	);
};

const STAT_LABELS: Readonly<Record<string, keyof AssignmentStats>> = {
	High: "high",
	Low: "low",
	Median: "median",
	Average: "mean",
	Mean: "mean"
};

const DETAIL_ROW =
	/<td[^>]*class="detailProperty[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="detailValue"[^>]*>([\s\S]*?)<\/td>/gi;

const parseStats = (html: string): AssignmentStats | null => {
	const values = Object.fromEntries(
		[...html.matchAll(DETAIL_ROW)].flatMap(match => {
			const key = STAT_LABELS[stripTags(match[1] ?? "")];
			const value = numberOf(stripTags(match[2] ?? ""));
			return key && value !== null ? [[key, value]] : [];
		})
	) as Partial<AssignmentStats>;
	const { high, low, median, mean } = values;
	return high === undefined ||
		low === undefined ||
		median === undefined ||
		mean === undefined
		? null
		: { high, low, median, mean };
};

const stats: Feature = async (sessionId, query) => {
	let token = "";
	const step = async (path: string, form?: Record<string, string>) => {
		const html = responseText(
			await aspenFetch(
				sessionId,
				path,
				form && { [STRUTS_TOKEN_FIELD]: token, ...form }
			)
		);
		token = STRUTS_TOKEN.exec(html)?.[1] ?? token;
		return html;
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
	return Response.json({
		stats: parseStats(
			await step("portalAssignmentList.do", {
				userEvent: "2100",
				userParam: query.get("assignmentOid") ?? ""
			})
		)
	});
};

const report: Feature = async (sessionId, query) =>
	toResponse(
		await aspenFetch(
			sessionId,
			`rest/reports/${encodeURIComponent(query.get("id") ?? "")}/file`
		),
		"application/pdf"
	);

const reports: Feature = async sessionId =>
	toResponse(await aspenFetch(sessionId, "rest/reports"));

const storedKey = (sessionId: string, name: string, query: URLSearchParams) =>
	[
		sessionId,
		name,
		...[...query]
			.filter(([, value]) => value !== "")
			.map(pair => pair.join("="))
			.sort()
	].join(" ");

const fromStored = ({ status, contentType, body }: Stored) =>
	new Response(body.slice(0), {
		status,
		headers: { "Content-Type": contentType }
	});

const withCache =
	(name: string, feature: Feature): Feature =>
	async (sessionId, query) => {
		const key = storedKey(sessionId, name, query);
		const response = expiring(stored, key, SERVER_CACHE_MS, () =>
			feature(sessionId, query).then(async result => ({
				status: result.status,
				contentType: result.headers.get("content-type") ?? "",
				body: await result.arrayBuffer()
			}))
		);
		response.then(
			result => result.status !== 200 && stored.delete(key),
			() => undefined
		);
		return fromStored(await response);
	};

const forgetSession = (sessionId: string) =>
	[stored, memo].forEach(map =>
		map.forEach(
			(_, key) => key.startsWith(`${sessionId} `) && map.delete(key)
		)
	);

const features: Record<string, Feature> = {
	grades: withCache("grades", grades),
	recent: withCache("recent", recent),
	schedule: withCache("schedule", schedule),
	reports: withCache("reports", reports),
	report: withCache("report", report),
	stats,
	logout: async sessionId => {
		forgetSession(sessionId);
		return new Response("ok");
	}
};

export const prefetchHome = (sessionId: string) =>
	void features.grades!(sessionId, new URLSearchParams({ year: "current" }))
		.then(() =>
			Promise.all(
				HOME_FEATURES.map(name =>
					features[name]!(sessionId, new URLSearchParams())
				)
			)
		)
		.catch(() => undefined);

export const getFeature = (name: string) =>
	Object.hasOwn(features, name) ? features[name] : undefined;
