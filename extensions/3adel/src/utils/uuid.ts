import { v5 as uuidv5 } from "uuid";

const UUID_NAMESPACE = "de64f11d-7c5a-467c-a883-b1ee5449344c";

export function deterministicUUID(input: string) {
	return uuidv5(input, UUID_NAMESPACE);
}

export function generateRandomReferenceId(length: number): string {
	const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	return Array.from({ length }, () => CHARACTERS.charAt(Math.floor(Math.random() * CHARACTERS.length))).join("");
}
