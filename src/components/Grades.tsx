import { Hammer, Info, Plus, Trash2 } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import {
	assignmentPercent,
	categoryTotals,
	classGrade,
	formatGrade,
	formatPercent,
	gradeTone,
	parseNumber
} from "@/lib/grades";
import type { Assignment, AssignmentStats, Category, ClassData, StudentData } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Modal, Table } from "./Templates";

export type EditClass = (classOid: string, change: (assignments: Assignment[]) => Assignment[]) => void;

export type DeleteAssignment = (classOid: string, assignment: Assignment, index: number) => void;

type Dialog = { kind: "corrections" | "info"; assignment: Assignment };

type StatsContext = { classOid: string; quarterOid: string; year: string };

const ADDED_PREFIX = "added";

const CLASS_COLUMNS = [{ label: "Class" }, { label: "Grade", numeric: true }];

const CATEGORY_COLUMNS = [
	{ label: "Category" },
	{ label: "Weight", numeric: true },
	{ label: "Score", numeric: true },
	{ label: "Max Score", numeric: true },
	{ label: "Percentage", numeric: true }
];

const ASSIGNMENT_COLUMNS = [
	{ label: "Assignment" },
	{ label: "Category" },
	{ label: "Score", numeric: true },
	{ label: "Max Score", numeric: true },
	{ label: "Percentage", numeric: true },
	{ label: "", icon: true },
	{ label: "", icon: true },
	{ label: "", icon: true }
];

const isAdded = (assignment: Assignment) => assignment.oid.startsWith(ADDED_PREFIX);

const blankAssignment = (category: Category | undefined): Assignment => ({
	oid: `${ADDED_PREFIX}${Date.now()}`,
	name: "New assignment",
	categoryOid: category?.oid ?? "",
	category: category?.name ?? "",
	score: null,
	maxScore: 10,
	special: "",
	assigned: "",
	due: "",
	feedback: ""
});

const NumberInput = ({
	label,
	value,
	onValue
}: {
	label: string;
	value: number | null;
	onValue: (value: number | null) => void;
}) => (
	<input
		class="cellInput numeric"
		aria-label={label}
		inputmode="decimal"
		value={value ?? ""}
		onChange={event => onValue(parseNumber(event.currentTarget.value))}
	/>
);

const IconButton = ({
	label,
	onClick,
	children
}: {
	label: string;
	onClick: () => void;
	children: ComponentChildren;
}) => (
	<button type="button" class="iconButton" aria-label={label} title={label} onClick={onClick}>
		{children}
	</button>
);

const AssignmentRow = ({
	assignment,
	categories,
	onUpdate,
	onRemove,
	onDialog
}: {
	assignment: Assignment;
	categories: Category[];
	onUpdate: (patch: Partial<Assignment>) => void;
	onRemove: () => void;
	onDialog: (dialog: Dialog) => void;
}) => {
	const percent = assignmentPercent(assignment);
	return (
		<tr>
			<td>
				<input
					class="cellInput"
					aria-label="Assignment"
					value={assignment.name}
					onChange={event => onUpdate({ name: event.currentTarget.value })}
				/>
			</td>
			<td>
				<select
					class="cellInput"
					aria-label="Category"
					value={assignment.categoryOid}
					onChange={event => {
						const category = categories.find(entry => entry.oid === event.currentTarget.value);
						onUpdate({
							categoryOid: category?.oid ?? "",
							category: category?.name ?? ""
						});
					}}
				>
					{categories.map(category => (
						<option key={category.oid} value={category.oid}>
							{category.name}
						</option>
					))}
				</select>
			</td>
			<td>
				<NumberInput label="Score" value={assignment.score} onValue={score => onUpdate({ score })} />
			</td>
			<td>
				<NumberInput
					label="Max Score"
					value={assignment.maxScore}
					onValue={maxScore => onUpdate({ maxScore })}
				/>
			</td>
			<td class="numeric">
				<span data-tone={gradeTone(percent)}>{formatPercent(percent) || assignment.special}</span>
			</td>
			<td class="iconCell">
				{assignment.score !== null && (
					<IconButton label="Test corrections" onClick={() => onDialog({ kind: "corrections", assignment })}>
						<Hammer size={16} aria-hidden="true" />
					</IconButton>
				)}
			</td>
			<td class="iconCell">
				<IconButton label="Assignment info" onClick={() => onDialog({ kind: "info", assignment })}>
					<Info size={16} aria-hidden="true" />
				</IconButton>
			</td>
			<td class="iconCell">
				<IconButton label="Delete assignment" onClick={onRemove}>
					<Trash2 size={16} aria-hidden="true" />
				</IconButton>
			</td>
		</tr>
	);
};

