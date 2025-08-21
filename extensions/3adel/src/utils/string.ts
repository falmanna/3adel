export function e164Format(phone: string): string {
	if (!phone) {
		throw new Error("Phone number is required");
	}

	// Remove all non-digit characters except '+'
	let formatted = phone.trim().replace(/[^\d+]/g, "");

	// Ensure starts with '+'
	if (!formatted.startsWith("+")) {
		formatted = "+" + formatted;
	}

	// Validate length (including '+')
	if (formatted.length < 8 || formatted.length > 16) {
		throw new Error("Invalid phone number length for E.164 format");
	}

	// Validate format
	if (!/^\+[1-9]\d{1,14}$/.test(formatted)) {
		throw new Error("Invalid E.164 format");
	}

	return formatted;
}

//try to parse an amount string in the format SAR 123,456.78
export function tryParseSarAmount(amount: string): number | undefined {
	if (!amount.startsWith("SAR")) {
		return undefined;
	}
	return parseFloat(amount.replace("SAR", "").replace(/,/g, ""));
}