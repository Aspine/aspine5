import { CalendarClock, CalendarDays, FileText, GraduationCap, Info, LogOut, type LucideIcon } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { DEMO_FILE } from "@/lib/demo";
import {
	GPA_KEYS,
	averageGpa,
	classGrade,
	computeGpa,
	parseNumber,
	sameAssignments,
	type Gpa,
	type GpaKey
} from "@/lib/grades";
import type { Assignment, ExportFile, RecentData, Report, ScheduleRow, StudentData } from "@/lib/types";
import { clearStored, gradesPath, useApi, type ApiState } from "@/lib/useApi";
import { Grades, type DeleteAssignment, type EditClass } from "./Grades";
import { Recent } from "./Recent";
import { Reports } from "./Reports";
import { Schedule } from "./Schedule";
import { Footer, Loaded, Menu, Snackbar, Toggle, type Snack } from "./Templates";
import { ExportDialog, parseExport } from "./Transfer";

export const MODES = ["home", "demo", "import"] as const;

export type Mode = (typeof MODES)[number];

const TABS = ["Grades", "Schedule", "Info", "Reports"] as const;

const TAB_ICONS: Record<Tab, LucideIcon> = {
	Grades: GraduationCap,
	Schedule: CalendarClock,
	Info,
	Reports: FileText
};

const GPA_LABELS: Record<GpaKey, string> = {
	percent: "Percent",
	unweighted: "Unweighted",
	weighted: "Weighted"
};

type Tab = (typeof TABS)[number];

type Year = StudentData["year"];

type Imported = { label: string; file: ExportFile };

const DEMO: Imported = { label: "Demo", file: DEMO_FILE };

const Curve = () => (
	<svg class="curve" viewBox="0 0 69.09 42" preserveAspectRatio="none" aria-hidden="true">
		<path d="M0 0H69.09C26.15 0 41.26 42 0 42Z" fill="currentColor" />
	</svg>
);

const fromFile = <T,>(data: T | null): ApiState<T> => ({
	data,
	error: data ? null : "Not in file",
	loading: false
});

const tabLabel = (option: Tab) => {
	const Icon = TAB_ICONS[option];
	return (
		<>
			<Icon size={18} class="tabIcon" aria-hidden="true" />
			<span>{option}</span>
		</>
	);
};

