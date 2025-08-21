import { createError } from "@directus/errors";
import { AxiosError } from "axios";

export const ServiceUnavailableError = createError(
	"SERVICE_UNAVAILABLE",
	"Service jwt unavailable. Couldn't verify token.",
	503,
);
export const TokenExpiredError = createError("TOKEN_EXPIRED", "Token expired.", 401);
export const InvalidCredentialsError = createError("INVALID_CREDENTIALS", "Invalid user credentials.", 401);
export const InvalidTokenError = createError("INVALID_TOKEN", "Invalid token.", 403);
export const InvalidPayload = createError("BAD_REQUEST", "Invalid payload.", 400);

export function operationForbiddenError(message: string) {
	return new (createError("OPERATION_FORBIDDEN", message, 403))();
}

export function errorFromMessage(message: string, status: number) {
	return new (createError("CUSTOM_ERROR", message, status))();
}

export const logError = (error: unknown, context: string) => {
	console.error(`Error ${context}:`, error);
	if (error instanceof Error) {
		console.error("Error details:", error.message);
	}
	if (error instanceof AxiosError) {
		console.error("Error status:", error.response?.status);
		console.error("Error message:", error.response?.statusText);
		if (error.response?.data?.error_details) {
			console.error("Error details:", error.response.data.error_details);
		} else if (error.response?.data) {
			console.error("Error data:", error.response.data);
		}
	}
};
