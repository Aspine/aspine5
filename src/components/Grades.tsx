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
import type {
	Assignment,
	AssignmentStats,
	Category,
	ClassData,
	StudentData
} from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Modal, Table } from "./Templates";

type EditClass = (classOid: string, assignments: Assignment[]) => void;

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

const isAdded = (assignment: Assignment) =>
	assignment.oid.startsWith(ADDED_PREFIX);

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
	<button
		type="button"
		class="iconButton"
		aria-label={label}
		onClick={onClick}
	>
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
					onChange={event =>
						onUpdate({ name: event.currentTarget.value })
					}
				/>
			</td>
			<td>
				<select
					class="cellInput"
					aria-label="Category"
					value={assignment.categoryOid}
					onChange={event => {
						const category = categories.find(
							entry => entry.oid === event.currentTarget.value
						);
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
				<NumberInput
					label="Score"
					value={assignment.score}
					onValue={score => onUpdate({ score })}
				/>
			</td>
			<td>
				<NumberInput
					label="Max Score"
					value={assignment.maxScore}
					onValue={maxScore => onUpdate({ maxScore })}
				/>
			</td>
			<td class="numeric" data-tone={gradeTone(percent)}>
				{formatPercent(percent) || assignment.special}
			</td>
			<td class="iconCell">
				{assignment.score !== null && (
					<IconButton
						label="Test corrections"
						onClick={() =>
							onDialog({ kind: "corrections", assignment })
						}
					>
						<Hammer size={16} aria-hidden="true" />
					</IconButton>
				)}
			</td>
			<td class="iconCell">
				<IconButton
					label="Assignment info"
					onClick={() => onDialog({ kind: "info", assignment })}
				>
					<Info size={16} aria-hidden="true" />
				</IconButton>
			</td>
			<td class="iconCell">
				{isAdded(assignment) && (
					<IconButton label="Remove assignment" onClick={onRemove}>
						<Trash2 size={16} aria-hidden="true" />
					</IconButton>
				)}
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
				const redeemable = parseNumber(
					String(
						new FormData(event.currentTarget).get("redeemable") ??
							""
					)
				);
				if (
					redeemable !== null &&
					assignment.score !== null &&
					assignment.maxScore !== null
				)
					onApply(
						assignment.score +
							((assignment.maxScore - assignment.score) *
								redeemable) /
								100
					);
				onClose();
			}}
		>
			<label class="field">
				<span>Redeemable %</span>
				<input
					class="input"
					name="redeemable"
					inputmode="decimal"
					autofocus
				/>
			</label>
			<button type="submit" class="button primary">
				Apply
			</button>
		</form>
	</Modal>
);

const StatsPlot = ({
	stats,
	assignment
}: {
	stats: AssignmentStats;
	assignment: Assignment;
}) => {
	const at = (value: number) =>
		Math.min(
			100,
			Math.max(0, (value / (assignment.maxScore || 100)) * 100)
		);
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
			{assignment.score !== null && (
				<span
					class="statsMark score"
					style={{ left: `${at(assignment.score)}%` }}
				/>
			)}
		</div>
	);
};

