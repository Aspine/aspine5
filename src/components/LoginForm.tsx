import { ArrowRight, LoaderCircle } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { WARM_LOGIN_TTL_MS } from "@/config";

type LoginResponse = { sessionId: string } | { loginId: string; captcha: string } | { error: string };

let warmedAt = -Infinity;

const warmLogin = () => {
	if (Date.now() - warmedAt < WARM_LOGIN_TTL_MS / 2) return;
	warmedAt = Date.now();
	void fetch("/api/login", { method: "PUT" }).catch(() => null);
};

export const LoginForm = () => {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [answer, setAnswer] = useState("");
	const [response, setResponse] = useState<LoginResponse | null>(null);
	const [pending, setPending] = useState(false);
	const form = useRef<HTMLFormElement>(null);
	const answerInput = useRef<HTMLInputElement>(null);

	// If the response is a captcha, store it (else null)
	const captcha = (response) && ("loginId" in response) ? response : null;

	useEffect(() => {
		if (captcha) answerInput.current?.focus();
	}, [captcha?.loginId]);

	useEffect(() => {
		const rewarm = () =>
			document.visibilityState === "visible" && form.current?.contains(document.activeElement) && warmLogin();
		document.addEventListener("visibilitychange", rewarm);
		addEventListener("focus", rewarm);
		return () => {
			document.removeEventListener("visibilitychange", rewarm);
			removeEventListener("focus", rewarm);
		};
	}, []);

	const submit = async (event: Event) => {
		event.preventDefault();
		setPending(true);
		const body = captcha ? { loginId: captcha.loginId, answer, password } : { username, password };
		const result = await fetch("/api/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		})
			.then(reply => reply.json() as Promise<LoginResponse>)
			.catch(() => ({ error: "Network error" }));
		if ("sessionId" in result) return location.assign("/home");
		setResponse(result);
		setAnswer("");
		setPending(false);
	};

	return (
		<form ref={form} class="loginForm" onSubmit={submit}>
			{captcha ? (
				<>
					<img class="captchaImage" src={captcha.captcha} alt="Captcha" />
					<label class="field">
						<span>Captcha</span>
						<input
							ref={answerInput}
							class="input"
							autocomplete="off"
							autocapitalize="off"
							spellcheck={false}
							required
							disabled={pending}
							value={answer}
							onInput={event => setAnswer(event.currentTarget.value)}
						/>
					</label>
				</>
			) : (
				<>
					<label class="field">
						<span>School email</span>
						<input
							class="input"
							type="email"
							autocomplete="username"
							required
							disabled={pending}
							value={username}
							onFocus={warmLogin}
							onInput={event => {
								warmLogin();
								setUsername(event.currentTarget.value);
							}}
						/>
					</label>
					<label class="field">
						<span>Password</span>
						<input
							class="input"
							type="password"
							autocomplete="current-password"
							required
							disabled={pending}
							value={password}
							onFocus={warmLogin}
							onInput={event => {
								warmLogin();
								setPassword(event.currentTarget.value);
							}}
						/>
					</label>
				</>
			)}
			{response && "error" in response && (
				<p class="loginError" role="alert">
					{response.error}
				</p>
			)}
			<button class="button primary" type="submit" disabled={pending}>
				{/** Signing in if button pressed, Continue if captcha, Sign in if normal */}
				{pending ? "Signing in..." : (captcha ? "Continue" : "Sign in")} 
				{pending && <LoaderCircle class="spinner" size={18} aria-hidden="true" />}
				{!pending && <ArrowRight size={18} aria-hidden="true" />}
				
			</button>
			{captcha && !pending && (
				<button class="button ghost" type="button" onClick={() => setResponse(null)}>
					Back
				</button>
			)}
		</form>
	);
};
