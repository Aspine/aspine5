import { useEffect, useState } from "preact/hooks";

type Row = Record<string, unknown>;

type Result = { label: string; body: string };

const KINDS = ["pastDue", "upcoming"];
const STATS_LABEL = />\s*(High|Low|Median|Mean|Average)\s*</i;

const parse = (body: string): unknown => {
	try {
		return JSON.parse(body);
	} catch {
		return null;
	}
};

const rows = (data: unknown) =>
	Array.isArray(data)
		? data.filter(
				(row): row is Row => row !== null && typeof row === "object"
			)
		: [];

export const ApiTester = () => {
	const [results, setResults] = useState<Result[]>([]);

	useEffect(() => {
		const add = (result: Result) =>
			setResults(previous => [...previous, result]);

		const call = async (
			name: string,
			query: Record<string, string> = {},
			label = name
		) => {
			const response = await fetch(
				`/api/${name}?${new URLSearchParams(query)}`
			).catch(() => null);
			const type = response?.headers.get("content-type") ?? "";
			const body = !response
				? "Network error"
				: /pdf|octet-stream/.test(type)
					? `${(await response.arrayBuffer()).byteLength} bytes`
					: await response.text();
			const data = parse(body);
			const detail = Array.isArray(data)
				? ` rows=${data.length}`
				: name === "stats"
					? STATS_LABEL.test(body)
						? " found"
						: " none"
					: "";
			add({
				label: `${label} ${response?.status ?? 0}${detail} ${type}`,
				body: data === null ? body : JSON.stringify(data, null, 2)
			});
			return { body, data };
		};

		const run = async () => {
			await call("student");
			const terms = rows((await call("gradeTerms")).data);
			const classes = rows((await call("classes")).data);
			const firstClass = String(classes[0]?.oid ?? "");
			await call("currentTerm", { classOid: firstClass });
			await call("academics", { classOid: firstClass });

			const assignments: Record<string, string>[] = [];
			for (const term of terms) {
				for (const [index, row] of classes.entries()) {
					for (const kind of KINDS) {
						const query = {
							classOid: String(row.oid),
							termOid: String(term.oid),
							kind
						};
						const { data } = await call(
							"assignments",
							query,
							`assignments ${String(term.gradeTermId)} class${index + 1} ${kind}`
						);
						for (const assignment of rows(data))
							assignments.push({
								classOid: query.classOid,
								termOid: query.termOid,
								assignmentOid: String(assignment.oid)
							});
					}
				}
			}

			await call("recent");
			await call("schedule");
			const reports = rows((await call("reports")).data);
			await call("report", { id: String(reports[0]?.id ?? "") });

			if (assignments.length === 0)
				return add({
					label: "stats skipped, no assignments",
					body: ""
				});
			for (const [index, assignment] of assignments.entries()) {
				const { body } = await call(
					"stats",
					assignment,
					`stats ${index + 1}/${assignments.length}`
				);
				if (STATS_LABEL.test(body)) return;
			}
		};

		void run();
	}, []);

	return (
		<section>
			<h2>API</h2>
			{results.map((result, index) => (
				<details key={index}>
					<summary>{result.label}</summary>
					<pre>{result.body.slice(0, 20_000)}</pre>
				</details>
			))}
		</section>
	);
};
