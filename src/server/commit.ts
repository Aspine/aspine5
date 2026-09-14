import { execFileSync } from "node:child_process";

const readCommit = () => {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], {
			stdio: ["ignore", "pipe", "ignore"]
		})
			.toString()
			.trim();
	} catch {
		return null;
	}
};

export const COMMIT = readCommit();
