import type { APIRoute } from "astro";
import { getFeature } from "@/server/aspenFeatures";
import { measured } from "@/server/aspenRequest";

export const prerender = false;

const NO_SESSION = () => new Response("No session", { status: 401 });

export const GET: APIRoute = async ({ params, url, cookies }) => {
	const feature = getFeature(params.feature ?? "");
	const sessionId = cookies.get("aspineSession")?.value;
	if (!feature) return new Response("Unknown feature", { status: 404 });
	if (!sessionId) return NO_SESSION();
	try {
		const response = await measured(params.feature ?? "", () => feature(sessionId, url.searchParams));
		if (params.feature === "logout") cookies.delete("aspineSession", { path: "/" });
		switch (true) {
			case response.status === 401 || response.status === 403:
				return NO_SESSION();
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
		if (message === "session") return NO_SESSION();
		console.error(params.feature, message);
		return new Response("Error", { status: 502 });
	}
};
