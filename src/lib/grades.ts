import type { Assignment, Category, ClassData } from "@/lib/types";

export const GPA_KEYS = ["percent", "unweighted", "weighted"] as const;

export type GpaKey = (typeof GPA_KEYS)[number];

export type Gpa = Record<GpaKey, number>;

const LETTERS: readonly (readonly [number, string])[] = [
	[96.5, "A+"],
	[92.5, "A"],
	[89.5, "A-"],
	[86.5, "B+"],
	[82.5, "B"],
	[79.5, "B-"],
	[76.5, "C+"],
	[72.5, "C"],
	[69.5, "C-"],
	[66.5, "D+"],
	[62.5, "D"],
	[59.5, "D-"]
];

const GPA_POINTS: readonly (readonly [number, number])[] = [
	[93, 4],
	[90, 3.7],
	[87, 3.3],
	[83, 3],
	[80, 2.7],
	[77, 2.3],
	[73, 2],
	[70, 1.7],
	[67, 1.3],
	[63, 1],
	[60, 0.7]
];

const sum = (values: number[]) =>
	values.reduce((total, value) => total + value, 0);

const averageOf = (values: number[]) => sum(values) / values.length;

export const parseNumber = (value: string) => {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
};

export const formatPercent = (percent: number | null) =>
	percent === null ? "" : `${percent.toFixed(2)}%`;

export const letterGrade = (percent: number) =>
	LETTERS.find(([minimum]) => percent >= minimum)?.[1] ?? "F";

export const gradeTone = (percent: number | null) =>
	percent === null ? undefined : letterGrade(percent).charAt(0).toLowerCase();

export const formatGrade = (percent: number | null) =>
	percent === null ? "" : `${percent.toFixed(2)} ${letterGrade(percent)}`;

export const assignmentPercent = (assignment: Assignment) =>
	assignment.score !== null && assignment.maxScore
		? (assignment.score / assignment.maxScore) * 100
		: null;

const scored = (assignments: Assignment[]) =>
	assignments.filter(
		(
			assignment
		): assignment is Assignment & {
			score: number;
			maxScore: number;
		} => assignment.score !== null && assignment.maxScore !== null
	);

const pointsPercent = (assignments: Assignment[]) => {
	const graded = scored(assignments);
	const maxScore = sum(graded.map(assignment => assignment.maxScore));
	const score = sum(graded.map(assignment => assignment.score));
	return {
		score: Math.round(score * 100) / 100,
		maxScore: Math.round(maxScore * 100) / 100,
		percent: maxScore > 0 ? (score / maxScore) * 100 : null
	};
};

export const categoryTotals = (
	categories: Category[],
	assignments: Assignment[]
) =>
	categories.map(category => ({
		...category,
		...pointsPercent(
			assignments.filter(
				assignment => assignment.categoryOid === category.oid
			)
		)
	}));

export const computeGrade = (
	categories: Category[],
	assignments: Assignment[]
) => {
	if (categories.length === 0) return pointsPercent(assignments).percent;
	const graded = categoryTotals(categories, assignments).flatMap(total =>
		total.percent === null
			? []
			: [{ weight: total.weight, percent: total.percent }]
	);
	const weight = sum(graded.map(total => total.weight));
	return weight > 0
		? sum(graded.map(total => total.percent * total.weight)) / weight
		: null;
};

export const classGrade = (
	item: ClassData,
	quarter: string,
	edited?: Assignment[]
) => {
	const aspen = parseNumber(item.grades[quarter] ?? "");
	if (!edited)
		return aspen ?? computeGrade(item.categories, item.assignments);
	const baseline = computeGrade(item.categories, item.assignments);
	const current = computeGrade(item.categories, edited);
	return aspen === null || baseline === null || current === null
		? (current ?? aspen)
		: aspen + current - baseline;
};

const gpaPoints = (percent: number) =>
	GPA_POINTS.find(([minimum]) => percent >= minimum)?.[1] ?? 0;

const weightBonus = (name: string) =>
	/\bAP\b/.test(name) ? 1 : /\bHN\b/.test(name) ? 0.5 : 0;

export const computeGpa = (
	entries: { name: string; percent: number | null }[]
): Gpa | null => {
	const graded = entries.flatMap(entry =>
		entry.percent === null
			? []
			: [{ name: entry.name, percent: entry.percent }]
	);
	if (graded.length === 0) return null;
	return {
		percent: averageOf(graded.map(entry => Math.min(entry.percent, 100))),
		unweighted: averageOf(graded.map(entry => gpaPoints(entry.percent))),
		weighted: averageOf(
			graded.map(
				entry => gpaPoints(entry.percent) + weightBonus(entry.name)
			)
		)
	};
};

export const averageGpa = (gpas: Gpa[]) =>
	gpas.length === 0
		? null
		: (Object.fromEntries(
				GPA_KEYS.map(key => [key, averageOf(gpas.map(gpa => gpa[key]))])
			) as Gpa);
