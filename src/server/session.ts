import { SESSION_TTL_MS } from "@/config";
import { collectable } from "@/server/gc";

const sessions = collectable(new Map<string, { expires: number }>());

export const startSession = (sessionId: string, now = Date.now()) =>
	sessions.set(sessionId, { expires: now + SESSION_TTL_MS });

export const endSession = (sessionId: string) => sessions.delete(sessionId);

export const sessionLive = (sessionId: string | undefined, now = Date.now()) => {
	if (!sessionId) return false;
	const entry = sessions.get(sessionId);
	if (!entry) return false;
	if (entry.expires <= now) {
		sessions.delete(sessionId);
		return false;
	}
	entry.expires = now + SESSION_TTL_MS;
	return true;
};
