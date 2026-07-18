var pagamentos = [
	new Date("2026-01-04T12:00:00"),
	new Date("2026-02-05T12:00:00"),
	new Date("2026-03-06T12:00:00"),
	new Date("2026-04-05T12:00:00"),
	new Date("2026-05-06T12:00:00"),
	new Date("2026-06-05T12:00:00"),
	new Date("2026-07-05T12:00:00"),
	new Date("2026-08-05T12:00:00"),
	new Date("2026-09-04T12:00:00"),
	new Date("2026-10-05T12:00:00"),
	new Date("2026-11-06T12:00:00"),
	new Date("2026-12-04T12:00:00"),
];

var feriados = [
	new Date("2026-01-01T16:55:00"),
	new Date("2026-03-01T17:55:00"),
	new Date("2026-03-20T17:55:00"),
	new Date("2026-04-18T17:55:00"),
	new Date("2026-04-30T17:55:00"),
	new Date("2026-06-19T17:55:00"),
	new Date("2026-09-06T17:55:00"),
	new Date("2026-10-09T17:55:00"),
	new Date("2026-10-30T17:55:00"),
	new Date("2026-11-19T17:55:00"),
];

var expedientePadrao = {
	startTime: "08:00",
	endTime: "17:55",
	daysOfWeek: [1, 2, 3, 4, 5],
};

function localDateId(date) {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function localDateTime(date) {
	return `${localDateId(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

var GENERAL_CONFIG_SEED = [
	{
		id: "workday",
		type: "workday",
		...expedientePadrao,
	},
	...pagamentos.map((date) => ({
		id: `payment-${localDateId(date)}`,
		type: "payment",
		dateTime: localDateTime(date),
	})),
	...feriados.map((date) => ({
		id: `holiday-${localDateId(date)}`,
		type: "holiday",
		dateTime: localDateTime(date),
	})),
];

if (typeof window !== "undefined") {
	window.GENERAL_CONFIG_SEED = GENERAL_CONFIG_SEED;
}
