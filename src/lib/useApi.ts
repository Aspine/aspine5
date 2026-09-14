import { useEffect, useState } from "preact/hooks";

export type ApiState<T> = {
	data: T | null;
	error: string | null;
	loading: boolean;
};

type Options = { persist?: boolean; wait?: boolean };

const STORE_PREFIX = "aspineData:";

const cache = new Map<string, unknown>();

export const gradesPath = (year: string, quarter: string) =>
	`/api/grades?${new URLSearchParams({ year, quarter })}`;

const readStored = <T>(path: string) => {
	try {
		const stored = localStorage.getItem(`${STORE_PREFIX}${path}`);
		return stored ? (JSON.parse(stored) as T) : null;
	} catch {
		return null;
	}
};

let storing = true;

const writeStored = (path: string, data: unknown) => {
	if (!storing) return;
	try {
		localStorage.setItem(`${STORE_PREFIX}${path}`, JSON.stringify(data));
	} catch {
		return;
	}
};

export const clearStored = () => {
	storing = false;
	try {
		Object.keys(localStorage)
			.filter(key => key.startsWith(STORE_PREFIX))
			.forEach(key => localStorage.removeItem(key));
	} catch {
		return;
	}
};

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

const messageOf = (error: unknown) =>
	error instanceof Error && !(error instanceof TypeError)
		? error.message
		: "Network error";

export const useApi = <T>(
	path: string | null,
	{ persist = false, wait = false }: Options = {}
) => {
	const [state, setState] = useState<ApiState<T>>({
		data: path ? ((cache.get(path) as T | undefined) ?? null) : null,
		error: null,
		loading: path !== null && !cache.has(path)
	});

	useEffect(() => {
		if (!path) return setState({ data: null, error: null, loading: false });
		const cached = cache.get(path) as T | undefined;
		if (cached)
			return setState({ data: cached, error: null, loading: false });
		setState({
			data: persist ? readStored<T>(path) : null,
			error: null,
			loading: true
		});
		if (wait) return;
		let alive = true;
		fetchApi<T>(path)
			.then(data => {
				if (persist) writeStored(path, data);
				if (alive) setState({ data, error: null, loading: false });
			})
			.catch((error: unknown) => {
				if (alive)
					setState(previous => ({
						data: previous.data,
						error: messageOf(error),
						loading: false
					}));
			});
		return () => {
			alive = false;
		};
	}, [path, wait]);

	return state;
};
