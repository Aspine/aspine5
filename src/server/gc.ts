import { GC_INTERVAL_MS } from "@/config";

type Expiring = { expires: number };

const collectors: (() => void)[] = [];

let timer: ReturnType<typeof setInterval> | null = null;

export const sweepExpired = (map: Map<string, Expiring>, now = Date.now()) =>
	map.forEach((entry, key) => entry.expires <= now && map.delete(key));

export const collectable = <M extends Map<string, Expiring>>(map: M): M => {
	collectors.push(() => sweepExpired(map));
	timer ??= setInterval(() => collectors.forEach(collect => collect()), GC_INTERVAL_MS);
	timer.unref?.();
	return map;
};
