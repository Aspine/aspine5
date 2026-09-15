import { useState } from "preact/hooks";
import type { ExportFile, RecentData, ScheduleRow, StudentData } from "@/lib/types";
import { fetchApi, gradesPath } from "@/lib/useApi";
import { Modal } from "./Templates";

const EXTRAS = ["Recent", "Schedule"] as const;

const downloadJson = (name: string, value: unknown) => {
	const link = document.createElement("a");
	link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

const isTerm = (value: unknown): value is StudentData => {
	const term = value as Partial<StudentData> | null;
	return (
		typeof term?.quarter === "string" &&
		Array.isArray(term.quarters) &&
		Array.isArray(term.classes) &&
		term.classes.every(item => Array.isArray(item?.assignments) && Array.isArray(item.categories))
	);
};

export const parseExport = (text: string): ExportFile | null => {
	try {
		const parsed = JSON.parse(text) as Partial<ExportFile> | null;
		return parsed && Array.isArray(parsed.terms) && parsed.terms.length > 0 && parsed.terms.every(isTerm)
			? {
					exportedAt: String(parsed.exportedAt ?? ""),
					terms: parsed.terms,
					recent:
						Array.isArray(parsed.recent?.attendance) && Array.isArray(parsed.recent.activity)
							? parsed.recent
							: null,
					schedule: Array.isArray(parsed.schedule) ? parsed.schedule : null
				}
			: null;
	} catch {
		return null;
	}
};

export const ExportDialog = ({
	current,
	recent,
	schedule,
	terms,
	onClose,
	onError
}: {
	current: StudentData;
	recent: RecentData | null;
	schedule: ScheduleRow[] | null;
	terms: StudentData[] | null;
	onClose: () => void;
	onError: (text: string) => void;
}) => {
	const [picked, setPicked] = useState<string[]>([current.quarter, ...EXTRAS]);
	const [busy, setBusy] = useState(false);

	const termFor = (key: string) => (key === current.quarter ? current : terms?.find(term => term.quarter === key));

	const toggle = (key: string) =>
		setPicked(previous => (previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key]));

	const check = (key: string, disabled: boolean) => (
		<label key={key} class="check">
			<input
				type="checkbox"
				checked={picked.includes(key) && !disabled}
				disabled={disabled || busy}
				onChange={() => toggle(key)}
			/>
			{key}
		</label>
	);

	const save = async () => {
		setBusy(true);
		try {
			const exported = await Promise.all(
				current.quarters
					.filter(key => picked.includes(key))
					.map(key => termFor(key) ?? fetchApi<StudentData>(gradesPath(current.year, key)))
			);
			downloadJson(`aspine-${current.year}.json`, {
				exportedAt: new Date().toISOString(),
				terms: exported,
				recent: picked.includes("Recent") ? recent : null,
				schedule: picked.includes("Schedule") ? schedule : null
			} satisfies ExportFile);
			onClose();
		} catch {
			setBusy(false);
			onError("Export failed");
		}
	};

	return (
		<Modal title="Export" onClose={onClose}>
			<form
				class="modalForm"
				onSubmit={event => {
					event.preventDefault();
					void save();
				}}
			>
				<fieldset class="checkList">
					<legend class="sectionTitle">Quarters</legend>
					{current.quarters.map(key =>
						key === current.quarter ? (
							<label key={key} class="check">
								<input type="checkbox" checked disabled />
								{key}
							</label>
						) : (
							check(key, terms !== null && !termFor(key))
						)
					)}
				</fieldset>
				<fieldset class="checkList">
					<legend class="sectionTitle">Include</legend>
					{check("Recent", recent === null)}
					{check("Schedule", schedule === null)}
				</fieldset>
				<button type="submit" class="button primary" disabled={busy}>
					{busy ? "Downloading" : "Export"}
				</button>
			</form>
		</Modal>
	);
};