const InfoDialog = ({
	assignment,
	context,
	onClose
}: {
	assignment: Assignment;
	context: StatsContext;
	onClose: () => void;
}) => {
	const response = useApi<{ stats: AssignmentStats | null }>(
		isAdded(assignment)
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
				!isAdded(assignment) && (
					<p class="muted">
						{response.error ??
							(response.data ? "No stats" : "Loading stats")}
					</p>
				)
			)}
			<dl class="details">
				{[
					...statsRows,
					[
						"Score",
						`${assignment.score ?? (assignment.special || "–")} / ${assignment.maxScore ?? "–"}`
					],
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
	context,
	edited,
	onEdit
}: {
	item: ClassData;
	context: StatsContext;
	edited: Assignment[] | undefined;
	onEdit: EditClass;
}) => {
	const [categoryOid, setCategoryOid] = useState<string | null>(null);
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const assignments = edited ?? item.assignments;
	const shown = categoryOid
		? assignments.filter(
				assignment => assignment.categoryOid === categoryOid
			)
		: assignments;

	const update = (oid: string, patch: Partial<Assignment>) =>
		onEdit(
			item.oid,
			assignments.map(assignment =>
				assignment.oid === oid
					? { ...assignment, ...patch }
					: assignment
			)
		);

	const remove = (oid: string) =>
		onEdit(
			item.oid,
			assignments.filter(assignment => assignment.oid !== oid)
		);

	const add = () =>
		onEdit(item.oid, [
			blankAssignment(
				item.categories.find(
					category => category.oid === categoryOid
				) ?? item.categories[0]
			),
			...assignments
		]);

	const assignmentColumns = [
		{ label: "Assignment" },
		{ label: "Category" },
		{ label: "Score", numeric: true },
		{ label: "Max Score", numeric: true },
		{ label: "Percentage", numeric: true },
		{ label: <Hammer size={16} aria-label="Corrections" />, icon: true },
		{ label: <Info size={16} aria-label="Info" />, icon: true },
		{
			label: (
				<IconButton label="Add assignment" onClick={add}>
					<Plus size={16} aria-hidden="true" />
				</IconButton>
			),
			icon: true
		}
	];

	return (
		<>
			{item.categories.length > 0 && (
				<Table columns={CATEGORY_COLUMNS}>
					{categoryTotals(item.categories, assignments).map(total => (
						<tr
							key={total.oid}
							class="clickable"
							aria-selected={total.oid === categoryOid}
							onClick={() =>
								setCategoryOid(
									total.oid === categoryOid ? null : total.oid
								)
							}
						>
							<td>{total.name}</td>
							<td class="numeric">
								{Math.round(total.weight * 100)}%
							</td>
							<td class="numeric">{total.score}</td>
							<td class="numeric">{total.maxScore}</td>
							<td
								class="numeric"
								data-tone={gradeTone(total.percent)}
							>
								{formatPercent(total.percent)}
							</td>
						</tr>
					))}
				</Table>
			)}

			<Table columns={assignmentColumns}>
				{shown.map(assignment => (
					<AssignmentRow
						key={assignment.oid}
						assignment={assignment}
						categories={item.categories}
						onUpdate={patch => update(assignment.oid, patch)}
						onRemove={() => remove(assignment.oid)}
						onDialog={setDialog}
					/>
				))}
			</Table>

			{dialog?.kind === "corrections" && (
				<CorrectionsDialog
					assignment={dialog.assignment}
					onApply={score => update(dialog.assignment.oid, { score })}
					onClose={() => setDialog(null)}
				/>
			)}
			{dialog?.kind === "info" && (
				<InfoDialog
					assignment={dialog.assignment}
					context={context}
					onClose={() => setDialog(null)}
				/>
			)}
		</>
	);
};

export const Grades = ({
	data,
	edits,
	onEdit,
	onReset,
	onExport
}: {
	data: StudentData;
	edits: Record<string, Assignment[]>;
	onEdit: EditClass;
	onReset: () => void;
	onExport: () => void;
}) => {
	const [selectedOid, setSelectedOid] = useState<string | null>(null);
	const classes = data.classes.filter(item => item.inQuarter);
	const selected = classes.find(item => item.oid === selectedOid);

	return (
		<>
			<div class="gradesButtons">
				<button type="button" class="button" onClick={onExport}>
					Export
				</button>
				<button
					type="button"
					class="button"
					disabled={Object.keys(edits).length === 0}
					onClick={onReset}
				>
					Reset
				</button>
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
							onClick={() =>
								setSelectedOid(
									item.oid === selectedOid ? null : item.oid
								)
							}
						>
							<td class="className">{item.name}</td>
							<td class="numeric" data-tone={gradeTone(grade)}>
								{formatGrade(grade)}
								{edited && (
									<small>
										Aspen{" "}
										{formatGrade(
											classGrade(item, data.quarter)
										) || "–"}
									</small>
								)}
							</td>
						</tr>
					);
				})}
			</Table>
			{selected && (
				<ClassDetail
					key={selected.oid}
					item={selected}
					context={{
						classOid: selected.oid,
						quarterOid: data.quarterOid,
						year: data.year
					}}
					edited={edits[selected.oid]}
					onEdit={onEdit}
				/>
			)}
		</>
	);
};