const CorrectionsDialog = ({
	assignment,
	onApply,
	onClose
}: {
	assignment: Assignment;
	onApply: (score: number) => void;
	onClose: () => void;
}) => (
	<Modal title="Test Corrections" onClose={onClose}>
		<form
			class="modalForm"
			onSubmit={event => {
				event.preventDefault();
				const redeemable = parseNumber(String(new FormData(event.currentTarget).get("redeemable") ?? ""));
				if (redeemable !== null && assignment.score !== null && assignment.maxScore !== null)
					onApply(assignment.score + ((assignment.maxScore - assignment.score) * redeemable) / 100);
				onClose();
			}}
		>
			<label class="field">
				<span>Redeemable %</span>
				<input class="input" name="redeemable" inputmode="decimal" autofocus />
			</label>
			<button type="submit" class="button primary">
				Apply
			</button>
		</form>
	</Modal>
);

const StatsPlot = ({ stats, assignment }: { stats: AssignmentStats; assignment: Assignment }) => {
	const at = (value: number) => Math.min(100, Math.max(0, (value / (assignment.maxScore || 100)) * 100));
	return (
		<div class="statsPlot" aria-hidden="true">
			<span
				class="statsRange"
				style={{
					left: `${at(stats.low)}%`,
					width: `${at(stats.high) - at(stats.low)}%`
				}}
			/>
			<span class="statsMark" style={{ left: `${at(stats.median)}%` }} />
			{assignment.score !== null && <span class="statsMark score" style={{ left: `${at(assignment.score)}%` }} />}
		</div>
	);
};

