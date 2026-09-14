import { useState } from "preact/hooks";
import {
	BELL_SCHEDULE,
	LUNCH_BY_FLOOR,
	LUNCH_PERIOD,
	LUNCHES,
	type Lunch
} from "@/config";
import type { ScheduleRow } from "@/lib/types";
import { Table } from "./Templates";

export type ScheduleDay = "B" | "S" | null;

type Entry = ScheduleRow & { period: string };

type LunchChoice = Lunch | "Auto";

export type Slot = { name: string; time: string; entry: Entry | null };

const DAYS: readonly (readonly [string, ScheduleDay])[] = [
	["Monday (Silver)", "S"],
	["Tuesday (Black)", "B"],
	["Wednesday (Silver/Black)", null],
	["Thursday (Silver)", "S"],
	["Friday (Black)", "B"]
];

const SEMESTERS = ["S1", "S2"] as const;

const LUNCH_CHOICES: readonly LunchChoice[] = ["Auto", ...LUNCHES];

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

const periodNumber = (entry: Entry) => {
	const digits = /\d+/.exec(entry.period)?.[0];
	return digits ? String(Number(digits)) : "";
};

export const lunchFor = (entries: Entry[]): Lunch | null => {
	const room =
		entries.find(entry => periodNumber(entry) === LUNCH_PERIOD)?.room ?? "";
	const floor = /(?:^|\D)(\d)\d{3}(?!\d)/.exec(room)?.[1];
	return floor ? (LUNCH_BY_FLOOR[floor] ?? null) : null;
};

export const timedSchedule = (entries: Entry[], lunch: Lunch): Slot[] => {
	if (entries.length === 0) return [];
	const blocks = BELL_SCHEDULE[lunch];
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

const readLunch = (): LunchChoice => {
	try {
		const saved = localStorage.getItem(LUNCH_KEY);
		return LUNCH_CHOICES.find(choice => choice === saved) ?? "Auto";
	} catch {
		return "Auto";
	}
};

export const Schedule = ({ rows }: { rows: ScheduleRow[] }) => {
	const [dayIndex, setDayIndex] = useState(todayIndex);
	const [choice, setChoice] = useState(readLunch);
	const day = DAYS[dayIndex]?.[1] ?? null;

	const choose = (next: LunchChoice) => {
		setChoice(next);
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
					value={choice}
					onChange={event =>
						choose(event.currentTarget.value as LunchChoice)
					}
				>
					{LUNCH_CHOICES.map(option => (
						<option key={option} value={option}>
							{option === "Auto"
								? "Auto lunch"
								: `Lunch ${option}`}
						</option>
					))}
				</select>
			</div>
			<div class="scheduleGrid">
				{SEMESTERS.map(semester => {
					const entries = scheduleFor(rows, semester, day);
					const detected = lunchFor(entries);
					const lunch =
						choice === "Auto" ? (detected ?? LUNCHES[0]) : choice;
					return (
						<div key={semester} class="panel">
							<div class="panelBar">
								<h2 class="panelTitle">{semester}</h2>
								<span class="panelDetail">
									{choice === "Auto" && detected
										? `Lunch ${lunch} · auto`
										: `Lunch ${lunch}`}
								</span>
							</div>
							<Table
								columns={COLUMNS}
								rows={timedSchedule(entries, lunch).map(
									slot => [
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
									]
								)}
							/>
						</div>
					);
				})}
			</div>
		</>
	);
};
