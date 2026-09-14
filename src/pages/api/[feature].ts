import type { APIRoute } from "astro";
import { getFeature } from "@/server/aspen";

export const prerender = false;

export const GET: APIRoute = async ({ params, url, cookies }) => {
	const feature = getFeature(params.feature ?? "");
	const sessionId = cookies.get("aspineSession")?.value;
	if (!feature) return new Response("Unknown feature", { status: 404 });
	if (!sessionId) return new Response("No session", { status: 401 });
	try {
		const response = await feature(sessionId, url.searchParams);
		if (params.feature === "logout")
			cookies.delete("aspineSession", { path: "/" });
		if (!response.ok)
			return new Response(`Aspen ${response.status}`, { status: 502 });
		const contentType =
			response.headers.get("content-type") ?? "text/plain";
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
		console.error(
			params.feature,
			error instanceof Error ? error.message : error
		);
		return new Response("Error", { status: 502 });
	}
};
