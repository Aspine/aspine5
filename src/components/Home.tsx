import { LogOut, Moon, Sun } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
	GPA_KEYS,
	averageGpa,
	classGrade,
	computeGpa,
	parseNumber,
	type Gpa,
	type GpaKey
} from "@/lib/grades";
import type {
	Assignment,
	ExportFile,
	RecentData,
	Report,
	ScheduleRow,
	StudentData
} from "@/lib/types";
import { useApi, type ApiState } from "@/lib/useApi";
import { Grades } from "./Grades";
import { Recent } from "./Recent";
import { Reports } from "./Reports";
import { Schedule } from "./Schedule";
import { Loaded, Menu, Toggle } from "./Templates";

const TABS = ["Grades", "Schedule", "Attendance & Recent", "Reports"] as const;

const GPA_LABELS: Record<GpaKey, string> = {
	percent: "Percent",
	unweighted: "Unweighted",
	weighted: "Weighted"
};

const THEME_KEY = "aspineTheme";

type Tab = (typeof TABS)[number];

type Theme = "light" | "dark";

const Curve = () => (
	<svg
		class="curve"
		viewBox="0 0 69.09 42"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<path d="M0 0H69.09C26.15 0 41.26 42 0 42Z" fill="currentColor" />
	</svg>
);

const readTheme = (): Theme => {
	const chosen = document.documentElement.dataset.theme;
	return chosen === "light" ||
		(!chosen && matchMedia("(prefers-color-scheme: light)").matches)
		? "light"
		: "dark";
};

const ThemeToggle = () => {
	const [theme, setTheme] = useState<Theme>("dark");

	useEffect(() => setTheme(readTheme()), []);

	const toggle = () => {
		const next = theme === "light" ? "dark" : "light";
		document.documentElement.dataset.theme = next;
		setTheme(next);
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch {
			return;
		}
	};

	return (
		<button
			type="button"
			class="chromeIcon"
			aria-label="Toggle theme"
			title="Theme"
			onClick={toggle}
		>
			{theme === "light" ? (
				<Moon size={19} aria-hidden="true" />
			) : (
				<Sun size={19} aria-hidden="true" />
			)}
		</button>
	);
};

const fromFile = <T,>(data: T | null): ApiState<T> => ({
	data,
	error: data ? null : "Not in file"
});

const downloadJson = (name: string, value: unknown) => {
	const link = document.createElement("a");
	link.href = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
	);
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

export const Home = () => {
	const [tab, setTab] = useState<Tab>("Grades");
	const [year, setYear] = useState<"current" | "previous">("current");
	const [quarter, setQuarter] = useState("");
	const [gpaKey, setGpaKey] = useState<GpaKey>("percent");
	const [edits, setEdits] = useState<Record<string, Assignment[]>>({});
	const [imported, setImported] = useState<ExportFile | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const live = {
		grades: useApi<StudentData>(
			`/api/grades?${new URLSearchParams({ year, quarter })}`
		),
		recent: useApi<RecentData>("/api/recent"),
		schedule: useApi<ScheduleRow[]>("/api/schedule"),
		reports: useApi<Report[]>("/api/reports")
	};
	const grades = imported ? fromFile(imported.grades) : live.grades;
	const recent = imported ? fromFile(imported.recent) : live.recent;
	const schedule = imported ? fromFile(imported.schedule) : live.schedule;
	const data = grades.data;

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

	const formatGpa = (gpa: Gpa | null) =>
		gpa === null ? "–" : gpa[gpaKey].toFixed(2);

	const editClass = (classOid: string, assignments: Assignment[]) =>
		setEdits(previous => ({ ...previous, [classOid]: assignments }));

	const load = (nextYear: typeof year, nextQuarter: string) => {
		setImported(null);
		setImportError(null);
		setYear(nextYear);
		setQuarter(nextQuarter);
		setEdits({});
	};

	const exportData = () =>
		data &&
		downloadJson(`aspine-${data.year}-${data.quarter}.json`, {
			exportedAt: new Date().toISOString(),
			grades: {
				...data,
				classes: data.classes.map(item => ({
					...item,
					assignments: edits[item.oid] ?? item.assignments
				}))
			},
			recent: recent.data,
			schedule: schedule.data
		} satisfies ExportFile);

	const importData = async (file: File) => {
		try {
			const parsed = JSON.parse(await file.text()) as ExportFile;
			if (!Array.isArray(parsed.grades?.classes))
				throw new Error("invalid");
			setImported(parsed);
			setImportError(null);
			setEdits({});
		} catch {
			setImportError("Invalid file");
		}
	};

	const logout = async () => {
		await fetch("/api/logout").catch(() => null);
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
						onEdit={editClass}
						onReset={() => setEdits({})}
						onExport={exportData}
					/>
				)}
			</Loaded>
		],
		[
			"Schedule",
			<Loaded state={schedule}>
				{loaded => <Schedule rows={loaded} />}
			</Loaded>
		],
		[
			"Attendance & Recent",
			<Loaded state={recent}>
				{loaded => (
					<Recent recent={loaded} classes={data?.classes ?? []} />
				)}
			</Loaded>
		],
		[
			"Reports",
			<Loaded state={live.reports}>
				{loaded => <Reports reports={loaded} />}
			</Loaded>
		]
	];

	return (
		<div class="home">
			<header class="chrome">
				<div class="chromeSection" data-layer="0">
					<span class="brand">aspine v5</span>
					<Curve />
				</div>
				<div class="chromeSection" data-layer="1">
					<Menu
						label={
							imported
								? "Imported"
								: year === "current"
									? "Current Year"
									: "Previous Year"
						}
						groups={[
							[
								{
									label: "Current Year",
									detail: "",
									checked: !imported && year === "current",
									onSelect: () => load("current", "")
								},
								{
									label: "Previous Year",
									detail: "",
									checked: !imported && year === "previous",
									onSelect: () => load("previous", "")
								}
							],
							[
								{
									label: "Import Data",
									detail: "",
									checked: imported !== null,
									onSelect: () => fileInput.current?.click()
								}
							]
						]}
					/>
					<Menu
						label={
							data
								? `${data.quarter} · ${formatGpa(gpaFor(data.quarter))}`
								: "GPA"
						}
						groups={
							data
								? [
										data.quarters.map(key => ({
											label:
												key === data.currentQuarter
													? `${key} (current)`
													: key,
											detail: formatGpa(gpaFor(key)),
											checked: key === data.quarter,
											...(imported
												? {}
												: {
														onSelect: () =>
															load(year, key)
													})
										})),
										[
											{
												label: "Cumulative",
												detail: formatGpa(
													averageGpa(
														data.quarters.flatMap(
															key =>
																gpaFor(key) ??
																[]
														)
													)
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
							const file = event.currentTarget.files?.[0];
							if (file) void importData(file);
							event.currentTarget.value = "";
						}}
					/>
					<Curve />
				</div>
				<nav class="chromeSection" data-layer="2" aria-label="Tabs">
					<Toggle
						options={TABS}
						value={tab}
						variant="tab"
						onChange={setTab}
					/>
					<Curve />
				</nav>
				<div class="chromeSection" data-layer="3">
					<ThemeToggle />
					<button
						type="button"
						class="chromeIcon"
						aria-label="Logout"
						title="Logout"
						onClick={logout}
					>
						<LogOut size={19} aria-hidden="true" />
					</button>
				</div>
			</header>
			<main class="viewport">
				{importError && <p class="status error">{importError}</p>}
				{panels.map(([name, content]) => (
					<section key={name} hidden={tab !== name}>
						{content}
					</section>
				))}
			</main>
		</div>
	);
};
