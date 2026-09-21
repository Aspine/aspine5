import { useEffect, useState } from "preact/hooks";
import { BELL_SCHEDULE, LUNCH_BY_FLOOR, LUNCH_PERIOD, LUNCHES, type Lunch } from "@/config";
import type { ScheduleRow } from "@/lib/types";
import { Table } from "./Templates";

export type ScheduleDay = "B" | "S" | null;

type Entry = ScheduleRow & { period: string };

type LunchChoice = Lunch | "Auto";

export type Slot = {
	name: string;
	time: string;
	start: number;
	end: number;
	entry: Entry | null;
};

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

const CLOCK_MS = 30_000;

const COLUMNS = [{ label: "Period" }, { label: "Time" }, { label: "Room" }, { label: "Class" }];

export const scheduleFor = (rows: ScheduleRow[], semester: string, day: ScheduleDay): Entry[] =>
	rows
		.flatMap(row => {
			if (row.term !== semester && row.term !== "FY") return [];
			const segment = row.schedule.includes("[")
				? (new RegExp(`\\[${semester}\\]\\s*([^\\[]+)`).exec(row.schedule)?.[1] ?? "")
				: row.schedule;
			const [, period = "", days = ""] = /^\s*(.+?)\((.*?)\)/.exec(segment) ?? [];
			if (!period || (day && !days.split("-").includes(day))) return [];
			return [{ ...row, period: period.trim() }];
		})
		.sort((first, second) => first.period.localeCompare(second.period));

const periodNumber = (entry: Entry) => {
	const digits = /\d+/.exec(entry.period)?.[0];
	return digits ? String(Number(digits)) : "";
};

export const minutesOf = (time: string) => {
	const [hours = 0, minutes = 0] = time.split(":").map(Number);
	return (hours < 7 ? hours + 12 : hours) * 60 + minutes;
};

export const lunchFor = (entries: Entry[]): Lunch | null => {
	const room = entries.find(entry => periodNumber(entry) === LUNCH_PERIOD)?.room ?? "";
	const floor = /(?:^|\D)(\d)\d{3}(?!\d)/.exec(room)?.[1];
	return floor ? (LUNCH_BY_FLOOR[floor] ?? null) : null;
};

export const timedSchedule = (entries: Entry[], lunch: Lunch): Slot[] => {
	if (entries.length === 0) return [];
	const blocks = BELL_SCHEDULE[lunch];
	const timed = blocks.flatMap(([name, from, to]): Slot[] => {
		const slot = {
			time: `${from}–${to}`,
			start: minutesOf(from),
			end: minutesOf(to)
		};
		if (!/^\d+$/.test(name))
			return [
				{
					...slot,
					name: name === "Lunch" ? `Lunch ${lunch}` : name,
					entry: null
				}
			];
		const entry = entries.find(item => periodNumber(item) === name);
		return entry ? [{ ...slot, name: entry.period, entry }] : [];
	});
	const untimed = entries
		.filter(entry => !blocks.some(([name]) => name === periodNumber(entry)))
		.map(entry => ({
			name: entry.period,
			time: "",
			start: -1,
			end: -1,
			entry
		}));
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
	const [now, setNow] = useState(() => new Date());
	const day = DAYS[dayIndex]?.[1] ?? null;
	const minutes = now.getDay() - 1 === dayIndex ? now.getHours() * 60 + now.getMinutes() : -1;

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), CLOCK_MS);
		return () => clearInterval(timer);
	}, []);

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
					onChange={event => setDayIndex(Number(event.currentTarget.value))}
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
					onChange={event => choose(event.currentTarget.value as LunchChoice)}
				>
					{LUNCH_CHOICES.map(option => (
						<option key={option} value={option}>
							{option === "Auto" ? "Auto lunch" : `Lunch ${option}`}
						</option>
					))}
				</select>
			</div>
			<div class="scheduleGrid">
				{SEMESTERS.map(semester => {
					const entries = scheduleFor(rows, semester, day);
					const lunch = choice === "Auto" ? (lunchFor(entries) ?? LUNCHES[0]) : choice;
					const slots = timedSchedule(entries, lunch);
					return (
						<div key={semester} class="panel">
							<div class="panelBar">
								<h2 class="panelTitle">{semester}</h2>
							</div>
							{slots.length === 0 ? (
								<p class="panelEmpty">None</p>
							) : (
								<Table columns={COLUMNS}>
									{slots.map(slot => {
										const current = slot.start <= minutes && minutes < slot.end;
										// this horrible piece of work formats teacher names "Last, First" to "First Last"
										// (sometimes there are multiple teachers and it separates them with a semicolon so even worse)
										const teacherName = slot.entry?.teacher
											.split("; ")
											.map(pair => pair.split(", ").reverse().join(" "))
											.join("; ");
										return (
											<tr
												key={`${slot.name}${slot.time}`}
												class={current ? "currentRow" : undefined}
												aria-current={current ? "time" : undefined}
											>
												<td>{slot.name}</td>
												<td>{slot.time}</td>
												<td>{slot.entry?.room ?? ""}</td>
												<td>
													{slot.entry && (
														<>
															{slot.entry.name}
															<small>
																{[teacherName, slot.entry.course]
																	.filter(Boolean)
																	.join(" - ")}
															</small>
														</>
													)}
												</td>
											</tr>
										);
									})}
								</Table>
							)}
						</div>
					);
				})}
			</div>
		</>
	);
};
