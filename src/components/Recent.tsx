import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { ClassData, RecentData } from "@/lib/types";
import { Table, Toggle } from "./Templates";

const VIEWS = ["Totals", "Attendance", "Recent Activity"] as const;

type View = (typeof VIEWS)[number];

const ATTENDANCE_COLUMNS = [{ label: "Date" }, { label: "Class" }, { label: "Period" }, { label: "Event" }];

const ACTIVITY_COLUMNS = [
	{ label: "Date" },
	{ label: "Class" },
	{ label: "Assignment" },
	{ label: "Score", numeric: true }
];

const TOTAL_COLUMNS = [
	{ label: "Class" },
	{ label: "Absent", numeric: true },
	{ label: "Tardy", numeric: true },
	{ label: "Dismissed", numeric: true }
];

export const Recent = ({ recent, classes }: { recent: RecentData; classes: ClassData[] }) => {
	const [view, setView] = useState<View>("Totals");

	const tables: Record<View, ComponentChildren> = {
		Attendance: (
			<Table
				columns={ATTENDANCE_COLUMNS}
				rows={recent.attendance.map(entry => [entry.date, entry.classname, entry.period, entry.event])}
			/>
		),
		"Recent Activity": (
			<Table
				columns={ACTIVITY_COLUMNS}
				rows={recent.activity.map(entry => [entry.date, entry.classname, entry.assignment, entry.score])}
			/>
		),
		Totals: (
			<Table
				columns={TOTAL_COLUMNS}
				rows={classes.map(item => [
					item.name,
					item.attendance.absent ?? 0,
					item.attendance.tardy ?? 0,
					item.attendance.dismissed ?? 0
				])}
			/>
		)
	};

	return (
		<div class="panel">
			<div class="panelBar">
				<Toggle options={VIEWS} value={view} onChange={setView} />
			</div>
			{tables[view]}
		</div>
	);
};
