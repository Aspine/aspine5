import { useState } from "preact/hooks";
import { BELL_SCHEDULES, LUNCHES, type Lunch } from "@/config";
import type { ScheduleRow } from "@/lib/types";
import { Table } from "./Templates";

export type ScheduleDay = "B" | "S" | null;

type Entry = ScheduleRow & { period: string };

export type Slot = { name: string; time: string; entry: Entry | null };

const DAYS: readonly (readonly [string, ScheduleDay])[] = [
	["Monday (Silver)", "S"],
	["Tuesday (Black)", "B"],
	["Wednesday (Silver/Black)", null],
	["Thursday (Silver)", "S"],
	["Friday (Black)", "B"]
];

const SEMESTERS = ["S1", "S2"] as const;

const LUNCH_KEY = "aspineLunch";

const COLUMNS = [
	{ label: "Period" },
	{ label: "Time" },
	{ label: "Room" },
	{ label: "Class" }
];

export const scheduleFor = (
	rows: ScheduleRow[],
	semester: string,
	day: ScheduleDay
): Entry[] =>
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

const periodNumber = (entry: Entry) => /\d+/.exec(entry.period)?.[0] ?? "";

export const timedSchedule = (
	entries: Entry[],
	dayIndex: number,
	lunch: Lunch
): Slot[] => {
	if (entries.length === 0) return [];
	const blocks =
		BELL_SCHEDULES[dayIndex < 3 ? "mondayToWednesday" : "thursdayFriday"][
			lunch
		];
	const timed = blocks.flatMap(([name, start, end]): Slot[] => {
		const time = `${start}–${end}`;
		if (!/^\d+$/.test(name)) return [{ name, time, entry: null }];
		const entry = entries.find(item => periodNumber(item) === name);
		return entry ? [{ name: entry.period, time, entry }] : [];
	});
	const untimed = entries
		.filter(entry => !blocks.some(([name]) => name === periodNumber(entry)))
		.map(entry => ({ name: entry.period, time: "", entry }));
	return [...timed, ...untimed];
};

const todayIndex = () => {
	const index = new Date().getDay() - 1;
	return DAYS[index] ? index : 0;
};

const readLunch = (): Lunch => {
	try {
		const saved = localStorage.getItem(LUNCH_KEY);
		return LUNCHES.find(lunch => lunch === saved) ?? "A";
	} catch {
		return "A";
	}
};

export const Schedule = ({ rows }: { rows: ScheduleRow[] }) => {
	const [dayIndex, setDayIndex] = useState(todayIndex);
	const [lunch, setLunch] = useState(readLunch);
	const day = DAYS[dayIndex]?.[1] ?? null;

	const chooseLunch = (next: Lunch) => {
		setLunch(next);
		try {
			localStorage.setItem(LUNCH_KEY, next);
		} catch {
			return;
		}
	};

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
				<select
					class="select"
					aria-label="Lunch"
					value={lunch}
					onChange={event =>
						chooseLunch(event.currentTarget.value as Lunch)
					}
				>
					{LUNCHES.map(option => (
						<option key={option} value={option}>
							Lunch {option}
						</option>
					))}
				</select>
			</div>
			<div class="scheduleGrid">
				{SEMESTERS.map(semester => (
					<div key={semester} class="panel">
						<div class="panelBar">
							<h2 class="panelTitle">{semester}</h2>
						</div>
						<Table
							columns={COLUMNS}
							rows={timedSchedule(
								scheduleFor(rows, semester, day),
								dayIndex,
								lunch
							).map(slot => [
								slot.name,
								slot.time,
								slot.entry?.room ?? "",
								slot.entry ? (
									<>
										{slot.entry.name}
										<small>
											{[
												slot.entry.teacher,
												slot.entry.course
											]
												.filter(Boolean)
												.join(" · ")}
										</small>
									</>
								) : (
									""
								)
							])}
						/>
					</div>
				))}
			</div>
		</>
	);
};
