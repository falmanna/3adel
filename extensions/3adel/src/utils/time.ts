// yyyy-MM-dd'T'HH:mm:ssz
export function formatDateWithOffset(date: Date): string {
	const year = date.getFullYear();
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");
	const seconds = date.getSeconds().toString().padStart(2, "0");

	const timezoneOffset = date.getTimezoneOffset();
	const offsetSign = timezoneOffset > 0 ? "-" : "+";
	const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60)
		.toString()
		.padStart(2, "0");
	const offsetMinutes = (Math.abs(timezoneOffset) % 60).toString().padStart(2, "0");
	const formattedOffset = `${offsetSign}${offsetHours}${offsetMinutes}`;

	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${formattedOffset}`;
}

export function dateDiffInSeconds(date1: Date, date2: Date): number {
	const diff = date1.getTime() - date2.getTime();
	return diff / 1000;
}

export function getWeekRange(date: Date) {
	const saturday = new Date(date);
	saturday.setDate(date.getDate() - date.getDay() + (date.getDay() === 6 ? 0 : -1));

	const friday = new Date(saturday);
	friday.setDate(saturday.getDate() + 6);

	return { startDate: saturday, endDate: friday };
}

export function getDayRange(date: Date) {
	const startOfDay = new Date(date);
	startOfDay.setHours(0, 0, 0, 0);
	const endOfDay = new Date(date);
	endOfDay.setHours(23, 59, 59, 999);
	return { startDate: startOfDay, endDate: endOfDay };
}

