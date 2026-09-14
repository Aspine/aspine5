import type { APIRoute } from "astro";
import { continueLogin, startLogin } from "@/server/login";

export const prerender = false;

const NO_STORE = { "Cache-Control": "no-store" };

export const POST: APIRoute = async ({ request, cookies }) => {
	try {
		const { username, password, loginId, answer } =
			(await request.json()) as Record<string, string>;
		const result = loginId
			? await continueLogin(loginId, answer!, password!)
			: await startLogin(username!, password!);
		if ("sessionId" in result)
			cookies.set("aspineSession", result.sessionId, {
				httpOnly: true,
				sameSite: "strict",
				secure: import.meta.env.PROD,
				path: "/api"
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
