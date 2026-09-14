import { useState } from "preact/hooks";
import { ApiTester } from "./ApiTester";

type LoginResponse =
	| { sessionId: string }
	| { loginId: string; captcha: string }
	| { error: string };

export const LoginForm = () => {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [answer, setAnswer] = useState("");
	const [response, setResponse] = useState<LoginResponse | null>(null);
	const [pending, setPending] = useState(false);

	const captcha = response && "loginId" in response ? response : null;

	const submit = async (event: Event) => {
		event.preventDefault();
		setPending(true);
		const body = captcha
			? { loginId: captcha.loginId, answer, password }
			: { username, password };
		const result = await fetch("/api/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		})
			.then(reply => reply.json() as Promise<LoginResponse>)
			.catch(() => ({ error: "Network error" }));
		setResponse(result);
		setAnswer("");
		setPending(false);
	};

	if (response && "sessionId" in response)
		return (
			<>
				<p>
					JSESSIONID <code>{response.sessionId}</code>
				</p>
				<ApiTester />
			</>
		);

	return (
		<form onSubmit={submit}>
			{captcha ? (
				<p>
					<img src={captcha.captcha} alt="Captcha" />
					<input
						placeholder="Captcha"
						autocomplete="off"
						required
						value={answer}
						onInput={event => setAnswer(event.currentTarget.value)}
					/>
				</p>
			) : (
				<p>
					<input
						type="email"
						placeholder="School email"
						autocomplete="username"
						required
						value={username}
						onInput={event =>
							setUsername(event.currentTarget.value)
						}
					/>
					<input
						type="password"
						placeholder="Password"
						autocomplete="current-password"
						required
						value={password}
						onInput={event =>
							setPassword(event.currentTarget.value)
						}
					/>
				</p>
			)}
			{response && "error" in response && <p>{response.error}</p>}
			<button type="submit" disabled={pending}>
				{pending ? "..." : "Login"}
			</button>
		</form>
	);
};