const InfoDialog = ({
	assignment,
	context,
	onClose
}: {
	assignment: Assignment;
	context: StatsContext | null;
	onClose: () => void;
}) => {
	const response = useApi<{ stats: AssignmentStats | null }>(
		!context || isAdded(assignment)
			? null
			: `/api/stats?${new URLSearchParams({
					classOid: context.classOid,
					termOid: context.quarterOid,
					assignmentOid: assignment.oid,
					year: context.year
				})}`
	);
	const stats = response.data?.stats;
	const statsRows: [string, string][] = stats
		? [
				["Low", String(stats.low)],
				["Median", String(stats.median)],
				["High", String(stats.high)],
				["Mean", String(stats.mean)]
			]
		: [];

	return (
		<Modal title={assignment.name} onClose={onClose}>
			{stats ? (
				<StatsPlot stats={stats} assignment={assignment} />
			) : (
				context &&
				!isAdded(assignment) && (
					<p class="muted">{response.error ?? (response.data ? "No stats" : "Loading stats")}</p>
				)
			)}
			<dl class="details">
				{[
					...statsRows,
					["Score", `${assignment.score ?? (assignment.special || "–")} / ${assignment.maxScore ?? "–"}`],
					["Category", assignment.category || "–"],
					["Date Assigned", assignment.assigned || "–"],
					["Date Due", assignment.due || "–"],
					["Feedback", assignment.feedback || "None"]
				].map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
		</Modal>
	);
};

const ClassDetail = ({
	item,
	grade,
	context,
	edited,
	onEdit,
	onDelete
}: {
	item: ClassData;
	grade: number | null;
	context: StatsContext | null;
	edited: Assignment[] | undefined;
	onEdit: EditClass;
	onDelete: DeleteAssignment;
}) => {
	const [categoryOid, setCategoryOid] = useState<string | null>(null);
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const assignments = edited ?? item.assignments;
	const category = item.categories.find(entry => entry.oid === categoryOid);
	const shown = category ? assignments.filter(assignment => assignment.categoryOid === category.oid) : assignments;

	const update = (oid: string, patch: Partial<Assignment>) =>
		onEdit(item.oid, list =>
			list.map(assignment => (assignment.oid === oid ? { ...assignment, ...patch } : assignment))
		);

	const add = () => onEdit(item.oid, list => [blankAssignment(category ?? item.categories[0]), ...list]);

	return (
		<div class="panel">
			<div class="panelBar">
				<h2 class="panelTitle">{item.name}</h2>
				{item.teacher && <span class="panelDetail">{item.teacher}</span>}
				<span class="panelActions panelGrade" data-tone={gradeTone(grade)}>
					{formatGrade(grade) || "–"}
				</span>
			</div>

			{item.categories.length > 0 && (
				<Table columns={CATEGORY_COLUMNS}>
					{categoryTotals(item.categories, assignments).map(total => (
						<tr
							key={total.oid}
							class="clickable"
							aria-selected={total.oid === categoryOid}
							onClick={() => setCategoryOid(total.oid === categoryOid ? null : total.oid)}
						>
							<td>{total.name}</td>
							<td class="numeric">{Math.round(total.weight * 100)}%</td>
							<td class="numeric">{total.score}</td>
							<td class="numeric">{total.maxScore}</td>
							<td class="numeric">
								<span data-tone={gradeTone(total.percent)}>{formatPercent(total.percent)}</span>
							</td>
						</tr>
					))}
				</Table>
			)}

			<div class="panelBar">
				<h2 class="panelTitle">Assignments</h2>
				<span class="panelDetail">{category ? `${category.name} - ${shown.length}` : shown.length}</span>
				<div class="panelActions">
					<IconButton label="Add assignment" onClick={add}>
						<Plus size={16} aria-hidden="true" />
					</IconButton>
				</div>
			</div>

			{shown.length === 0 ? (
				<p class="panelEmpty">None</p>
			) : (
				<Table columns={ASSIGNMENT_COLUMNS}>
					{shown.map(assignment => (
						<AssignmentRow
							key={assignment.oid}
							assignment={assignment}
							categories={item.categories}
							onUpdate={patch => update(assignment.oid, patch)}
							onRemove={() => onDelete(item.oid, assignment, assignments.indexOf(assignment))}
							onDialog={setDialog}
						/>
					))}
				</Table>
			)}

			{dialog?.kind === "corrections" && (
				<CorrectionsDialog
					assignment={dialog.assignment}
					onApply={score => update(dialog.assignment.oid, { score })}
					onClose={() => setDialog(null)}
				/>
			)}
			{dialog?.kind === "info" && (
				<InfoDialog assignment={dialog.assignment} context={context} onClose={() => setDialog(null)} />
			)}
		</div>
	);
};

export const Grades = ({
	data,
	edits,
	stats,
	onEdit,
	onDelete,
	onReset
}: {
	data: StudentData;
	edits: Record<string, Assignment[]>;
	stats: boolean;
	onEdit: EditClass;
	onDelete: DeleteAssignment;
	onReset: () => void;
}) => {
	const [selectedOid, setSelectedOid] = useState<string | null>(null);
	const classes = data.classes.filter(item => item.inQuarter);
	const selected = classes.find(item => item.oid === selectedOid);

	return (
		<div class="stack">
			<div class="panel">
				<div class="panelBar">
					<h2 class="panelTitle">Classes</h2>
					<span class="panelDetail">{data.quarter}</span>
					<div class="panelActions">
						<button
							type="button"
							class="button"
							disabled={Object.keys(edits).length === 0}
							onClick={onReset}
						>
							Reset
						</button>
					</div>
				</div>
				<Table columns={CLASS_COLUMNS}>
					{classes.map(item => {
						const edited = edits[item.oid];
						const grade = classGrade(item, data.quarter, edited);
						return (
							<tr
								key={item.oid}
								class="clickable"
								aria-selected={item.oid === selectedOid}
								onClick={() => setSelectedOid(item.oid === selectedOid ? null : item.oid)}
							>
								<td class="className">{item.name}</td>
								<td class="numeric">
									{grade === null ? (
										<span class="muted">–</span>
									) : (
										<span data-tone={gradeTone(grade)}>{formatGrade(grade)}</span>
									)}
									{edited && (
										<small>Aspen {formatGrade(classGrade(item, data.quarter)) || "–"}</small>
									)}
								</td>
							</tr>
						);
					})}
				</Table>
			</div>
			{selected && (
				<ClassDetail
					key={selected.oid}
					item={selected}
					grade={classGrade(selected, data.quarter, edits[selected.oid])}
					context={
						stats
							? {
									classOid: selected.oid,
									quarterOid: data.quarterOid,
									year: data.year
								}
							: null
					}
					edited={edits[selected.oid]}
					onEdit={onEdit}
					onDelete={onDelete}
				/>
			)}
		</div>
	);
};
