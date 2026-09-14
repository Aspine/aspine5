import { Download } from "lucide-preact";
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
			<div class="panel reportPanel">
				<div class="panelBar">
					<h2 class="panelTitle">Reports</h2>
					<span class="panelDetail">{pdfs.length}</span>
				</div>
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
			</div>
			<div class="panel reportPanel reportView">
				<div class="panelBar">
					<h2 class="panelTitle" title={selected.filename}>
						{selected.filename}
					</h2>
					<div class="panelActions">
						<a
							class="iconButton"
							href={source}
							download
							aria-label="Download"
							title="Download"
						>
							<Download size={16} aria-hidden="true" />
						</a>
					</div>
				</div>
				<iframe class="reportFrame" title="Report" src={source} />
			</div>
		</div>
	);
};
