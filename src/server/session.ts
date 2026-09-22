import { SESSION_TTL_MS } from "@/config";

const sessions = new Map<string, number>();

const sweep = (now: number) => sessions.forEach((expires, id) => expires <= now && sessions.delete(id));

export const startSession = (sessionId: string, now = Date.now()) => {
	sweep(now);
	sessions.set(sessionId, now + SESSION_TTL_MS);
};

export const endSession = (sessionId: string) => sessions.delete(sessionId);

export const sessionLive = (sessionId: string | undefined, now = Date.now()) => {
	if (!sessionId) return false;
	const expires = sessions.get(sessionId);
	if (expires === undefined) return false;
	if (expires <= now) {
		sessions.delete(sessionId);
		return false;
	}
	sessions.set(sessionId, now + SESSION_TTL_MS);
	return true;
};
