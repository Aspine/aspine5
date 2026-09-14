import { useState } from "preact/hooks";
import type { Report } from "@/lib/types";

export const Reports = ({ reports }: { reports: Report[] }) => {
	const pdfs = reports.filter(report => report.contentTypeId === "cttPdf");
	const [id, setId] = useState(pdfs[0]?.id ?? "");
	const selected = pdfs.find(report => report.id === id);
	const source = `/api/report?${new URLSearchParams({ id })}`;

	if (!selected) return <p class="muted">None</p>;

	return (
		<div class="reports">
			<ul class="reportList">
				{pdfs.map(report => (
					<li key={report.id}>
						<button
							type="button"
							class="reportItem"
							title={report.filename}
							aria-pressed={report.id === id}
							onClick={() => setId(report.id)}
						>
							{report.filename}
						</button>
					</li>
				))}
			</ul>
			<div>
				<div class="toolbar reportBar">
					<span class="muted">{selected.filename}</span>
					<a class="button" href={source} download>
						Download
					</a>
				</div>
				<iframe class="reportFrame" title="Report" src={source} />
			</div>
		</div>
	);
};