export const Home = ({ mode, commit }: { mode: Mode; commit: string | null }) => {
	const offline = mode !== "home";
	const [tab, setTab] = useState<Tab>("Grades");
	const [year, setYear] = useState<Year>("current");
	const [quarter, setQuarter] = useState("");
	const [gpaKey, setGpaKey] = useState<GpaKey>("percent");
	const [edits, setEdits] = useState<Record<string, Assignment[]>>({});
	const [imported, setImported] = useState<Imported | null>(mode === "demo" ? DEMO : null);
	const [exporting, setExporting] = useState(false);
	const [snack, setSnack] = useState<Snack | null>(null);
	const undos = useRef<(() => void)[]>([]);
	const fileInput = useRef<HTMLInputElement>(null);
	const fromAspen = !offline && !imported;
	const liveGrades = useApi<StudentData>(fromAspen ? gradesPath(year, quarter) : null, { persist: true });
	const gradesPending =
		fromAspen &&
		(liveGrades.error === "No session" ||
			(liveGrades.error === null && (liveGrades.data === null || liveGrades.loading)));
	const later = (name: Tab) => ({
		persist: true,
		wait: gradesPending && tab !== name
	});
	const live = {
		grades: liveGrades,
		recent: useApi<RecentData>(fromAspen ? "/api/recent" : null, later("Info")),
		schedule: useApi<ScheduleRow[]>(fromAspen ? "/api/schedule" : null, later("Schedule")),
		reports: useApi<Report[]>(offline ? null : "/api/reports", later("Reports"))
	};
	const liveStates: ApiState<unknown>[] = Object.values(live);
	const updating = liveStates.some(state => state.loading && state.data !== null);
	const savedError = liveStates.find(state => state.error !== null && state.data !== null)?.error;
	const file = imported?.file;
	const grades = file
		? fromFile(
				file.terms.find(term => term.quarter === quarter) ??
					file.terms.find(term => term.quarter === term.currentQuarter) ??
					file.terms[0] ??
					null
			)
		: live.grades;
	const recent = file ? fromFile(file.recent) : live.recent;
	const schedule = file ? fromFile(file.schedule) : live.schedule;
	const reports = offline ? fromFile<Report[]>(null) : live.reports;
	const data = grades.data;

	const notify = (text: string, action?: Snack["action"]) =>
		setSnack({ id: Date.now(), text, ...(action && { action }) });

	const undo = () => {
		undos.current.pop()?.();
		setSnack(null);
	};

	useEffect(() => {
		const undoKey = (event: KeyboardEvent) => {
			const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
			if (
				(event.ctrlKey || event.metaKey) &&
				!event.shiftKey &&
				event.key.toLowerCase() === "z" &&
				!typing &&
				undos.current.length > 0
			) {
				event.preventDefault();
				undo();
			}
		};
		addEventListener("keydown", undoKey);
		return () => removeEventListener("keydown", undoKey);
	}, []);

	const gpaFor = (key: string) =>
		data &&
		computeGpa(
			data.classes.map(item => ({
				name: item.name,
				percent:
					key !== data.quarter
						? parseNumber(item.grades[key] ?? "")
						: item.inQuarter
							? classGrade(item, key, edits[item.oid])
							: null
			}))
		);

	const formatGpa = (gpa: Gpa | null) => (gpa === null ? "–" : gpa[gpaKey].toFixed(2));

	const editClass: EditClass = (classOid, change) =>
		setEdits(previous => {
			const original = data?.classes.find(item => item.oid === classOid)?.assignments ?? [];
			const next = change(previous[classOid] ?? original);
			const others = Object.fromEntries(Object.entries(previous).filter(([key]) => key !== classOid));
			return sameAssignments(next, original) ? others : { ...others, [classOid]: next };
		});

	const deleteAssignment: DeleteAssignment = (classOid, assignment, index) => {
		editClass(classOid, list => list.filter(item => item.oid !== assignment.oid));
		undos.current.push(() =>
			editClass(classOid, list =>
				list.some(item => item.oid === assignment.oid)
					? list
					: [...list.slice(0, index), assignment, ...list.slice(index)]
			)
		);
		notify(`Deleted ${assignment.name}`, ["Undo", undo]);
	};

	const clearEdits = () => {
		setEdits({});
		undos.current = [];
		setSnack(null);
	};

	const selectQuarter = (key: string) => {
		setQuarter(key);
		clearEdits();
	};

	const selectYear = (nextYear: Year) => {
		setImported(null);
		setYear(nextYear);
		selectQuarter("");
	};

	const selectFile = (next: Imported) => {
		setImported(next);
		selectQuarter("");
	};

	const importData = async (picked: File) => {
		const parsed = parseExport(await picked.text());
		if (!parsed) return notify("Invalid file");
		selectFile({ label: "Imported", file: parsed });
	};

	const openImport = () => fileInput.current?.click();

	const openExport = () => setExporting(true);

	const [visited, setVisited] = useState<Tab[]>(["Grades"]);

	const openTab = (next: Tab) => {
		setTab(next);
		setVisited(previous => (previous.includes(next) ? previous : [...previous, next]));
	};

	const leave = async () => {
		if (!offline) {
			clearStored();
			await fetch("/api/logout").catch(() => null);
		}
		location.assign("/");
	};

	const panels: [Tab, ComponentChildren][] = [
		[
			"Grades",
			<Loaded state={grades}>
				{loaded => (
					<Grades
						data={loaded}
						edits={edits}
						stats={fromAspen}
						onEdit={editClass}
						onDelete={deleteAssignment}
						onReset={clearEdits}
					/>
				)}
			</Loaded>
		],
		["Schedule", <Loaded state={schedule}>{loaded => <Schedule rows={loaded} />}</Loaded>],
		["Info", <Loaded state={recent}>{loaded => <Recent recent={loaded} classes={data?.classes ?? []} />}</Loaded>],
		["Reports", <Loaded state={reports}>{loaded => <Reports reports={loaded} />}</Loaded>]
	];

	return (
		<div class="home">
			<header class="chrome">
				<div class="chromeSection" data-layer="0">
					{/** Aspine title in top left */}
					<div class="brand main-title">Aspine</div>
					<Curve />
				</div>
				<div class="chromeSection" data-layer="1">
					<Menu
						label={
							<>
								<CalendarDays size={16} class="menuIcon" aria-hidden="true" />
								<span class="menuText">
									{imported?.label ??
										(offline ? "Import" : year === "current" ? "Current Year" : "Previous Year")}
								</span>
							</>
						}
						groups={[
							...(offline
								? []
								: [
										[
											{
												label: "Current Year",
												detail: "",
												checked: !imported && year === "current",
												onSelect: () => selectYear("current")
											},
											{
												label: "Previous Year",
												detail: "",
												checked: !imported && year === "previous",
												onSelect: () => selectYear("previous")
											}
										]
									]),
							[
								...(mode === "demo"
									? [
											{
												label: "Demo",
												detail: "",
												checked: imported === DEMO,
												onSelect: () => selectFile(DEMO)
											}
										]
									: []),
								{
									label: "Import Data",
									detail: "",
									checked: imported?.label === "Imported",
									onSelect: openImport
								},
								...(data
									? [
											{
												label: "Export Data",
												detail: "",
												checked: false,
												onSelect: openExport
											}
										]
									: [])
							]
						]}
					/>
					<Menu
						label={
							data ? (
								<span>
									<span class="menuQuarter">
										{`${data.quarter}`} <span id="divider">-</span>
									</span>
									{formatGpa(gpaFor(data.quarter))}
								</span>
							) : (
								"GPA"
							)
						}
						groups={
							data
								? [
										data.quarters.map(key => ({
											label: key === data.currentQuarter ? `${key} (current)` : key,
											detail: formatGpa(gpaFor(key)),
											checked: key === data.quarter,
											...(file && !file.terms.some(term => term.quarter === key)
												? {}
												: {
														onSelect: () => selectQuarter(key)
													})
										})),
										[
											{
												label: "Cumulative",
												detail: formatGpa(
													averageGpa(data.quarters.flatMap(key => gpaFor(key) ?? []))
												),
												checked: false
											}
										],
										GPA_KEYS.map(key => ({
											label: GPA_LABELS[key],
											detail: "",
											checked: key === gpaKey,
											onSelect: () => setGpaKey(key)
										}))
									]
								: []
						}
					/>
					<input
						ref={fileInput}
						type="file"
						accept="application/json,.json"
						hidden
						onChange={event => {
							const picked = event.currentTarget.files?.[0];
							if (picked) void importData(picked);
							event.currentTarget.value = "";
						}}
					/>
					<Curve />
				</div>
				<nav class="chromeSection" data-layer="2" aria-label="Tabs">
					<Toggle options={TABS} value={tab} label={tabLabel} onChange={openTab} />
					<Curve />
				</nav>
				<div class="chromeSection" data-layer="3">
					<button
						type="button"
						class="chromeIcon"
						aria-label={offline ? "Exit" : "Logout"}
						title={offline ? "Exit" : "Logout"}
						onClick={leave}
					>
						<LogOut size={19} aria-hidden="true" />
					</button>
				</div>
			</header>
			{updating && <div class="loadingBar" role="progressbar" aria-label="Updating" />}
			<main class="viewport">
				{savedError && (
					<p class="status error">
						Saved data <span id="divider">-</span> {savedError}
					</p>
				)}
				{mode === "import" && !imported ? (
					<button type="button" class="button primary" onClick={openImport}>
						Import Data
					</button>
				) : (
					panels.map(([name, content]) => (
						<section key={name} hidden={tab !== name}>
							{visited.includes(name) && content}
						</section>
					))
				)}
			</main>
			{exporting && data && (
				<ExportDialog
					current={{
						...data,
						classes: data.classes.map(item => ({
							...item,
							assignments: edits[item.oid] ?? item.assignments
						}))
					}}
					recent={recent.data}
					schedule={schedule.data}
					terms={file?.terms ?? null}
					onClose={() => setExporting(false)}
					onError={notify}
				/>
			)}
			<Footer commit={commit} stage>
				{data && (
					<button type="button" onClick={openExport}>
						Export
					</button>
				)}
			</Footer>
			<Snackbar snack={snack} onClose={() => setSnack(null)} />
		</div>
	);
};
