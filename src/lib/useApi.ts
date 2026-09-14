import { useEffect, useState } from "preact/hooks";

export type ApiState<T> = { data: T | null; error: string | null };

const cache = new Map<string, unknown>();

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
		const settle = (next: ApiState<T>) => alive && setState(next);
		fetch(path)
			.then(async response => {
				switch (response.status) {
					case 200: {
						const data = (await response.json()) as T;
						cache.set(path, data);
						return settle({ data, error: null });
					}
					case 401:
						return location.assign("/");
					default:
						return settle({
							data: null,
							error: await response.text()
						});
				}
			})
			.catch(() => settle({ data: null, error: "Network error" }));
		return () => {
			alive = false;
		};
	}, [path]);

	return state;
};
