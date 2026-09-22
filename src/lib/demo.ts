import { computeGrade } from "@/lib/grades"; // this file is ai generated
import type { Assignment, Category, ClassData, ExportFile, StudentData } from "@/lib/types";

const QUARTERS = ["Q1", "Q2"];

const CLASSES = [
	["AP Calculus BC", "MA501", "FY", "1"],
	["English 11 HN", "EN311", "FY", "2"],
	["Chemistry", "SC201", "S1", "3"],
	["Spanish III", "WL302", "S2", "3"],
	["US History", "SS211", "FY", "4"]
] as const;

const CATEGORIES = [
	["Assessments", 0.5],
	["Classwork", 0.3],
	["Homework", 0.2]
] as const;

const MAX_SCORES = [100, 20, 10];

const date = (month: number, day: number) => `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const categoriesFor = (classIndex: number): Category[] =>
	CATEGORIES.map(([name, weight], index) => ({
		oid: `demo${classIndex}c${index}`,
		name,
		weight
	}));

const assignmentsFor = (classIndex: number, quarterIndex: number): Assignment[] =>
	Array.from({ length: 9 }, (_, index) => {
		const category = categoriesFor(classIndex)[index % 3]!;
		const maxScore = MAX_SCORES[index % 3] ?? 10;
		const percent = 68 + ((classIndex * 11 + quarterIndex * 7 + index * 13) % 33);
		return {
			oid: `demo${classIndex}q${quarterIndex}a${index}`,
			name: `${category.name} ${Math.floor(index / 3) + 1}`,
			categoryOid: category.oid,
			category: category.name,
			score: Math.round((maxScore * percent) / 10) / 10,
			maxScore,
			special: "",
			assigned: date(9 + quarterIndex * 2, 1 + index * 3),
			due: date(9 + quarterIndex * 2, 3 + index * 3),
			feedback: ""
		};
	});

const classFor =
	(quarterIndex: number) =>
	([name]: (typeof CLASSES)[number], classIndex: number): ClassData => ({
		oid: `demo${classIndex}`,
		name,
		teacher: `Teacher ${classIndex + 1}`,
		grades: Object.fromEntries(
			QUARTERS.map((quarter, index) => [
				quarter,
				computeGrade(categoriesFor(classIndex), assignmentsFor(classIndex, index))?.toFixed(2) ?? ""
			])
		),
		inQuarter: true,
		categories: categoriesFor(classIndex),
		assignments: assignmentsFor(classIndex, quarterIndex),
		attendance: { absent: classIndex % 2, tardy: classIndex, dismissed: 0 }
	});

const termFor = (quarterIndex: number): StudentData => ({
	name: "Demo",
	year: "current",
	quarter: QUARTERS[quarterIndex] ?? "Q1",
	quarterOid: `demoQ${quarterIndex}`,
	currentQuarter: "Q2",
	quarters: QUARTERS,
	classes: CLASSES.map(classFor(quarterIndex))
});

export const DEMO_FILE: ExportFile = {
	exportedAt: "",
	terms: QUARTERS.map((_, index) => termFor(index)),
	recent: {
		attendance: [
			{
				date: date(11, 4),
				classname: "Chemistry",
				period: "3",
				event: "Tardy"
			},
			{
				date: date(10, 21),
				classname: "US History",
				period: "4",
				event: "Absent Excused"
			}
		],
		activity: CLASSES.slice(0, 3).flatMap(([name], classIndex) =>
			assignmentsFor(classIndex, 1)
				.slice(0, 2)
				.map(assignment => ({
					date: assignment.due,
					classname: name,
					assignment: assignment.name,
					score: `${assignment.score ?? ""}`
				}))
		)
	},
	schedule: CLASSES.map(([name, course, term, period], index) => ({
		course,
		name,
		term,
		schedule: `${period}(S-B)`,
		room: String(2101 + index * 100),
		teacher: `Teacher ${index + 1}`
	}))
};
