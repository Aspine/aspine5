import { useState } from "preact/hooks";
import type { ScheduleRow } from "@/lib/types";
import { Table } from "./Templates";

export type ScheduleDay = "B" | "S" | null;

const DAYS: readonly (readonly [string, ScheduleDay])[] = [
	["Monday (Silver)", "S"],
	["Tuesday (Black)", "B"],
	["Wednesday (Silver/Black)", null],
	["Thursday (Silver)", "S"],
	["Friday (Black)", "B"]
];

const SEMESTERS = ["S1", "S2"] as const;

const COLUMNS = [{ label: "Period" }, { label: "Room" }, { label: "Class" }];

export const scheduleFor = (
	rows: ScheduleRow[],
	semester: string,
	day: ScheduleDay
) =>
	rows
		.flatMap(row => {
			if (row.term !== semester && row.term !== "FY") return [];
			const segment = row.schedule.includes("[")
				? (new RegExp(`\\[${semester}\\]\\s*([^\\[]+)`).exec(
						row.schedule
					)?.[1] ?? "")
				: row.schedule;
			const [, period = "", days = ""] =
				/^\s*(.+?)\((.*?)\)/.exec(segment) ?? [];
			if (!period || (day && !days.split("-").includes(day))) return [];
			return [{ ...row, period: period.trim() }];
		})
		.sort((first, second) => first.period.localeCompare(second.period));

const todayIndex = () => {
	const index = new Date().getDay() - 1;
	return DAYS[index] ? index : 0;
};

export const Schedule = ({ rows }: { rows: ScheduleRow[] }) => {
	const [dayIndex, setDayIndex] = useState(todayIndex);
	const day = DAYS[dayIndex]?.[1] ?? null;

	return (
		<>
			<div class="toolbar">
				<select
					class="select"
					aria-label="Day"
					value={dayIndex}
					onChange={event =>
						setDayIndex(Number(event.currentTarget.value))
					}
				>
					{DAYS.map(([label], index) => (
						<option key={label} value={index}>
							{label}
						</option>
					))}
				</select>
			</div>
			<div class="scheduleGrid">
				{SEMESTERS.map(semester => (
					<div key={semester}>
						<h2 class="sectionTitle">{semester}</h2>
						<Table
							columns={COLUMNS}
							rows={scheduleFor(rows, semester, day).map(
								entry => [
									entry.period,
									entry.room,
									<>
										{entry.name}
										<small>
											{[entry.teacher, entry.course]
												.filter(Boolean)
												.join(" · ")}
										</small>
									</>
								]
							)}
						/>
					</div>
				))}
			</div>
		</>
	);
};
