export type Assignment = {
	oid: string;
	name: string;
	categoryOid: string;
	category: string;
	score: number | null;
	maxScore: number | null;
	special: string;
	assigned: string;
	due: string;
	feedback: string;
};

export type Category = { oid: string; name: string; weight: number };

export type ClassData = {
	oid: string;
	name: string;
	teacher: string;
	grades: Record<string, string>;
	inQuarter: boolean;
	categories: Category[];
	assignments: Assignment[];
	attendance: Record<string, number>;
};

export type StudentData = {
	name: string;
	year: "current" | "previous";
	quarter: string;
	quarterOid: string;
	currentQuarter: string | null;
	quarters: string[];
	classes: ClassData[];
};

export type AttendanceEvent = {
	date: string;
	classname: string;
	period: string;
	event: string;
};

export type ActivityEvent = {
	date: string;
	classname: string;
	assignment: string;
	score: string;
};

export type RecentData = {
	attendance: AttendanceEvent[];
	activity: ActivityEvent[];
};

export type ScheduleRow = {
	course: string;
	name: string;
	term: string;
	schedule: string;
	room: string;
	teacher: string;
};

export type Report = { id: string; filename: string; contentTypeId: string };

export type AssignmentStats = {
	high: number;
	low: number;
	median: number;
	mean: number;
};

export type ExportFile = {
	exportedAt: string;
	grades: StudentData;
	recent: RecentData | null;
	schedule: ScheduleRow[] | null;
};
