import { useEffect, useState } from "preact/hooks";

export type ApiState<T> = { data: T | null; error: string | null };

const cache = new Map<string, unknown>();

export const gradesPath = (year: string, quarter: string) =>
	`/api/grades?${new URLSearchParams({ year, quarter })}`;

export const fetchApi = async <T>(path: string) => {
	if (cache.has(path)) return cache.get(path) as T;
	const response = await fetch(path);
	switch (response.status) {
		case 200: {
			const data = (await response.json()) as T;
			cache.set(path, data);
			return data;
		}
		case 401:
			location.assign("/");
			throw new Error("No session");
		default:
			throw new Error(await response.text());
	}
};

export const useApi = <T>(path: string | null) => {
	const [state, setState] = useState<ApiState<T>>({
		data: path ? ((cache.get(path) as T | undefined) ?? null) : null,
		error: null
	});

	useEffect(() => {
		if (!path) return setState({ data: null, error: null });
		const cached = cache.get(path) as T | undefined;
		if (cached) return setState({ data: cached, error: null });
		setState({ data: null, error: null });
		let alive = true;
		fetchApi<T>(path)
			.then(data => alive && setState({ data, error: null }))
			.catch(
				(error: unknown) =>
					alive &&
					setState({
						data: null,
						error:
							error instanceof Error &&
							!(error instanceof TypeError)
								? error.message
								: "Network error"
					})
			);
		return () => {
			alive = false;
		};
	}, [path]);

	return state;
};
