import type { APIRoute } from "astro";
import { getFeature } from "@/server/aspenFeatures";
import { measured } from "@/server/aspenRequest";
import { endSession, sessionLive } from "@/server/session";

export const prerender = false;

export const GET: APIRoute = async ({ params, url, cookies }) => {
	const feature = getFeature(params.feature ?? "");
	const sessionId = cookies.get("aspineSession")?.value;
	const noSession = () => {
		cookies.delete("aspineSession", { path: "/" });
		return new Response("No session", { status: 401 });
	};
	if (!feature) return new Response("Unknown feature", { status: 404 });
	if (!sessionId || !sessionLive(sessionId)) return noSession();
	try {
		const response = await measured(params.feature ?? "", () => feature(sessionId, url.searchParams));
		if (params.feature === "logout") {
			endSession(sessionId);
			cookies.delete("aspineSession", { path: "/" });
		}
		switch (true) {
			case response.status === 401 || response.status === 403:
				return noSession();
			case !response.ok:
				return new Response(`Aspen ${response.status}`, {
					status: 502
				});
		}
		const contentType = response.headers.get("content-type") ?? "text/plain";
		return new Response(response.body, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "no-store",
				...(/html|xml/.test(contentType) && {
					"Content-Security-Policy": "sandbox"
				})
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message === "session") return noSession();
		console.error(params.feature, message);
		return new Response("Error", { status: 502 });
	}
};
