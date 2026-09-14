import type { APIRoute } from "astro";
import { continueLogin, loginAllowed, startLogin } from "@/server/login";

export const prerender = false;

const NO_STORE = { "Cache-Control": "no-store" };

const addressOf = (context: Parameters<APIRoute>[0]) => {
	try {
		return context.clientAddress;
	} catch {
		return "";
	}
};

export const POST: APIRoute = async context => {
	const { request, cookies, url } = context;
	try {
		const { username, password, loginId, answer } =
			(await request.json()) as Record<string, string>;
		if (!loginId && !loginAllowed(addressOf(context)))
			return Response.json(
				{ error: "Too many attempts" },
				{ status: 429, headers: NO_STORE }
			);
		const result = loginId
			? await continueLogin(loginId, answer!, password!)
			: await startLogin(username!, password!);
		if ("sessionId" in result)
			cookies.set("aspineSession", result.sessionId, {
				httpOnly: true,
				sameSite: "lax",
				secure: url.protocol === "https:",
				path: "/"
			});
		return Response.json(result, { headers: NO_STORE });
	} catch (error) {
		console.error("login", error instanceof Error ? error.message : error);
		return Response.json(
			{ error: "Login failed" },
			{ status: 401, headers: NO_STORE }
		);
	}
};
